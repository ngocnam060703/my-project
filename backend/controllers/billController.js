const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const Service = require("../models/Service");
const ServiceRegistration = require("../models/ServiceRegistration");
const LaundryUsage = require("../models/LaundryUsage");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const Room = require("../models/Room");
const User = require("../models/User");
const { getIO } = require("../socket");
const { dueDateForBillingMonth } = require("../services/billingDueDate");
const { refreshOverdueMonthlyBills } = require("../services/billingOverdue");
const { ensureBillCodesForList, assignBillCodeIfMissing } = require("../services/billCodeGenerator");
const { settleBillAtCounter, settleBillViaVnpay, canSettleBillStatus } = require("../services/billPaymentService");
const { closeMeterPeriodForRoom } = require("../services/meterBillingService");
const {
  buildBillPaymentUrl,
  verifyReturnQuery,
  parseBillIdFromTxnRef,
  getClientReturnBaseUrl,
} = require("../services/vnpayGateway");

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

/**
 * Tiền phòng / 1 sinh viên = giá phòng ÷ số slot (field capacity của phòng).
 * Luôn tính từ price + capacity — không dùng virtual pricePerPerson để tránh lệch khi tạo HĐ.
 * Điện/nước/chi phí khác chia theo số người đang ở (occupants).
 * DV phòng chung (Wi‑Fi, type common): giá theo phòng → chia đều theo số slot (capacity).
 */
function roomCapacitySlots(roomLike) {
  const rawSlots = Number(roomLike?.capacity);
  return Number.isFinite(rawSlots) && rawSlots >= 1 ? rawSlots : 1;
}

function computeRoomFeePerSlot(roomLike) {
  const total = Number(roomLike?.price ?? 0);
  return Math.round(total / roomCapacitySlots(roomLike));
}

/** Gói DV common (vd: Wi‑Fi/phòng): mỗi SV trả (giá phòng) ÷ capacity slot */
function buildCommonServicesPerStudent(commonServices, roomLike) {
  const slots = roomCapacitySlots(roomLike);
  const breakdown = [];
  let commonPerStudent = 0;
  for (const s of commonServices) {
    if (String(s.name || "").toLowerCase().includes("tiền phòng")) continue;
    const roomAmt = Number(s.price || 0);
    const perStudent = Math.round(roomAmt / slots);
    commonPerStudent += perStudent;
    breakdown.push({ service: s._id, name: s.name, unit: s.unit, totalAmount: perStudent });
  }
  return { breakdown, commonPerStudent, slots };
}

function isWifiNamedService(s) {
  const n = String(s.name || "").toLowerCase();
  return n.includes("wifi") || n.includes("wi-fi") || n.includes("wi fi");
}

/**
 * Form admin "Tiền Wi‑Fi": là **tổng gói theo phòng / tháng** → mỗi SV trả `÷ capacity`.
 * Nếu có nhập (>0): không cộng trùng dòng Wi‑Fi trong catalog Service.
 */
