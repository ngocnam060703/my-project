const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const Service = require("../models/Service");
const ServiceRegistration = require("../models/ServiceRegistration");
const LaundryUsage = require("../models/LaundryUsage");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const RoomService = require("../models/RoomService");
const Room = require("../models/Room");
const User = require("../models/User");
const { getIO } = require("../socket");
const { dueDateForBillingMonth } = require("../services/billingDueDate");
const { refreshOverdueMonthlyBills } = require("../services/billingOverdue");
const { ensureBillCodesForList, assignBillCodeIfMissing } = require("../services/billCodeGenerator");
const { settleBillAtCounter, settleBillViaVnpay, canSettleBillStatus } = require("../services/billPaymentService");
const { closeMeterPeriodForRoom } = require("../services/meterBillingService");
const { creditUserWallet } = require("../services/walletCreditService");
const { resolveContractEntitledRoomId } = require("../services/contractResidenceSync");
const { countEffectiveResidentsByRoom } = require("../services/roomOccupancySync");
const {
  voidSupersededMonthlyBillsForUser,
} = require("../services/monthlyBillTransferSync");
const {
  buildBillPaymentUrl,
  verifyReturnQuery,
  parseBillIdFromTxnRef,
  getClientReturnBaseUrl,
} = require("../services/vnpayGateway");
const { effectiveContractPrice } = require("../services/contractPricing");
const { evaluateTransferOldBillDeletion } = require("../services/roomTransferService");
const {
  loadMeterServicesAssignedToRoom,
  applyRoomMeterAssignment,
  buildUtilityShareResolver,
  resolveRoomUtilityFeesForBilling,
} = require("../services/roomUtilityBilling");

function isStudentUser(user) {
  const role = String(user?.role || "");
  return role === "user" || role === "student";
}

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isContractExpired(endDate, currentDate) {
  if (!endDate) return true;
  const end = toStartOfDay(endDate);
  const now = toStartOfDay(currentDate);
  return end < now;
}

/** Số SV đang ở phòng (HĐ active hiệu lực) — dùng chia DV phòng chung / điện nước. */
async function getActiveOccupantCountByRoomIds(roomIds) {
  const unique = [
    ...new Set(
      (roomIds || [])
        .map((id) => String(id || ""))
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  if (!unique.length) return new Map();
  const heldMap = await countEffectiveResidentsByRoom(unique);
  const m = new Map();
  for (const id of unique) {
    const c = heldMap.get(String(id));
    if (c != null) m.set(String(id), Math.max(1, c));
  }
  return m;
}

function billOccupantDivisor(occupants) {
  const n = Number(occupants);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

function applyLiveOccupantsToBill(plain, countByRoom) {
  const billType = plain.billType || "monthly";
  if (billType !== "monthly") return plain;
  const rid = String(plain.room?._id || plain.room || "");
  if (!rid || !countByRoom.has(rid)) return plain;
  plain.occupants = countByRoom.get(rid);
  return plain;
}

async function enrichBillsForResponse(bills) {
  const arr = Array.isArray(bills) ? bills : [bills];
  for (const bill of arr) {
    if (bill?.save) {
      await restoreAutoWalletDeductionOnUnpaidBill(bill);
      await reconcileRoomFeeFromContractOnUnpaidBill(bill);
      await reconcileSharedCommonFeeOnUnpaidBill(bill);
      await reconcileMeterUtilitiesFromCommonFeeOnUnpaidBill(bill);
    }
  }
  const monthly = arr.filter((b) => !b.billType || b.billType === "monthly");
  const roomIds = monthly.map((b) => String(b.room?._id || b.room || "")).filter(Boolean);
  const countByRoom = await getActiveOccupantCountByRoomIds(roomIds);
  return arr.map((bill) => {
    const plain = bill.toObject ? bill.toObject() : { ...bill };
    plain.note = stripWalletNoteFromBillText(plain.note);
    return applyLiveOccupantsToBill(plain, countByRoom);
  });
}

/**
 * Tiền phòng / 1 sinh viên = giá phòng ÷ số slot (field capacity của phòng).
 * Luôn tính từ price + capacity — không dùng virtual pricePerPerson để tránh lệch khi tạo HĐ.
 * Điện/nước: chỉ khi phòng đã gán DV đồng hồ; chia cho SV đã đăng ký (enabled) DV đó trong kỳ.
 * DV phòng chung (Wi‑Fi, type common): giá theo phòng → chia đều theo số người đang ở.
 */
function roomCapacitySlots(roomLike) {
  const rawSlots = Number(roomLike?.capacity);
  return Number.isFinite(rawSlots) && rawSlots >= 1 ? rawSlots : 1;
}

function computeRoomFeePerSlot(roomLike) {
  const total = Number(roomLike?.price ?? 0);
  return Math.round(total / roomCapacitySlots(roomLike));
}

/** Chỉ hóa đơn tháng — không lẫn phạt / bồi thường / phụ thu chuyển phòng. */
function findMonthlyBillForPeriod(contractId, month, year) {
  return Bill.findOne({
    contract: contractId,
    month,
    year,
    $or: [{ billType: "monthly" }, { billType: { $exists: false } }],
  });
}

/** Tiền phòng tháng = contractPrice (hoặc monthlyRent) trên HĐ đang hiệu lực — không lấy giá phòng/slot. */
function resolveRoomFeeFromActiveContract(contractDoc) {
  const fee = effectiveContractPrice(contractDoc);
  if (fee > 0) return fee;
  const cn = contractDoc?.contractNumber || String(contractDoc?._id || "");
  const err = new Error(`Hợp đồng ${cn} chưa có giá phòng (contractPrice). Vui lòng kiểm tra HĐ trước khi tạo hóa đơn.`);
  err.statusCode = 400;
  throw err;
}

function buildMonthlyBillNote({ contractNumber, contractRoomFee, room, occupants, commonFeeShare }) {
  const parts = [
    `Tiền phòng theo HĐ ${contractNumber || ""} (${Number(contractRoomFee).toLocaleString("vi-VN")}đ)`,
  ];
  if (Number(commonFeeShare) > 0) {
    parts.push(`DV phòng chung ÷ ${occupants} người đang ở`);
  }
  parts.push(
    "điện/nước theo SV đăng ký DV",
    `phí khác ÷ ${occupants} người`,
    "+ DV cá nhân"
  );
  return parts.join("; ");
}

function stripWalletNoteFromBillText(note) {
  return String(note || "")
    .replace(/;\s*đã khấu trừ ví[^;]*/gi, "")
    .trim();
}

/** Hóa đơn chưa trả: hoàn ví nếu trước đó bị khấu trừ tự động khi lập HĐ. */
async function restoreAutoWalletDeductionOnUnpaidBill(bill) {
  if (!bill || bill.status === "paid") return bill;
  const applied = Math.max(0, Math.round(Number(bill.walletCreditApplied) || 0));
  if (applied <= 0) return bill;

  const userId = bill.user?._id || bill.user;
  if (userId) {
    await creditUserWallet(userId, applied, "Hoàn ví — bỏ khấu trừ tự động trên hóa đơn tháng");
  }
  bill.walletCreditApplied = 0;
  bill.total = computeBillTotalFromFeeParts(bill);
  bill.note = stripWalletNoteFromBillText(bill.note);
  bill.markModified?.("note");
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push({
    at: new Date(),
    action: "adjusted",
    amount: Math.round(bill.total),
    note: `Hoàn ${applied.toLocaleString("vi-VN")}đ ví — không khấu trừ tự động; tổng = tạm tính các khoản`,
  });
  if (bill.save) await bill.save();
  return bill;
}

/** Hóa đơn chưa trả: tiền phòng = contractPrice trên HĐ active (không pro-rata). */
async function reconcileRoomFeeFromContractOnUnpaidBill(bill) {
  const billType = bill.billType || "monthly";
  if (billType !== "monthly" || bill.status === "paid") return bill;

  const contractId = bill.contract?._id || bill.contract;
  if (!contractId) return bill;

  const contract = await Contract.findById(contractId);
  if (!contract || String(contract.status) !== "active") return bill;

  let expected;
  try {
    expected = resolveRoomFeeFromActiveContract(contract);
  } catch {
    return bill;
  }

  if (Number(bill.roomFee) === expected) return bill;

  const prev = bill.roomFee;
  bill.roomFee = expected;
  bill.total = computeBillTotalFromFeeParts(bill);
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push({
    at: new Date(),
    action: "adjusted",
    amount: Math.round(bill.total),
    note: `Tiền phòng theo HĐ ${contract.contractNumber || ""}: ${prev} → ${expected}`,
  });
  if (bill.save) await bill.save();
  return bill;
}

/** HĐ active thực sự ở phòng (theo phòng hiệu lực trên HĐ, không chỉ field room cũ). */
async function resolveActiveContractsForRoomBilling(roomId, now = new Date()) {
  const candidates = await Contract.find({
    status: "active",
    endDate: { $gte: toStartOfDay(now) },
  })
    .populate("user", "fullName email")
    .populate("room", "price roomNumber area capacity");

  const out = [];
  for (const c of candidates) {
    const entitled = await resolveContractEntitledRoomId(c);
    if (entitled && String(entitled) === String(roomId)) out.push(c);
  }
  return out;
}

/** Gói DV common (vd: Wi‑Fi/phòng): mỗi SV trả (giá phòng) ÷ số người đang ở */
function buildCommonServicesPerStudent(commonServices, occupantCount) {
  const divisor = billOccupantDivisor(occupantCount);
  const breakdown = [];
  let commonPerStudent = 0;
  for (const s of commonServices) {
    if (String(s.name || "").toLowerCase().includes("tiền phòng")) continue;
    if (isWaterNamedService(s)) continue;
    if (isElectricityNamedService(s)) continue;
    const roomAmt = Number(s.price || 0);
    const perStudent = Math.round(roomAmt / divisor);
    commonPerStudent += perStudent;
    breakdown.push({ service: s._id, name: s.name, unit: s.unit, totalAmount: perStudent });
  }
  return { breakdown, commonPerStudent, divisor };
}

function isWifiNamedService(s) {
  const n = String(s.name || "").toLowerCase();
  return n.includes("wifi") || n.includes("wi-fi") || n.includes("wi fi");
}

/** Nước phòng chung (type common) — đã tính riêng qua waterFee / đồng hồ, không cộng trùng. */
function isWaterNamedService(nameOrService) {
  const n = String(typeof nameOrService === "string" ? nameOrService : nameOrService?.name || "").toLowerCase();
  return n.includes("nước") || n.includes("nuoc") || n === "water";
}

/** Điện phòng chung (type common) — đã tính riêng qua electricityFee / đồng hồ, không cộng trùng. */
function isElectricityNamedService(nameOrService) {
  const n = String(typeof nameOrService === "string" ? nameOrService : nameOrService?.name || "").toLowerCase();
  return n.includes("điện") || n.includes("dien") || n === "electricity" || n === "electric";
}

function isMeterUtilityCommonService(nameOrService) {
  return isWaterNamedService(nameOrService) || isElectricityNamedService(nameOrService);
}

function computeBillTotalFromFeeParts(bill) {
  return (
    Number(bill.roomFee || 0) +
    Number(bill.electricityFee || 0) +
    Number(bill.waterFee || 0) +
    Number(bill.otherFee || 0) +
    Number(bill.sharedCommonFee || 0) +
    Number(bill.personalServiceFee || 0)
  );
}

function stripMeterUtilitiesFromCommonServiceBreakdown(breakdown) {
  return (breakdown || []).filter((it) => !isMeterUtilityCommonService(it));
}

/** Hóa đơn chưa paid: bỏ điện/nước trùng trong DV phòng chung và trừ khỏi tổng. */
async function reconcileMeterUtilitiesFromCommonFeeOnUnpaidBill(bill) {
  const billType = bill.billType || "monthly";
  if (billType !== "monthly" || bill.status === "paid") return bill;

  const original = bill.commonServiceBreakdown || [];
  const filtered = stripMeterUtilitiesFromCommonServiceBreakdown(original);
  if (filtered.length === original.length) return bill;

  const removedItems = original.filter((it) => isMeterUtilityCommonService(it));
  const removedAmount = removedItems.reduce((s, it) => s + Number(it.totalAmount || 0), 0);
  if (removedAmount <= 0) return bill;

  bill.commonServiceBreakdown = filtered;
  bill.sharedCommonFee = filtered.reduce((s, it) => s + Number(it.totalAmount || 0), 0);
  bill.total = computeBillTotalFromFeeParts(bill);
  bill.markModified("commonServiceBreakdown");
  bill.paymentHistory = bill.paymentHistory || [];
  const removedLabels = removedItems.map((it) => `${it.name || "DV"} ${Number(it.totalAmount || 0).toLocaleString("vi-VN")}đ`).join(", ");
  bill.paymentHistory.push({
    at: new Date(),
    action: "adjusted",
    amount: Math.round(bill.total),
    note: `Loại bỏ phí điện/nước trùng trong DV phòng chung (−${removedAmount.toLocaleString("vi-VN")}đ: ${removedLabels})`,
  });
  await bill.save();
  return bill;
}

/** Chỉ DV common đã gán cho phòng (RoomService) — không lấy toàn bộ catalog. */
async function loadCommonServicesAssignedToRoom(roomId) {
  if (!roomId) return [];
  const links = await RoomService.find({ room: roomId, isActive: { $ne: false } }).select("service").lean();
  const serviceIds = links.map((l) => l.service).filter(Boolean);
  if (!serviceIds.length) return [];
  return Service.find({ _id: { $in: serviceIds }, type: "common", isActive: true }).lean();
}

function roomHasAssignedWifiService(commonServices) {
  return commonServices.some(isWifiNamedService);
}

/** Wi‑Fi chỉ tính khi phòng đã gán DV Wi‑Fi và có số tiền nhập/lưu > 0. */
function resolveWifiRoomTotalForBill(commonServices, bodyWifiNum, storedWifiNum) {
  if (!roomHasAssignedWifiService(commonServices)) return null;
  const body = Number(bodyWifiNum);
  if (Number.isFinite(body) && body > 0) return Math.round(body);
  const stored = Number(storedWifiNum || 0);
  if (stored > 0) return Math.round(stored);
  return null;
}

/**
 * Form admin "Tiền Wi‑Fi": tổng gói theo phòng / tháng → mỗi SV trả ÷ số người đang ở.
 */
function resolveCommonFeesForRoom(commonServices, wifiRoomTotalFromBody, occupantCount) {
  const rawWifi =
    wifiRoomTotalFromBody != null && wifiRoomTotalFromBody !== ""
      ? Number(wifiRoomTotalFromBody)
      : NaN;
  const wifiRoomTotal = Number.isFinite(rawWifi) && rawWifi > 0 ? Math.round(rawWifi) : null;
  const divisor = billOccupantDivisor(occupantCount);

  if (wifiRoomTotal != null) {
    const sansWifi = commonServices.filter((s) => !isWifiNamedService(s));
    const built = buildCommonServicesPerStudent(sansWifi, occupantCount);
    const wifiShare = Math.round(wifiRoomTotal / divisor);
    const wifiLine = {
      service: null,
      name: "Wi‑Fi (gói phòng)",
      unit: "monthly",
      totalAmount: wifiShare,
    };
    return {
      breakdown: [...built.breakdown, wifiLine],
      commonPerStudent: built.commonPerStudent + wifiShare,
      divisor,
    };
  }

  return buildCommonServicesPerStudent(commonServices, occupantCount);
}

/** Hóa đơn chưa trả: DV phòng chung chia theo số người đang ở (không theo capacity). */
async function reconcileSharedCommonFeeOnUnpaidBill(bill) {
  const billType = bill.billType || "monthly";
  if (billType !== "monthly" || bill.status === "paid") return bill;

  const roomId = bill.room?._id || bill.room;
  if (!roomId) return bill;

  const heldMap = await countEffectiveResidentsByRoom([roomId]);
  const occupants = Math.max(1, heldMap.get(String(roomId)) ?? (Number(bill.occupants) || 1));

  const commonServices = await loadCommonServicesAssignedToRoom(roomId);
  const prefill = await resolveRoomUtilityFeesForBilling(roomId, bill.month, bill.year).catch(() => null);
  const wifiTotal = resolveWifiRoomTotalForBill(
    commonServices,
    null,
    prefill?.wifiMonthlyFee
  );
  const { breakdown, commonPerStudent } = resolveCommonFeesForRoom(
    commonServices,
    wifiTotal,
    occupants
  );

  const prevShare = Math.round(Number(bill.sharedCommonFee) || 0);
  const prevOcc = Number(bill.occupants) || 0;
  if (prevShare === commonPerStudent && prevOcc === occupants) return bill;

  bill.sharedCommonFee = commonPerStudent;
  bill.commonServiceBreakdown = breakdown;
  bill.occupants = occupants;
  bill.total = computeBillTotalFromFeeParts(bill);
  bill.markModified("commonServiceBreakdown");
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push({
    at: new Date(),
    action: "adjusted",
    amount: Math.round(bill.total),
    note: `DV phòng chung ÷ ${occupants} người đang ở (${prevShare} → ${commonPerStudent})`,
  });
  if (bill.save) await bill.save();
  return bill;
}

async function buildPersonalFeeForUser({ userId, month, year }) {
  const personalServices = await Service.find({ type: "personal", isActive: true });
  if (!personalServices.length) return { total: 0, breakdown: [] };

  const serviceIds = personalServices.map((s) => s._id);
  const exactRegs = await ServiceRegistration.find({
    user: userId,
    month,
    year,
    service: { $in: serviceIds },
  }).populate("service");

  const exactByService = new Map();
  for (const r of exactRegs) {
    exactByService.set(String(r.service?._id || r.service), r);
  }

  const hybridServiceIds = personalServices.filter((s) => s.billingModel === "hybrid").map((s) => s._id);
  const usageByService = new Map();
  if (hybridServiceIds.length) {
    const usageAgg = await LaundryUsage.aggregate([
      { $match: { user: userId, month, year, service: { $in: hybridServiceIds } } },
      { $group: { _id: "$service", total: { $sum: "$quantity" } } },
    ]);
    for (const row of usageAgg) {
      usageByService.set(String(row._id), Number(row.total || 0));
    }
  }

  const breakdown = [];
  let total = 0;
  for (const svc of personalServices) {
    const sid = String(svc._id);
    let reg = exactByService.get(sid);

    // Dịch vụ theo tháng/hybrid: nếu chưa có bản ghi tháng này, lấy đăng ký gần nhất trước đó.
    if (!reg && (svc.unit === "monthly" || svc.billingModel === "hybrid")) {
      reg = await ServiceRegistration.findOne({
        user: userId,
        service: svc._id,
        $or: [{ year: { $lt: year } }, { year, month: { $lte: month } }],
      })
        .sort({ year: -1, month: -1 })
        .populate("service");
    }

    if (!reg) continue;
    let amount = 0;
    let quantity = Number(reg.quantity || 1);
    let planType = reg.planType || "per_use";
    let includedUses = 0;
    let usedCount = 0;
    let overageCount = 0;
    let unitPrice = Number(svc.price || 0);
    if (svc.billingModel === "hybrid") {
      if (!reg.enabled) continue;
      usedCount = Number(usageByService.get(sid) || 0);
      quantity = usedCount;
      if (planType === "monthly_package") {
        const packagePrice = Number(reg.packagePriceSnapshot || svc.monthlyPackagePrice || 0);
        includedUses = Number(reg.includedUsesSnapshot || svc.includedUsesPerMonth || 0);
        overageCount = Math.max(0, usedCount - includedUses);
        amount = packagePrice + overageCount * unitPrice;
      } else {
        amount = usedCount * unitPrice;
      }
    } else if (svc.unit === "monthly") {
      amount = reg.enabled ? Number(svc.price || 0) : 0;
      quantity = 1;
    } else {
      amount = Number(svc.price || 0) * Math.max(0, quantity);
    }
    if (amount <= 0) continue;
    total += amount;
    breakdown.push({
      service: svc._id,
      name: svc.name,
      unit: svc.unit,
      quantity,
      amount,
      planType,
      includedUses,
      usedCount,
      overageCount,
      unitPrice,
    });
  }

  return { total, breakdown };
}

/** Ghi điện/nước (+ tuỳ chọn Wi‑Fi gói phòng) vào RoomMonthlyCost — dùng cho “Tạo theo tháng”. */
async function syncRoomMonthlyUtilityCost({ roomId, month, year, electricityFee, waterFee, wifiMonthlyFee, userId }) {
  const m = Number(month);
  const y = Number(year);
  const elec = Math.max(0, Number(electricityFee || 0));
  const water = Math.max(0, Number(waterFee || 0));
  const $set = {
    electricityFee: elec,
    waterFee: water,
    enteredBy: userId,
  };
  if (wifiMonthlyFee !== undefined && wifiMonthlyFee !== null && wifiMonthlyFee !== "") {
    $set.wifiMonthlyFee = Math.max(0, Math.round(Number(wifiMonthlyFee)));
  }
  await RoomMonthlyCost.findOneAndUpdate(
    { room: roomId, month: m, year: y },
    {
      $set,
      $setOnInsert: {
        room: roomId,
        month: m,
        year: y,
        note: "",
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

exports.getAll = async (req, res) => {
  try {
    await refreshOverdueMonthlyBills();
    const { status, user, room, month, year, billType, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (room) filter.room = room;
    if (month) filter.month = parseInt(month, 10);
    if (year) filter.year = parseInt(year, 10);
    const allowedBillTypes = ["monthly", "penalty", "damage_reimbursement", "transfer_supplement"];
    if (allowedBillTypes.includes(String(billType))) {
      filter.billType = billType;
    }
    if (search && String(search).trim()) {
      const q = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(q, "i");
      const users = await User.find({
        $or: [{ fullName: rx }, { studentId: rx }],
        role: { $in: ["user", "student"] },
        isDeleted: { $ne: true },
      }).select("_id");
      const orConditions = [{ billCode: rx }];
      if (users.length) {
        orConditions.push({ user: { $in: users.map((u) => u._id) } });
      }
      filter.$or = orConditions;
    } else if (user) {
      filter.user = user;
    }
    const bills = await Bill.find(filter)
      .populate("user", "fullName email phone studentId")
      .populate("paidBy", "fullName role")
      .populate("contract", "contractNumber status startDate endDate")
      .populate("room")
      .populate("room.area", "name")
      .populate("violation", "ruleName description fineAmount compensationAmount createdAt")
      .populate("maintenanceReport", "requestCode incidentType description resolutionType")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ year: -1, month: -1, createdAt: -1 });
    await ensureBillCodesForList(bills);
    const billsOut = await enrichBillsForResponse(bills);
    for (let i = 0; i < bills.length; i++) {
      const check = await evaluateTransferOldBillDeletion(bills[i]);
      billsOut[i].canDeleteTransferOldBill = check.allowed;
    }
    const total = await Bill.countDocuments(filter);
    const [summaryAgg] = await Bill.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          unpaidTotal: {
            $sum: {
              $cond: [{ $in: ["$status", ["unpaid", "pending", "overdue"]] }, "$total", 0],
            },
          },
          paidTotal: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$total", 0] },
          },
          unpaidCount: {
            $sum: { $cond: [{ $in: ["$status", ["unpaid", "pending", "overdue"]] }, 1, 0] },
          },
        },
      },
    ]);
    const [allTimeAgg] = await Bill.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, paidTotalAllTime: { $sum: "$total" } } },
    ]);
    res.json({
      bills: billsOut,
      total,
      summary: {
        unpaidTotal: summaryAgg?.unpaidTotal || 0,
        paidTotal: summaryAgg?.paidTotal || 0,
        unpaidCount: summaryAgg?.unpaidCount || 0,
        paidTotalAllTime: allTimeAgg?.paidTotalAllTime || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin: xem tiền phòng theo HĐ active của phòng (preview form tạo HĐ). */
/** Admin: tiền điện/nước phòng theo chỉ số đã nhập (form tạo HĐ tháng). */
exports.getRoomUtilityFees = async (req, res) => {
  try {
    const { roomId, month, year } = req.query;
    if (!mongoose.isValidObjectId(String(roomId || ""))) {
      return res.status(400).json({ message: "roomId không hợp lệ" });
    }
    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    const fees = await resolveRoomUtilityFeesForBilling(roomId, m, y);
    res.json(fees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoomBillingPreview = async (req, res) => {
  try {
    const { roomId } = req.query;
    if (!mongoose.isValidObjectId(String(roomId || ""))) {
      return res.status(400).json({ message: "roomId không hợp lệ" });
    }
    const room = await Room.findById(roomId).select("roomNumber capacity price currentPrice");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const now = new Date();
    const contracts = await Contract.find({
      room: roomId,
      status: "active",
      endDate: { $gte: toStartOfDay(now) },
    })
      .populate("user", "fullName studentId")
      .select("contractNumber contractPrice monthlyRent user")
      .sort({ contractNumber: 1 });

    const lines = contracts.map((c) => ({
      contractId: c._id,
      contractNumber: c.contractNumber || "",
      studentName: c.user?.fullName || "",
      studentId: c.user?.studentId || "",
      roomFee: effectiveContractPrice(c),
    }));

    res.json({
      roomId,
      roomNumber: room.roomNumber || "",
      roomPrice: Math.round(Number(room.currentPrice ?? room.price ?? 0)),
      occupants: lines.length,
      lines,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyBills = async (req, res) => {
  try {
    await refreshOverdueMonthlyBills();
    const bills = await Bill.find({ user: req.user._id })
      .populate("contract", "contractNumber status startDate endDate")
      .populate("paidBy", "fullName role")
      .populate("room")
      .populate("room.area", "name")
      .populate("violation", "ruleName description fineAmount compensationAmount createdAt")
      .populate("maintenanceReport", "requestCode incidentType description resolutionType")
      .sort({ year: -1, month: -1, createdAt: -1 });
    await ensureBillCodesForList(bills);
    const billsOut = await enrichBillsForResponse(bills);
    res.json(billsOut);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { contract, roomId, month, year, electricityFee, waterFee, otherFee, sharedCommonFee: wifiRoomFromForm, dueDate } = req.body;
    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    const due = dueDate ? parseDateOrNull(dueDate) : dueDateForBillingMonth(y, m);
    if (!due) {
      return res.status(400).json({ message: "Hạn thanh toán không hợp lệ" });
    }

    // Luồng mới: tạo hóa đơn theo phòng (khuyến nghị dùng trên UI admin)
    if (roomId) {
      if (!mongoose.isValidObjectId(String(roomId))) {
        return res.status(400).json({ message: "roomId không hợp lệ" });
      }
      const room = await Room.findById(roomId);
      if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

      const now = new Date();
      /** Chỉ HĐ active đang ở đúng phòng (theo phòng hiệu lực trên HĐ) */
      const contracts = await resolveActiveContractsForRoomBilling(roomId, now);
      if (!contracts.length) {
        return res.status(400).json({ message: "Phòng chưa có sinh viên với hợp đồng active (đã ký và còn hạn)" });
      }
      const hasExpired = contracts.some((c) => isContractExpired(c.endDate, now));
      if (hasExpired) {
        return res.status(400).json({ message: "Hợp đồng đã hết hạn, không thể tạo hóa đơn" });
      }

      const occupants = Math.max(
        1,
        (await countEffectiveResidentsByRoom([roomId])).get(String(roomId)) ?? contracts.length
      );
      const utilityPrefill = await resolveRoomUtilityFeesForBilling(roomId, m, y);
      const meters = await loadMeterServicesAssignedToRoom(roomId);
      const elecRaw = utilityPrefill.hasElectricityReading
        ? Math.max(0, Number(electricityFee != null ? electricityFee : utilityPrefill.electricityFee))
        : 0;
      const waterRaw = utilityPrefill.hasWaterReading
        ? Math.max(0, Number(waterFee != null ? waterFee : utilityPrefill.waterFee))
        : 0;
      const { electricityTotal, waterTotal } = applyRoomMeterAssignment(meters, elecRaw, waterRaw);
      const fixedOther = Math.max(0, Number(otherFee || 0));
      const utilityShareFor = await buildUtilityShareResolver(contracts, {
        electricityTotal,
        waterTotal,
        meters,
        month: m,
        year: y,
      });

      const commonServices = await loadCommonServicesAssignedToRoom(roomId);
      const wifiRoomTotalForBill = resolveWifiRoomTotalForBill(
        commonServices,
        wifiRoomFromForm,
        utilityPrefill.wifiMonthlyFee
      );
      const { breakdown: commonBreakdown, commonPerStudent: commonFeeShare } = resolveCommonFeesForRoom(
        commonServices,
        wifiRoomTotalForBill,
        occupants
      );

      const bodyWifiNum = Number(wifiRoomFromForm);
      const hasWifi = roomHasAssignedWifiService(commonServices);
      await syncRoomMonthlyUtilityCost({
        roomId,
        month: m,
        year: y,
        electricityFee: electricityTotal,
        waterFee: waterTotal,
        wifiMonthlyFee:
          hasWifi && Number.isFinite(bodyWifiNum) && bodyWifiNum > 0 ? Math.round(bodyWifiNum) : undefined,
        userId: req.user._id,
      });

      const io = getIO();
      let created = 0;
      let skipped = 0;
      let updated = 0;
      const createdBills = [];
      for (const c of contracts) {
        await voidSupersededMonthlyBillsForUser({
          userId: c.user._id || c.user,
          month: m,
          year: y,
          keepContractId: c._id,
          performedBy: req.user._id,
        });

        const contractRoomFee = resolveRoomFeeFromActiveContract(c);
        const exists = await findMonthlyBillForPeriod(c._id, m, y);
        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month: m, year: y });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;
        const { electShare, waterShare } = utilityShareFor(c);
        const otherShare = fixedOther / occupants;
        const grossTotal =
          contractRoomFee + electShare + waterShare + otherShare + commonFeeShare + personalTotal;

        if (exists) {
          if (exists.status === "paid") {
            skipped += 1;
            continue;
          }
          exists.billType = "monthly";
          exists.room = room._id;
          exists.roomFee = contractRoomFee;
          exists.electricityFee = electShare;
          exists.waterFee = waterShare;
          exists.otherFee = otherShare;
          exists.sharedCommonFee = commonFeeShare;
          exists.personalServiceFee = personalTotal;
          exists.occupants = occupants;
          exists.commonServiceBreakdown = commonBreakdown;
          exists.personalServiceBreakdown = personalBreakdown;
          exists.total = Math.round(grossTotal);
          exists.walletCreditApplied = 0;
          exists.dueDate = due;
          exists.note = buildMonthlyBillNote({
            contractNumber: c.contractNumber,
            contractRoomFee,
            room,
            occupants,
            commonFeeShare,
          });
          exists.paymentHistory = exists.paymentHistory || [];
          exists.paymentHistory.push({
            at: new Date(),
            action: "adjusted",
            amount: Math.round(exists.total),
            performedBy: req.user._id,
            note: "Cập nhật hóa đơn theo phòng — tiền phòng theo HĐ active",
          });
          await exists.save();
          updated += 1;
          createdBills.push(exists);
          continue;
        }

        const bill = await Bill.create({
          billType: "monthly",
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month: m,
          year: y,
          roomFee: contractRoomFee,
          electricityFee: electShare,
          waterFee: waterShare,
          otherFee: otherShare,
          sharedCommonFee: commonFeeShare,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total: Math.round(grossTotal),
          walletCreditApplied: 0,
          dueDate: due,
          status: "unpaid",
          note: buildMonthlyBillNote({
            contractNumber: c.contractNumber,
            contractRoomFee,
            room,
            occupants,
            commonFeeShare,
          }),
          paymentHistory: [
            {
              at: new Date(),
              action: "created",
              amount: Math.round(grossTotal),
              performedBy: req.user._id,
              note: "Tạo hóa đơn theo phòng — tiền phòng theo HĐ active",
            },
          ],
        });
        created += 1;
        createdBills.push(bill);
        await assignBillCodeIfMissing(bill);

        io.emit("bill:new", { userId: String(c.user._id), message: "Bạn có hóa đơn mới" });
        await Notification.create({
          user: c.user._id,
          title: "Hóa đơn mới",
          message: `Bạn có hóa đơn tháng ${m}/${y}, tổng ${Math.round(grossTotal).toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
          type: "bill_reminder",
          link: "/student/my-bills",
        });
      }
      await closeMeterPeriodForRoom({
        roomId,
        month: m,
        year: y,
        billId: createdBills[0]?._id,
      });
      return res.status(201).json({ created, updated, skipped, bills: createdBills });
    }

    // Luồng cũ: tạo cho 1 hợp đồng
    const roomFeeFromBody = Number(req.body?.roomFee || 0);
    const contractDoc = await Contract.findById(contract).populate("user room");
    if (!contractDoc) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const now = new Date();
    if (contractDoc.status === "terminated" || contractDoc.status === "expired") {
      return res.status(400).json({ message: "Hợp đồng đã kết thúc / hết hạn, không thể tạo hóa đơn" });
    }
    if (contractDoc.status !== "active") {
      return res.status(400).json({ message: "Chỉ tạo hóa đơn khi hợp đồng đang active" });
    }
    if (isContractExpired(contractDoc.endDate, now)) {
      return res.status(400).json({ message: "Hợp đồng đã hết hạn, không thể tạo hóa đơn" });
    }

    const existing = await findMonthlyBillForPeriod(contract, m, y);
    if (existing) return res.status(400).json({ message: "Hóa đơn tháng này đã tồn tại" });

    await voidSupersededMonthlyBillsForUser({
      userId: contractDoc.user._id || contractDoc.user,
      month: m,
      year: y,
      keepContractId: contractDoc._id,
      performedBy: req.user._id,
    });

    const effectiveRoomFee = resolveRoomFeeFromActiveContract(contractDoc);
    if (roomFeeFromBody > 0 && roomFeeFromBody !== effectiveRoomFee) {
      return res.status(400).json({
        message: `Tiền phòng phải theo HĐ đang hiệu lực (${effectiveRoomFee.toLocaleString("vi-VN")}đ), không dùng giá phòng/slot.`,
      });
    }
    const total = effectiveRoomFee + Number(electricityFee || 0) + Number(waterFee || 0) + Number(otherFee || 0);
    const bill = await Bill.create({
      billType: "monthly",
      contract,
      user: contractDoc.user._id,
      room: contractDoc.room._id,
      month: m,
      year: y,
      roomFee: effectiveRoomFee,
      electricityFee: Number(electricityFee || 0),
      waterFee: Number(waterFee || 0),
      otherFee: Number(otherFee || 0),
      total,
      dueDate: due,
      status: "unpaid",
      paymentHistory: [
        {
          at: new Date(),
          action: "created",
          amount: Math.round(total),
          performedBy: req.user._id,
          note: "Tạo hóa đơn thủ công",
        },
      ],
    });
    await assignBillCodeIfMissing(bill);
    await syncRoomMonthlyUtilityCost({
      roomId: contractDoc.room._id,
      month: m,
      year: y,
      electricityFee: Number(electricityFee || 0),
      waterFee: Number(waterFee || 0),
      userId: req.user._id,
    });
    await closeMeterPeriodForRoom({
      roomId: contractDoc.room._id,
      month: m,
      year: y,
      billId: bill._id,
    });
    const io = getIO();
    io.emit("bill:new", { userId: String(contractDoc.user._id), message: "Bạn có hóa đơn mới" });
    await Notification.create({
      user: contractDoc.user._id,
      title: "Hóa đơn mới",
      message: `Bạn có hóa đơn tháng ${m}/${y}, tổng ${total.toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
      type: "bill_reminder",
      link: "/student/my-bills",
    });
    res.status(201).json(await bill.populate(["user", "room", "room.area"]));
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({ message: error.message });
  }
};

exports.generateByMonth = async (req, res) => {
  try {
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    const dueDate = req.body?.dueDate ? parseDateOrNull(req.body.dueDate) : dueDateForBillingMonth(year, month);
    if (!(month >= 1 && month <= 12) || year < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    if (!dueDate) {
      return res.status(400).json({ message: "Hạn thanh toán không hợp lệ" });
    }

    const now = new Date();
    const today = toStartOfDay(now);

    const contracts = await Contract.find({
      status: "active",
      endDate: { $gte: today },
    })
      .populate("room", "price roomNumber area capacity")
      .populate("user", "fullName email");
    if (!contracts.length) return res.json({ created: 0, skipped: 0, message: "Không có hợp đồng đang hiệu lực" });

    const roomCosts = await RoomMonthlyCost.find({ month, year });
    const roomCostMap = new Map(roomCosts.map((c) => [String(c.room), c]));

    const byRoom = new Map();
    for (const c of contracts) {
      const entitled = await resolveContractEntitledRoomId(c);
      const k = entitled || String(c.room?._id || c.room);
      if (!k) continue;
      if (!byRoom.has(k)) byRoom.set(k, []);
      byRoom.get(k).push(c);
    }

    const commonServicesByRoom = new Map();
    const metersByRoom = new Map();
    for (const k of byRoom.keys()) {
      commonServicesByRoom.set(k, await loadCommonServicesAssignedToRoom(k));
      metersByRoom.set(k, await loadMeterServicesAssignedToRoom(k));
    }

    let created = 0;
    let skipped = 0;
    const io = getIO();

    for (const list of byRoom.values()) {
      const roomId = String(list[0].room?._id || list[0].room);
      const entitledId = await resolveContractEntitledRoomId(list[0]);
      const billingRoomId = entitledId || roomId;
      const room = await Room.findById(billingRoomId);
      if (!room) continue;
      const roomKey = String(room._id);
      const commonServices = commonServicesByRoom.get(roomKey) || [];
      const meters = metersByRoom.get(roomKey) || { electricity: null, water: null };
      const occupants = Math.max(
        1,
        (await countEffectiveResidentsByRoom([roomKey])).get(String(roomKey)) ?? list.length
      );
      const roomCost = roomCostMap.get(roomKey);
      const { electricityTotal, waterTotal } = applyRoomMeterAssignment(
        meters,
        roomCost?.electricityFee,
        roomCost?.waterFee
      );

      const wifiRoomTotalForBill = resolveWifiRoomTotalForBill(
        commonServices,
        null,
        roomCost?.wifiMonthlyFee
      );
      const { breakdown: commonBreakdown, commonPerStudent: commonFeeShare } = resolveCommonFeesForRoom(
        commonServices,
        wifiRoomTotalForBill,
        occupants
      );

      const utilityShareFor = await buildUtilityShareResolver(list, {
        electricityTotal,
        waterTotal,
        meters,
        month,
        year,
      });

      for (const c of list) {
        await voidSupersededMonthlyBillsForUser({
          userId: c.user._id || c.user,
          month,
          year,
          keepContractId: c._id,
          performedBy: req.user?._id || null,
        });

        const contractRoomFee = resolveRoomFeeFromActiveContract(c);
        const exists = await findMonthlyBillForPeriod(c._id, month, year);
        if (exists) {
          skipped += 1;
          continue;
        }

        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month, year });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;

        const { electShare, waterShare } = utilityShareFor(c);
        const grossTotal = contractRoomFee + electShare + waterShare + commonFeeShare + personalTotal;
        const bill = await Bill.create({
          billType: "monthly",
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month,
          year,
          roomFee: contractRoomFee,
          electricityFee: electShare,
          waterFee: waterShare,
          otherFee: 0,
          sharedCommonFee: commonFeeShare,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total: Math.round(grossTotal),
          walletCreditApplied: 0,
          dueDate,
          status: "unpaid",
          note: buildMonthlyBillNote({
            contractNumber: c.contractNumber,
            contractRoomFee,
            room,
            occupants,
            commonFeeShare,
          }),
          paymentHistory: [
            {
              at: new Date(),
              action: "created",
              amount: Math.round(grossTotal),
              performedBy: req.user?._id || null,
              note: "Sinh tự động theo tháng — tiền phòng theo HĐ active",
            },
          ],
        });
        created += 1;
        await assignBillCodeIfMissing(bill);

        io.emit("bill:new", {
          userId: String(c.user._id),
          message: `Bạn có hóa đơn tháng ${month}/${year}`,
        });
        await Notification.create({
          user: c.user._id,
          title: "Hóa đơn mới",
          message: `Bạn có hóa đơn tháng ${month}/${year}, tổng ${Math.round(grossTotal).toLocaleString("vi-VN")}đ.`,
          type: "bill_reminder",
          link: "/student/my-bills",
        });
      }
      await closeMeterPeriodForRoom({
        roomId: room._id,
        month,
        year,
      });
    }

    res.json({ created, skipped });
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({ message: error.message });
  }
};

exports.markPaid = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin" || req.user.role === "manager";
    if (!isAdmin) {
      return res.status(403).json({ message: "Chỉ admin/manager được xác nhận thanh toán thủ công" });
    }
    const ref = req.body?.paymentReference ? String(req.body.paymentReference).trim() : "";
    const bill = await settleBillAtCounter({
      billId: req.params.id,
      adminUserId: req.user._id,
      paymentReference: ref,
    });
    res.json(bill);
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({ message: error.message });
  }
};

/** Tạo URL thanh toán online qua VNPay. */
exports.payOnline = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate("contract");
    if (!bill) return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    if (!isStudentUser(req.user)) {
      return res.status(403).json({ message: "Chỉ sinh viên được thực hiện thanh toán online" });
    }
    const billUserId = String(bill.user?._id || bill.user || "");
    if (billUserId !== String(req.user._id)) {
      return res.status(403).json({ message: "Chỉ thanh toán được hóa đơn của chính bạn" });
    }
    if (bill.status === "paid") {
      return res.status(400).json({ message: "Hóa đơn đã được thanh toán" });
    }
    if (!canSettleBillStatus(bill.status)) {
      return res.status(400).json({ message: "Hóa đơn không ở trạng thái chờ thanh toán" });
    }
    if (Number(bill.total || 0) <= 0) {
      return res.status(400).json({ message: "Hóa đơn không hợp lệ: tổng tiền phải lớn hơn 0" });
    }
    const paymentUrl = await buildBillPaymentUrl({
      req,
      billId: String(bill._id),
      amount: bill.total,
      orderInfo: `Thanh toan hoa don ${bill.month}/${bill.year}`,
    });
    res.json({ paymentUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** VNPay return URL: xác minh chữ ký và cập nhật trạng thái hóa đơn. */
exports.handleVnpayReturn = async (req, res) => {
  const clientReturnBase = getClientReturnBaseUrl();
  try {
    const verifyResult = verifyReturnQuery(req.query);
    const isValid = Boolean(verifyResult?.isVerified ?? verifyResult?.isValid ?? verifyResult?.success);
    if (!isValid) {
      return res.redirect(`${clientReturnBase}?vnpay=invalid-signature`);
    }
    const responseCode = String(req.query?.vnp_ResponseCode || "");
    const txnRef = String(req.query?.vnp_TxnRef || "");
    const billId = parseBillIdFromTxnRef(txnRef);
    if (!billId || !mongoose.isValidObjectId(billId)) {
      return res.redirect(`${clientReturnBase}?vnpay=invalid-ref`);
    }
    const bill = await Bill.findById(billId);
    if (!bill) return res.redirect(`${clientReturnBase}?vnpay=bill-not-found`);
    if (responseCode !== "00") {
      return res.redirect(`${clientReturnBase}?vnpay=failed&code=${encodeURIComponent(responseCode)}&billId=${encodeURIComponent(String(bill._id))}`);
    }
    if (bill.status !== "paid") {
      await settleBillViaVnpay({ bill, txnRef });
    }
    return res.redirect(`${clientReturnBase}?vnpay=success&billId=${encodeURIComponent(String(bill._id))}`);
  } catch (error) {
    return res.redirect(`${clientReturnBase}?vnpay=error`);
  }
};

/** Chi tiết một hóa đơn (admin/manager hoặc chính sinh viên). `amount` = tổng phải trả (alias của total). */
exports.getById = async (req, res) => {
  try {
    await refreshOverdueMonthlyBills();
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }
    const bill = await Bill.findById(id)
      .populate("user", "fullName email phone studentId gender")
      .populate("paidBy", "fullName role")
      .populate("contract", "contractNumber status startDate endDate signedAt")
      .populate("room")
      .populate("room.area", "name")
      .populate("violation", "ruleName description fineAmount compensationAmount createdAt")
      .populate("maintenanceReport", "requestCode incidentType description resolutionType");
    if (!bill) return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    if (!bill.billCode) {
      await assignBillCodeIfMissing(bill);
    }
    const isStaff = req.user.role === "admin" || req.user.role === "manager";
    const billUserId = String(bill.user?._id || bill.user || "");
    if (!isStaff && billUserId !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền xem hóa đơn này" });
    }
    const [enriched] = await enrichBillsForResponse([bill]);
    enriched.amount = bill.total;
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin: xóa HĐ tháng phòng cũ — chỉ khi SV chuyển phòng chưa ở ngày nào. */
exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate("contract", "contractNumber status")
      .populate("user", "fullName studentId");
    if (!bill) return res.status(404).json({ message: "Không tìm thấy hóa đơn" });

    const check = await evaluateTransferOldBillDeletion(bill);
    if (!check.allowed) {
      return res.status(400).json({ message: check.reason || "Không được phép xóa hóa đơn này" });
    }

    await Bill.findByIdAndDelete(bill._id);
    res.json({
      ok: true,
      message: "Đã xóa hóa đơn phòng cũ (sinh viên chuyển phòng khi chưa ở ngày nào)",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin: sửa hạn, ghi chú hoặc điều chỉnh khoản phí (hóa đơn chưa paid). */
exports.updateBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    if (bill.status === "paid") {
      return res.status(400).json({ message: "Không chỉnh sửa hóa đơn đã thanh toán" });
    }
    const { dueDate, note, roomFee, electricityFee, waterFee, otherFee, sharedCommonFee, personalServiceFee } = req.body;
    if (dueDate) {
      const parsedDue = parseDateOrNull(dueDate);
      if (!parsedDue) return res.status(400).json({ message: "Hạn thanh toán không hợp lệ" });
      bill.dueDate = parsedDue;
    }
    if (note !== undefined) bill.note = String(note);
    if (roomFee !== undefined) bill.roomFee = Math.max(0, Number(roomFee));
    if (electricityFee !== undefined) bill.electricityFee = Math.max(0, Number(electricityFee));
    if (waterFee !== undefined) bill.waterFee = Math.max(0, Number(waterFee));
    if (otherFee !== undefined) bill.otherFee = Math.max(0, Number(otherFee));
    if (sharedCommonFee !== undefined) bill.sharedCommonFee = Math.max(0, Number(sharedCommonFee));
    if (personalServiceFee !== undefined) bill.personalServiceFee = Math.max(0, Number(personalServiceFee));
    bill.total =
      Number(bill.roomFee || 0) +
      Number(bill.electricityFee || 0) +
      Number(bill.waterFee || 0) +
      Number(bill.otherFee || 0) +
      Number(bill.sharedCommonFee || 0) +
      Number(bill.personalServiceFee || 0);
    bill.paymentHistory = bill.paymentHistory || [];
    bill.paymentHistory.push({
      at: new Date(),
      action: "adjusted",
      method: "admin",
      reference: "",
      amount: Math.round(bill.total),
      performedBy: req.user._id,
      note: "Điều chỉnh hóa đơn",
    });
    await bill.save();
    const out = await Bill.findById(bill._id)
      .populate("user", "fullName email")
      .populate("contract", "contractNumber status")
      .populate("room")
      .populate("room.area", "name");
    res.json(out);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Thống kê doanh thu (hóa đơn monthly đã paid) theo năm — bonus. */
exports.revenueSummary = async (req, res) => {
  try {
    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);
    const byMonth = await Bill.aggregate([
      { $match: { billType: "monthly", status: "paid", year } },
      { $group: { _id: "$month", total: { $sum: "$total" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const yearTotal = byMonth.reduce((s, r) => s + r.total, 0);
    res.json({ year, byMonth, yearTotal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Gọi tay cập nhật trạng thái quá hạn (thường đã chạy tự động khi GET danh sách). */
exports.runOverdueRefresh = async (req, res) => {
  try {
    const r = await refreshOverdueMonthlyBills();
    res.json({ ok: true, modifiedCount: r.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