function resolveCommonFeesForRoom(roomLike, commonServices, wifiRoomTotalFromBody) {
  const rawWifi =
    wifiRoomTotalFromBody != null && wifiRoomTotalFromBody !== ""
      ? Number(wifiRoomTotalFromBody)
      : NaN;
  const wifiRoomTotal = Number.isFinite(rawWifi) && rawWifi > 0 ? Math.round(rawWifi) : null;

  if (wifiRoomTotal != null) {
    const sansWifi = commonServices.filter((s) => !isWifiNamedService(s));
    const built = buildCommonServicesPerStudent(sansWifi, roomLike);
    const slots = roomCapacitySlots(roomLike);
    const wifiShare = Math.round(wifiRoomTotal / slots);
    const wifiLine = {
      service: null,
      name: "Wi‑Fi (gói phòng)",
      unit: "monthly",
      totalAmount: wifiShare,
    };
    return {
      breakdown: [...built.breakdown, wifiLine],
      commonPerStudent: built.commonPerStudent + wifiShare,
      slots,
    };
  }

  return buildCommonServicesPerStudent(commonServices, roomLike);
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
    { upsert: true, new: true, runValidators: true }
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
    if (billType === "monthly" || billType === "penalty" || billType === "damage_reimbursement") {
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
      bills,
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
    res.json(bills);
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
      /** Chỉ hợp đồng đang ở (active) — không tạo cho pending_payment / hết hạn / terminate */
      const contracts = await Contract.find({
        room: roomId,
        status: "active",
        endDate: { $gte: toStartOfDay(now) },
      })
        .populate("user", "fullName email")
        .populate("room", "price roomNumber area capacity");
      if (!contracts.length) {
        return res.status(400).json({ message: "Phòng chưa có sinh viên với hợp đồng active (đã ký và còn hạn)" });
      }
      const hasExpired = contracts.some((c) => isContractExpired(c.endDate, now));
      if (hasExpired) {
        return res.status(400).json({ message: "Hợp đồng đã hết hạn, không thể tạo hóa đơn" });
      }

      const occupants = Math.max(1, contracts.length);
      const roomCost = await RoomMonthlyCost.findOne({ room: roomId, month: m, year: y });
      const feePerSlot = computeRoomFeePerSlot(room);
      const electricityTotal = electricityFee != null ? Number(electricityFee) : Number(roomCost?.electricityFee || 0);
      const waterTotal = waterFee != null ? Number(waterFee) : Number(roomCost?.waterFee || 0);
      const fixedOther = Math.max(0, Number(otherFee || 0));

      const bodyWifiNum = Number(wifiRoomFromForm);
      const storedWifiNum = Number(roomCost?.wifiMonthlyFee || 0);
      /** Ưu tiên Wi‑Fi nhập form; không nhập thì dùng đã lưu theo phòng/tháng (cho “Tạo theo tháng” / lần trước). */
      const wifiRoomTotalForBill =
        Number.isFinite(bodyWifiNum) && bodyWifiNum > 0
          ? Math.round(bodyWifiNum)
          : storedWifiNum > 0
            ? Math.round(storedWifiNum)
            : null;

      const commonServices = await Service.find({ type: "common", isActive: true });
      const { breakdown: commonBreakdown, commonPerStudent: commonFeeShare } = resolveCommonFeesForRoom(
        room,
        commonServices,
        wifiRoomTotalForBill
      );

      await syncRoomMonthlyUtilityCost({
        roomId,
        month: m,
        year: y,
        electricityFee: electricityTotal,
        waterFee: waterTotal,
        wifiMonthlyFee: Number.isFinite(bodyWifiNum) && bodyWifiNum > 0 ? Math.round(bodyWifiNum) : undefined,
        userId: req.user._id,
      });

      const io = getIO();
      let created = 0;
      let skipped = 0;
      let updated = 0;
      const createdBills = [];
      for (const c of contracts) {
        const exists = await Bill.findOne({ contract: c._id, month: m, year: y });
        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month: m, year: y });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;
        const electShare = electricityTotal / occupants;
        const waterShare = waterTotal / occupants;
        const otherShare = fixedOther / occupants;
        const total = feePerSlot + electShare + waterShare + otherShare + commonFeeShare + personalTotal;

        if (exists) {
          if (exists.status === "paid") {
            skipped += 1;
            continue;
          }
          exists.roomFee = feePerSlot;
          exists.electricityFee = electShare;
          exists.waterFee = waterShare;
          exists.otherFee = otherShare;
          exists.sharedCommonFee = commonFeeShare;
          exists.personalServiceFee = personalTotal;
          exists.occupants = occupants;
          exists.commonServiceBreakdown = commonBreakdown;
          exists.personalServiceBreakdown = personalBreakdown;
          exists.total = total;
          exists.dueDate = due;
          exists.note = `Tiền phòng & DV phòng chung (Wi‑Fi…) ÷ ${roomCapacitySlots(room)} slot; điện/nước/phí khác ÷ ${occupants} người đang ở; + DV cá nhân`;
          exists.paymentHistory = exists.paymentHistory || [];
          exists.paymentHistory.push({
            at: new Date(),
            action: "adjusted",
            amount: Math.round(total),
            performedBy: req.user._id,
            note: "Cập nhật hóa đơn theo phòng — tiền phòng theo slot (capacity)",
          });
          await exists.save();
          updated += 1;
          createdBills.push(exists);
          continue;
        }

        const bill = await Bill.create({
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month: m,
          year: y,
          roomFee: feePerSlot,
          electricityFee: electShare,
          waterFee: waterShare,
          otherFee: otherShare,
          sharedCommonFee: commonFeeShare,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total,
          dueDate: due,
          status: "unpaid",
          note: `Tiền phòng & DV phòng chung (Wi‑Fi…) ÷ ${roomCapacitySlots(room)} slot; điện/nước/phí khác ÷ ${occupants} người đang ở; + DV cá nhân`,
          paymentHistory: [
            {
              at: new Date(),
              action: "created",
              amount: Math.round(total),
              performedBy: req.user._id,
              note: "Tạo hóa đơn theo phòng — tiền phòng theo slot",
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
          message: `Bạn có hóa đơn tháng ${m}/${y}, tổng ${Math.round(total).toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
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

    const existing = await Bill.findOne({ contract, month: m, year: y });
    if (existing) return res.status(400).json({ message: "Hóa đơn tháng này đã tồn tại" });
    const contractRoomFeePerSlot = computeRoomFeePerSlot(contractDoc.room);
    const effectiveRoomFee = roomFeeFromBody || contractRoomFeePerSlot;
    const total = effectiveRoomFee + Number(electricityFee || 0) + Number(waterFee || 0) + Number(otherFee || 0);
    const bill = await Bill.create({
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
    res.status(500).json({ message: error.message });
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

    const commonServices = await Service.find({ type: "common", isActive: true });
    const roomCosts = await RoomMonthlyCost.find({ month, year });
    const roomCostMap = new Map(roomCosts.map((c) => [String(c.room), c]));

    const byRoom = new Map();
    for (const c of contracts) {
      const k = String(c.room?._id || c.room);
      if (!byRoom.has(k)) byRoom.set(k, []);
      byRoom.get(k).push(c);
    }

    let created = 0;
    let skipped = 0;
    const io = getIO();

    for (const list of byRoom.values()) {
      const room = list[0].room;
      const occupants = Math.max(1, list.length);
      const roomCost = roomCostMap.get(String(room._id));
      const feePerSlot = computeRoomFeePerSlot(room);
      const electricityTotal = Number(roomCost?.electricityFee || 0);
      const waterTotal = Number(roomCost?.waterFee || 0);

      const wifiStored = Number(roomCost?.wifiMonthlyFee || 0);
      const { breakdown: commonBreakdown, commonPerStudent: commonFeeShare } = resolveCommonFeesForRoom(
        room,
        commonServices,
        wifiStored > 0 ? Math.round(wifiStored) : null
      );

      const electShare = electricityTotal / occupants;
      const waterShare = waterTotal / occupants;
      const basePerStudent = feePerSlot + electShare + waterShare + commonFeeShare;

      for (const c of list) {
        const exists = await Bill.findOne({ contract: c._id, month, year });
        if (exists) {
          skipped += 1;
          continue;
        }

        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month, year });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;

        const total = basePerStudent + personalTotal;
        const bill = await Bill.create({
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month,
          year,
          roomFee: feePerSlot,
          electricityFee: electShare,
          waterFee: waterShare,
          otherFee: 0,
          sharedCommonFee: commonFeeShare,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total,
          dueDate,
          status: "unpaid",
          note: `Tiền phòng & DV phòng chung (Wi‑Fi…) ÷ ${roomCapacitySlots(room)} slot; điện/nước ÷ ${occupants} người đang ở; + DV cá nhân`,
          paymentHistory: [
            {
              at: new Date(),
              action: "created",
              amount: Math.round(total),
              performedBy: req.user?._id || null,
              note: "Sinh tự động theo tháng — tiền phòng theo slot",
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
          message: `Bạn có hóa đơn tháng ${month}/${year}, tổng ${Math.round(total).toLocaleString("vi-VN")}đ.`,
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
    res.status(500).json({ message: error.message });
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
    if (req.user.role !== "user") {
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
    const o = bill.toObject();
    o.amount = bill.total;
    res.json(o);
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
