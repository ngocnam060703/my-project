/**
 * Chuyển phòng (Room Transfer) — luồng nghiệp vụ:
 *
 * 1. Admin duyệt: tạo HĐ mới pending_payment; HĐ cũ vẫn active.
 * 2. SV ký HĐ mới + admin xác nhận: HĐ cũ → transferred_settled; HĐ mới → active; giường & tài chính.
 * 3. HĐ mới: startDate = ngày nộp đơn; endDate = +1 năm; giá đóng băng.
 * 3. Tài chính tiền phòng:
 *    - Admin chưa tạo HĐ tiền phòng tháng cũ → không phụ thu CP; admin tự tạo HĐ tháng lẻ sau (không auto).
 *    - Đã có HĐ tiền phòng + phòng mới giá cao hơn + SV đã ở phòng cũ ≥ 1 ngày → phụ thu chênh lệch giá/tháng (chưa trả HĐ) hoặc bù trừ (đã trả).
 *    - Chuyển phòng khi chưa ở ngày nào (startDate HĐ = ngày chuyển) → không phụ thu.
 *    - Hóa đơn phạt / bồi thường HH: không đụng tới.
 * 4. HĐ gia hạn upcoming: hủy + hoàn 100% tiền đã đóng (chỉ billType monthly) vào ví.
 */
const Registration = require("../models/Registration");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Bill = require("../models/Bill");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { releaseBedForContractId } = require("./bedOccupancy");
const { tryAutoAssignBed } = require("./bedAllocation");
const { syncOccupancyForRooms } = require("./roomOccupancySync");
const {
  buildContractPricingFields,
  buildTransferContractPricingOnCreate,
  effectiveContractPrice,
} = require("./contractPricing");
const { assignBillCodeIfMissing } = require("./billCodeGenerator");
const { creditUserWallet } = require("./walletCreditService");
const { reconcileOldRoomMonthlyBillAfterTransfer } = require("./monthlyBillTransferSync");
const {
  findCandidateRooms,
  tryAssignRoomForApplication,
  normalizeGender,
} = require("./applicationRoomAssignment");
const { normalizeStudentGender } = require("../utils/genderPolicy");
const { findResidenceContract } = require("./ktxMembership");

/** Realtime: cập nhật UI đơn chuyển phòng (SV + admin) không cần reload trang. */
function emitTransferRegistrationChanged({ userId, registrationId, action = "updated" } = {}) {
  try {
    const io = getIO();
    io.emit("registration:transfer-changed", {
      userId: userId ? String(userId) : "",
      registrationId: registrationId ? String(registrationId) : "",
      action,
    });
  } catch {
    /* socket chưa khởi tạo */
  }
}

const OLD_CONTRACT_SETTLED_STATUS = "transferred_settled";
const UPCOMING_CANCEL_NOTE = "Hủy do chuyển phòng và ký hợp đồng mới 1 năm";
const TERMINAL_CONTRACT_STATUSES = new Set([
  "cancelled",
  "terminated",
  "transferred_settled",
  "terminated_due_to_transfer",
  "expired",
]);

function formatDateVi(d) {
  return new Date(d).toLocaleDateString("vi-VN");
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Ngày đăng ký đơn chuyển phòng = ngày tạo đơn. */
function getRegistrationApplicationDate(reg) {
  return startOfDay(reg.createdAt || reg.startDate || new Date());
}

function addOneCalendarYear(startDate) {
  const d = startOfDay(startDate);
  const end = new Date(d);
  end.setFullYear(end.getFullYear() + 1);
  return endOfDay(end);
}

function daysInCalendarMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

/** Số ngày đã ở phòng cũ trước ngày nộp đơn chuyển (từ startDate HĐ, không tính từ đầu tháng). */
function computeDaysUsedInOldRoom(oldContract, settlementDay) {
  const regDay = startOfDay(settlementDay);
  const contractStart = oldContract?.startDate ? startOfDay(oldContract.startDate) : null;
  if (!contractStart || regDay <= contractStart) return 0;

  const y = regDay.getFullYear();
  const m = regDay.getMonth();
  const monthStart = startOfDay(new Date(y, m, 1));
  const periodStart = contractStart > monthStart ? contractStart : monthStart;
  if (regDay <= periodStart) return 0;

  const msPerDay = 86400000;
  return Math.max(0, Math.round((regDay - periodStart) / msPerDay));
}

function buildOldContractCancelReason(reg, newRoomNumber) {
  const studentNote = String(reg.note || reg.transferReason || "").trim();
  if (studentNote && !studentNote.startsWith("Đơn chuyển phòng")) {
    return studentNote;
  }
  return `Thanh lý để chuyển sang phòng ${newRoomNumber || "mới"}`;
}

async function findUpcomingRenewalForActive(activeContract) {
  if (!activeContract?._id) return null;
  const userId = activeContract.user?._id || activeContract.user;
  return Contract.findOne({
    user: userId,
    renewedFromContract: activeContract._id,
    isRenewalContract: true,
    status: { $in: ["upcoming", "pending_payment"] },
  });
}

/** Chỉ cộng tiền phòng đã thanh toán (monthly) — không gộp phạt / bồi thường HH. */
async function computePaidMonthlyRoomFeesForContract(contractId) {
  if (!contractId) return 0;
  const bills = await Bill.find({
    contract: contractId,
    status: "paid",
    billType: "monthly",
  })
    .select("total roomFee")
    .lean();
  return bills.reduce((sum, b) => {
    const t = Number(b.total);
    if (t > 0) return sum + Math.round(t);
    return sum + Math.round(Number(b.roomFee) || 0);
  }, 0);
}

async function findMonthlyRoomBill(contractId, month, year) {
  return Bill.findOne({
    contract: contractId,
    month,
    year,
    billType: "monthly",
  }).lean();
}

async function loadTransferRegistration(regId) {
  return Registration.findById(regId)
    .populate("room")
    .populate("fromRoom")
    .populate("currentContract")
    .populate("user");
}

async function repopulateContractRoom(contractId) {
  return Contract.findById(contractId).populate({
    path: "room",
    populate: { path: "area", select: "name genderPolicy" },
  });
}

async function resolveActiveContractForTransfer(reg) {
  const userId = reg.user._id || reg.user;
  const openStatus = { $nin: [...TERMINAL_CONTRACT_STATUSES] };
  const { alignContractRoomWithOccupiedBed } = require("./contractResidenceSync");

  let found = null;

  if (reg.currentContract) {
    const cid = reg.currentContract._id || reg.currentContract;
    found = await Contract.findOne({ _id: cid, user: userId, status: openStatus });
  }
  if (!found && reg.fromRoom) {
    const fromId = reg.fromRoom._id || reg.fromRoom;
    found = await Contract.findOne({ user: userId, room: fromId, status: openStatus }).sort({ createdAt: -1 });
  }
  if (!found) {
    found = await Contract.findOne({ user: userId, status: "active" }).sort({ createdAt: -1 });
  }
  if (!found) {
    const { findResidenceContract } = require("./ktxMembership");
    const residence = await findResidenceContract(userId);
    if (residence && !TERMINAL_CONTRACT_STATUSES.has(String(residence.status))) {
      found = await Contract.findById(residence._id);
    }
  }
  if (!found) {
    const Bed = require("../models/Bed");
    const bed = await Bed.findOne({ currentUser: userId, status: "occupied" }).sort({ updatedAt: -1 });
    if (bed?.currentContract) {
      found = await Contract.findOne({ _id: bed.currentContract, user: userId, status: openStatus });
    }
  }

  if (!found) return null;
  await alignContractRoomWithOccupiedBed(found);
  return repopulateContractRoom(found._id);
}

function buildRoomSummary(roomDoc) {
  if (!roomDoc) return null;
  const area = roomDoc.area;
  return {
    roomId: String(roomDoc._id),
    roomNumber: roomDoc.roomNumber || "",
    areaName: area && typeof area === "object" ? area.name || "" : "",
  };
}

/**
 * Bù trừ tiền phòng: chốt theo ngày nộp đơn; phụ thu khi admin đã tạo HĐ tiền phòng và phòng mới đắt hơn.
 */
async function computeTransferFinancials({
  oldContract,
  newRoomDoc,
  userDoc,
  registrationDate,
  approvalDate,
}) {
  const regDay = startOfDay(registrationDate);
  const apprDay = startOfDay(approvalDate);
  const settlementDay = regDay;

  const oldPrice = effectiveContractPrice(oldContract);
  const newPricing = buildContractPricingFields({ roomDoc: newRoomDoc, userDoc });
  const newPrice = newPricing.contractPrice;
  const annualNewContractValue = newPrice * 12;

  const y = settlementDay.getFullYear();
  const m = settlementDay.getMonth() + 1;
  const dim = daysInCalendarMonth(y, m);
  const daysUsedOldInMonth = computeDaysUsedInOldRoom(oldContract, settlementDay);
  const daysRemainingOldInMonth = Math.max(0, dim - settlementDay.getDate());

  const oldActualCharge = Math.round((oldPrice * daysUsedOldInMonth) / dim);
  const unusedOldRoomCredit = Math.round((oldPrice * daysRemainingOldInMonth) / dim);

  const monthlyBill = await findMonthlyRoomBill(oldContract._id, m, y);
  const hasPaidOldRoomBill = monthlyBill?.status === "paid";
  const hasAnyOldRoomBill = !!monthlyBill;

  const regY = regDay.getFullYear();
  const regM = regDay.getMonth() + 1;
  const regDim = daysInCalendarMonth(regY, regM);
  const daysNewFirstMonth = Math.max(1, regDim - regDay.getDate() + 1);
  const newFirstMonthProrated = Math.round((newPrice * daysNewFirstMonth) / regDim);

  let amountPaidAtMonthStart = 0;
  let prepaidSurplus = 0;
  let grossCredit = 0;
  let creditAppliedToNew = 0;
  let supplementAmount = 0;
  let walletCreditAmount = 0;
  let financialAction = "none";
  let financialMode = "defer_room_invoice";

  if (hasPaidOldRoomBill) {
    financialMode = "room_offset";
    const rf = Number(monthlyBill.roomFee);
    amountPaidAtMonthStart = Math.round(rf > 0 ? rf : Number(monthlyBill.total) || 0);
    prepaidSurplus = Math.max(0, amountPaidAtMonthStart - oldActualCharge);
    grossCredit = prepaidSurplus;
    creditAppliedToNew = grossCredit;
    supplementAmount = Math.max(0, newFirstMonthProrated - creditAppliedToNew);
    walletCreditAmount = Math.max(0, creditAppliedToNew - newFirstMonthProrated);
    if (supplementAmount > 0) financialAction = "supplement";
    else if (walletCreditAmount > 0) financialAction = "wallet_credit";
    else financialAction = "none";
  } else if (hasAnyOldRoomBill && newPrice > oldPrice && daysUsedOldInMonth > 0) {
    /** HĐ tháng cũ chưa trả + đã ở phòng cũ: phụ thu = chênh lệch giá phòng/tháng (không gồm DV). */
    financialMode = "room_offset";
    supplementAmount = Math.max(0, Math.round(newPrice - oldPrice));
    if (supplementAmount > 0) financialAction = "supplement";
  }

  if (daysUsedOldInMonth <= 0) {
    supplementAmount = 0;
    if (financialAction === "supplement") {
      financialAction = walletCreditAmount > 0 ? "wallet_credit" : "none";
    }
  }

  const priceComparison =
    newPrice > oldPrice ? "higher" : newPrice < oldPrice ? "lower" : "equal";

  const newContractEndDate = addOneCalendarYear(regDay);

  return {
    registrationDate: regDay.toISOString(),
    approvalDate: apprDay.toISOString(),
    settlementDate: settlementDay.toISOString(),
    newContractStartDate: regDay.toISOString(),
    newContractEndDate: newContractEndDate.toISOString(),
    month: m,
    year: y,
    daysInMonth: dim,
    daysUsedOld: daysUsedOldInMonth,
    daysRemaining: daysRemainingOldInMonth,
    daysNewFirstMonth,
    overlapDays: 0,
    overlapCharge: 0,
    oldMonthlySlotPrice: oldPrice,
    newMonthlySlotPrice: newPrice,
    annualNewContractValue,
    oldActualCharge,
    unusedOldRoomCredit,
    newFirstMonthProrated,
    amountPaidAtMonthStart,
    prepaidSurplus,
    totalCreditFromOld: creditAppliedToNew,
    supplementAmount,
    walletCreditAmount,
    financialAction,
    financialMode,
    hasPaidOldRoomBill,
    hasAnyOldRoomBill,
    priceComparison,
    labels: { oldRoom: null, newRoom: null },
  };
}

/**
 * @deprecated Không gọi tự động — hóa đơn tiền phòng do admin tạo thủ công (trừ transfer_supplement).
 * Giữ hàm để tham chiếu / tái sử dụng sau nếu cần công cụ admin.
 */
async function settleOldRoomMonthlyBill({ oldContract, studentUserId, financialSnapshot, registrationDate }) {
  if (financialSnapshot.hasAnyOldRoomBill) return null;

  const { month, year, oldActualCharge, daysUsedOld } = financialSnapshot;
  const regLabel = formatDateVi(registrationDate);
  const noteSuffix = `Chốt ${daysUsedOld} ngày ở phòng cũ đến ngày nộp đơn chuyển phòng (${regLabel}) — không bù trừ phụ thu CP`;

  let bill = await Bill.findOne({
    contract: oldContract._id,
    month,
    year,
    billType: "monthly",
  });

  if (bill?.status === "paid") return null;

  if (!bill) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    bill = await Bill.create({
      billType: "monthly",
      contract: oldContract._id,
      user: studentUserId,
      room: oldContract.room,
      month,
      year,
      roomFee: oldActualCharge,
      electricityFee: 0,
      waterFee: 0,
      otherFee: 0,
      sharedCommonFee: 0,
      personalServiceFee: 0,
      occupants: 1,
      total: oldActualCharge,
      dueDate: due,
      status: "unpaid",
      note: noteSuffix,
      paymentHistory: [
        {
          at: new Date(),
          action: "created",
          amount: oldActualCharge,
          note: "HĐ tiền phòng phòng cũ sau chuyển phòng (chưa có HĐ đã trả để bù trừ)",
        },
      ],
    });
    await assignBillCodeIfMissing(bill);
    return bill;
  }

  const prevRoomFee = bill.roomFee;
  bill.roomFee = oldActualCharge;
  const delta =
    (bill.electricityFee || 0) +
    (bill.waterFee || 0) +
    (bill.otherFee || 0) +
    (bill.sharedCommonFee || 0) +
    (bill.personalServiceFee || 0);
  bill.total = Math.round(oldActualCharge + delta);
  bill.note = `${bill.note || ""} | ${noteSuffix}`.trim();
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push({
    at: new Date(),
    action: "adjusted",
    amount: bill.total,
    note: `Tiền phòng cũ: ${prevRoomFee} → ${oldActualCharge} (đến ngày nộp đơn)`,
  });
  await bill.save();
  return bill;
}

async function createTransferSupplementBill({
  userId,
  newContract,
  newRoom,
  financialSnapshot,
  registrationId,
  performedBy,
}) {
  const { supplementAmount, month, year, hasAnyOldRoomBill, hasPaidOldRoomBill, financialMode } =
    financialSnapshot;
  if (financialMode !== "room_offset" || !hasAnyOldRoomBill || supplementAmount <= 0) return null;

  const due = new Date();
  due.setDate(due.getDate() + 7);

  const existing = await Bill.findOne({
    user: userId,
    month,
    year,
    billType: "transfer_supplement",
    note: { $regex: String(registrationId) },
  });
  if (existing) return existing;

  const {
    newFirstMonthProrated = 0,
    totalCreditFromOld = 0,
    newMonthlySlotPrice = 0,
    daysNewFirstMonth,
    registrationDate,
  } = financialSnapshot;
  const regDay = registrationDate ? new Date(registrationDate) : null;
  const daysLabel =
    daysNewFirstMonth != null
      ? `${daysNewFirstMonth} ngày`
      : regDay
        ? `${Math.max(1, daysInCalendarMonth(regDay.getFullYear(), regDay.getMonth() + 1) - regDay.getDate() + 1)} ngày`
        : "theo ngày";

  const creditLine = hasPaidOldRoomBill
    ? {
        label: "Bù trừ từ HĐ / tiền đã đóng phòng cũ (trừ)",
        amount: Math.round(Math.min(totalCreditFromOld, newFirstMonthProrated)),
      }
    : {
        label: `Chênh lệch giá phòng/tháng (${Math.round(newMonthlySlotPrice).toLocaleString("vi-VN")}đ − ${Math.round(financialSnapshot.oldMonthlySlotPrice || 0).toLocaleString("vi-VN")}đ, chưa bù trừ tiền đã trả)`,
        amount: supplementAmount,
      };

  const bill = await Bill.create({
    billType: "transfer_supplement",
    contract: newContract._id,
    user: userId,
    room: newRoom._id,
    month,
    year,
    roomFee: supplementAmount,
    electricityFee: 0,
    waterFee: 0,
    otherFee: 0,
    sharedCommonFee: 0,
    personalServiceFee: 0,
    occupants: 1,
    total: supplementAmount,
    dueDate: due,
    status: "unpaid",
    note: `Phụ thu chuyển phòng (đơn ${registrationId}) — phòng mới giá cao hơn`,
    penaltyBreakdown: hasPaidOldRoomBill
      ? [
          {
            label: `Tiền phòng mới (prorate ${daysLabel}, ${Math.round(newMonthlySlotPrice).toLocaleString("vi-VN")}đ/tháng/chỗ)`,
            amount: Math.round(newFirstMonthProrated),
          },
          creditLine,
          { label: "Phụ thu còn phải thu", amount: supplementAmount },
        ]
      : [creditLine, { label: "Phụ thu còn phải thu", amount: supplementAmount }],
    paymentHistory: [
      {
        at: new Date(),
        action: "created",
        amount: supplementAmount,
        performedBy: performedBy || null,
        note: "Phụ thu chuyển phòng",
      },
    ],
  });
  await assignBillCodeIfMissing(bill);
  return bill;
}

/**
 * Admin duyệt: chỉ tạo HĐ mới chờ ký; HĐ cũ vẫn hiệu lực đến khi SV ký + admin xác nhận.
 */
async function loadTargetRoomForPricing(targetRoom) {
  const roomId = targetRoom?._id || targetRoom;
  return Room.findById(roomId).lean();
}

async function prepareRoomTransferOnApprove(reg, { oldContract, targetRoom }) {
  const financialSnapshot = reg.financialSnapshot || {};
  const registrationDate = startOfDay(
    new Date(financialSnapshot.registrationDate || getRegistrationApplicationDate(reg))
  );
  const studentUserId = reg.user._id || reg.user;
  const user = await User.findById(studentUserId).select("priorityType").lean();
  const targetRoomDoc = await loadTargetRoomForPricing(targetRoom);
  if (!targetRoomDoc) {
    const err = new Error("Không tìm thấy phòng đích để tính giá hợp đồng");
    err.statusCode = 404;
    throw err;
  }
  const pricing = buildTransferContractPricingOnCreate({ roomDoc: targetRoomDoc, userDoc: user });

  if (reg.newContract) {
    const existing = await Contract.findById(reg.newContract);
    if (existing) {
      if (String(existing.status) === "pending_payment" && !existing.signedAt && !existing.financialLockedAt) {
        existing.room = targetRoomDoc._id;
        existing.bed = null;
        Object.assign(existing, pricing);
        await existing.save();
      }
      return { oldContract, newContract: existing, alreadyPrepared: true };
    }
  }

  const newEndDate = addOneCalendarYear(registrationDate);

  const newContract = await Contract.create({
    registration: reg._id,
    user: studentUserId,
    room: targetRoomDoc._id,
    startDate: registrationDate,
    endDate: newEndDate,
    contractNumber: `HD-CP${Date.now()}`,
    status: "pending_payment",
    studentSignStatus: "pending",
    isTransferContract: true,
    transferredFromContract: oldContract._id,
    terms: oldContract.terms || "",
    ...pricing,
  });

  reg.newContract = newContract._id;
  reg.transferPhase = "awaiting_confirmation";
  reg.currentContract = oldContract._id;
  await reg.save();

  return { oldContract, newContract, alreadyPrepared: false };
}

/**
 * Sau khi SV ký HĐ mới và admin xác nhận: thanh lý HĐ cũ, giường, phụ thu, ví.
 */
async function completeRoomTransferSettlement(reg, newContract, { performedBy }) {
  if (reg.transferPhase === "completed") {
    return { alreadyCompleted: true };
  }

  const financialSnapshot = reg.financialSnapshot || {};
  const registrationDate = startOfDay(
    new Date(financialSnapshot.registrationDate || getRegistrationApplicationDate(reg))
  );

  const targetRoom = await Room.findById(reg.room._id || reg.room).populate("area", "name");
  const oldContractId =
    financialSnapshot.oldContractId || reg.currentContract || newContract.transferredFromContract;
  const oldContract = await Contract.findById(oldContractId).populate("room");
  if (!targetRoom || !oldContract) {
    const err = new Error("Thiếu dữ liệu phòng hoặc hợp đồng cũ để hoàn tất chuyển phòng");
    err.statusCode = 400;
    throw err;
  }

  const fromRoom = await Room.findById(oldContract.room?._id || oldContract.room);
  const studentUserId = reg.user._id || reg.user;
  const newRoomNumber = targetRoom.roomNumber || "";

  if (String(oldContract.status) !== OLD_CONTRACT_SETTLED_STATUS) {
    if (String(fromRoom?.roomLeader || "") === String(studentUserId)) {
      fromRoom.roomLeader = null;
      await fromRoom.save();
    }

    /** Không tự tạo/cập nhật HĐ monthly — admin tạo hóa đơn tháng thủ công. Chỉ transfer_supplement được auto. */
    await reconcileOldRoomMonthlyBillAfterTransfer({
      oldContract,
      financialSnapshot,
      performedBy: performedBy || studentUserId,
    });

    const upcomingId = financialSnapshot.upcomingRenewal?.contractId;
    let upcomingContract = upcomingId
      ? await Contract.findById(upcomingId)
      : await findUpcomingRenewalForActive(oldContract);

    if (upcomingContract && !["cancelled", "terminated"].includes(String(upcomingContract.status))) {
      upcomingContract.status = "cancelled";
      upcomingContract.cancelReason = UPCOMING_CANCEL_NOTE;
      await upcomingContract.save();
      reg.cancelledUpcomingContract = upcomingContract._id;
    }

    oldContract.status = OLD_CONTRACT_SETTLED_STATUS;
    oldContract.endDate = endOfDay(registrationDate);
    oldContract.cancelReason = buildOldContractCancelReason(reg, newRoomNumber);
    await oldContract.save();

    await releaseBedForContractId(oldContract._id, performedBy || studentUserId, "Chuyển phòng — hoàn tất sau ký HĐ mới");
  }

  if (!targetRoom.roomLeader) {
    targetRoom.roomLeader = studentUserId;
    await targetRoom.save();
  }

  const newContractDoc = await Contract.findById(newContract._id || newContract);
  if (newContractDoc) {
    const targetId = targetRoom._id;
    if (String(newContractDoc.room) !== String(targetId)) {
      newContractDoc.room = targetId;
      newContractDoc.bed = null;
    }
    await newContractDoc.save();
    newContract = newContractDoc;
  }

  const bedResult = await tryAutoAssignBed(newContract._id, performedBy || studentUserId);

  const Application = require("../models/Application");
  if (fromRoom?._id && targetRoom?._id) {
    await Application.updateMany(
      {
        user: studentUserId,
        status: "approved",
        assignedRoom: fromRoom._id,
      },
      { $set: { assignedRoom: targetRoom._id } }
    );
  }

  await syncOccupancyForRooms([fromRoom._id, targetRoom._id]);

  let supplementBill = null;
  if (
    financialSnapshot.financialMode === "room_offset" &&
    financialSnapshot.hasAnyOldRoomBill &&
    financialSnapshot.supplementAmount > 0
  ) {
    supplementBill = await createTransferSupplementBill({
      userId: studentUserId,
      newContract,
      newRoom: targetRoom,
      financialSnapshot,
      registrationId: reg._id,
      performedBy: performedBy || studentUserId,
    });
    const io = getIO();
    io.emit("bill:new", { userId: String(studentUserId), message: "Bạn có hóa đơn phụ thu chuyển phòng" });
    await Notification.create({
      user: studentUserId,
      title: "Phụ thu chuyển phòng",
      message: `Vui lòng thanh toán ${Math.round(financialSnapshot.supplementAmount).toLocaleString("vi-VN")}đ.`,
      type: "bill_reminder",
      link: "/student/my-bills",
    });
  }

  const walletTotal = Math.round(financialSnapshot.walletCreditAmount || 0);
  if (walletTotal > 0) {
    const renewalPart = Math.round(financialSnapshot.upcomingRenewal?.refundAmount || 0);
    const transferPart = Math.max(0, walletTotal - renewalPart);
    if (renewalPart > 0) {
      await creditUserWallet(
        studentUserId,
        renewalPart,
        `Hoàn 100% HĐ gia hạn hủy — ${UPCOMING_CANCEL_NOTE}`
      );
    }
    if (transferPart > 0) {
      await creditUserWallet(
        studentUserId,
        transferPart,
        `Bù trừ chuyển phòng — cấn trừ HĐ mới 1 năm (đơn ${reg._id})`
      );
    }
  }

  reg.newContract = newContract._id;
  reg.transferPhase = "completed";
  reg.transferExecutedAt = new Date();
  await reg.save();

  emitTransferRegistrationChanged({
    userId: studentUserId,
    registrationId: reg._id,
    action: "completed",
  });

  return { oldContract, newContract, supplementBill, bedAssigned: bedResult?.ok === true, alreadyCompleted: false };
}

/** @deprecated Dùng prepareRoomTransferOnApprove + completeRoomTransferSettlement */
async function finalizeRoomTransfer(reg, opts) {
  if (reg.newContract) {
    const newContract = await Contract.findById(reg.newContract);
    if (newContract) {
      return completeRoomTransferSettlement(reg, newContract, { performedBy: opts.reviewedBy });
    }
  }
  const targetRoom = await Room.findById(reg.room._id || reg.room).populate("area", "name");
  const oldContract = await Contract.findById(reg.financialSnapshot?.oldContractId || reg.currentContract).populate(
    "room"
  );
  const prep = await prepareRoomTransferOnApprove(reg, { oldContract, targetRoom });
  return completeRoomTransferSettlement(reg, prep.newContract, { performedBy: opts.reviewedBy });
}

/**
 * Admin duyệt — thực thi ngay toàn bộ chuyển phòng.
 */
async function approveTransferRequest(regId, reviewedBy) {
  const reg = await loadTransferRegistration(regId);
  if (!reg) {
    const err = new Error("Không tìm thấy đơn chuyển phòng");
    err.statusCode = 404;
    throw err;
  }
  if (reg.status !== "pending") {
    const err = new Error("Đơn đã được xử lý");
    err.statusCode = 400;
    throw err;
  }
  if (reg.transferPhase === "completed") {
    const err = new Error("Đơn chuyển phòng đã được thực thi");
    err.statusCode = 400;
    throw err;
  }
  if (reg.status === "approved" && reg.newContract) {
    const existing = await Contract.findById(reg.newContract);
    const populated = await Registration.findById(reg._id)
      .populate("room")
      .populate("fromRoom")
      .populate("newContract", "contractNumber status startDate endDate");
    return {
      registration: populated,
      financialSnapshot: reg.financialSnapshot,
      oldContract: await Contract.findById(reg.currentContract),
      newContract: existing,
      message: "Đơn đã duyệt — hợp đồng mới đang chờ sinh viên ký.",
    };
  }

  const targetRoom = await Room.findById(reg.room._id || reg.room).populate("area", "name");
  if (!targetRoom) {
    const err = new Error("Không tìm thấy phòng đích");
    err.statusCode = 404;
    throw err;
  }

  const oldContract = await resolveActiveContractForTransfer(reg);
  if (!oldContract) {
    const err = new Error("Không tìm thấy hợp đồng hiện tại để chuyển phòng");
    err.statusCode = 400;
    throw err;
  }

  const fromRoom = await Room.findById(oldContract.room?._id || oldContract.room || reg.fromRoom).populate("area", "name");
  if (!fromRoom) {
    const err = new Error("Không tìm thấy phòng hiện tại của sinh viên");
    err.statusCode = 404;
    throw err;
  }
  if (String(fromRoom._id) === String(targetRoom._id)) {
    const err = new Error("Phòng đích trùng với phòng hiện tại");
    err.statusCode = 400;
    throw err;
  }
  const studentUser = await User.findById(reg.user._id || reg.user).select("gender").lean();
  const genderNorm = normalizeGender(studentUser?.gender) || normalizeStudentGender(studentUser?.gender) || "unknown";
  const mayJoin = await tryAssignRoomForApplication(targetRoom._id, genderNorm);
  if (!mayJoin) {
    const err = new Error(
      "Phòng đích không phù hợp: phải cùng giới tính với người đang ở trong phòng và đúng quy định khu"
    );
    err.statusCode = 400;
    throw err;
  }

  const user = studentUser || (await User.findById(reg.user._id || reg.user));
  const registrationDate = getRegistrationApplicationDate(reg);
  const approvalDate = startOfDay(new Date());

  reg.reviewedBy = reviewedBy;
  reg.reviewedAt = approvalDate;

  const upcomingContract = await findUpcomingRenewalForActive(oldContract);
  const upcomingRefundAmount = upcomingContract
    ? await computePaidMonthlyRoomFeesForContract(upcomingContract._id)
    : 0;

  const financialSnapshot = await computeTransferFinancials({
    oldContract,
    newRoomDoc: targetRoom,
    userDoc: user,
    registrationDate,
    approvalDate,
  });

  if (upcomingRefundAmount > 0) {
    financialSnapshot.walletCreditAmount =
      Math.round(financialSnapshot.walletCreditAmount || 0) + upcomingRefundAmount;
    if (financialSnapshot.walletCreditAmount > 0 && financialSnapshot.financialAction === "none") {
      financialSnapshot.financialAction = "wallet_credit";
    }
  }

  financialSnapshot.labels.oldRoom = buildRoomSummary(fromRoom);
  financialSnapshot.labels.newRoom = buildRoomSummary(targetRoom);
  financialSnapshot.oldContractId = String(oldContract._id);
  financialSnapshot.oldContractNumber = oldContract.contractNumber || "";
  financialSnapshot.upcomingRenewal = upcomingContract
    ? {
        contractId: String(upcomingContract._id),
        contractNumber: upcomingContract.contractNumber || "",
        refundAmount: upcomingRefundAmount,
        willCancel: true,
      }
    : null;

  reg.status = "approved";
  reg.currentContract = oldContract._id;
  reg.fromRoom = fromRoom._id;
  reg.financialSnapshot = financialSnapshot;

  await reg.save();

  const result = await prepareRoomTransferOnApprove(reg, { oldContract, targetRoom });

  const studentId = reg.user._id || reg.user;
  const io = getIO();
  io.emit("registration:approved", {
    userId: String(studentId),
    message: "Đơn chuyển phòng đã được duyệt — vui lòng ký hợp đồng mới",
  });
  await Notification.create({
    user: studentId,
    title: "Đơn chuyển phòng được duyệt",
    message: `Admin đã duyệt chuyển sang phòng ${targetRoom.roomNumber}. Hợp đồng mới ${result.newContract.contractNumber} đã được tạo — vui lòng ký tại «Hợp đồng của tôi». Hợp đồng cũ sẽ thanh lý sau khi bạn ký và admin xác nhận.`,
    type: "registration_approved",
    link: "/student/my-contracts",
  });
  emitTransferRegistrationChanged({
    userId: studentId,
    registrationId: reg._id,
    action: "approved",
  });

  const populated = await Registration.findById(reg._id)
    .populate("room")
    .populate("fromRoom")
    .populate("newContract", "contractNumber status startDate endDate");

  return {
    registration: populated,
    financialSnapshot,
    ...result,
    message: "Đã duyệt đơn và tạo hợp đồng mới chờ sinh viên ký.",
  };
}

/** Giữ API xác nhận SV — idempotent nếu admin đã duyệt xong. */
async function executeRoomTransfer(regId, studentUserId, meta = {}) {
  const reg = await loadTransferRegistration(regId);
  if (!reg) {
    const err = new Error("Không tìm thấy đơn chuyển phòng");
    err.statusCode = 404;
    throw err;
  }
  if (String(reg.user._id || reg.user) !== String(studentUserId)) {
    const err = new Error("Không có quyền");
    err.statusCode = 403;
    throw err;
  }
  if (reg.transferPhase === "completed" && reg.newContract) {
    return {
      registration: reg,
      alreadyCompleted: true,
      newContract: await Contract.findById(reg.newContract),
      financialSnapshot: reg.financialSnapshot,
    };
  }
  if (reg.status !== "approved") {
    const err = new Error("Đơn chưa được duyệt");
    err.statusCode = 400;
    throw err;
  }

  if (!reg.newContract) {
    const err = new Error("Chưa có hợp đồng mới — admin cần duyệt đơn trước");
    err.statusCode = 400;
    throw err;
  }
  reg.studentConfirmedAt = new Date();
  if (meta.ip) reg.studentConfirmIp = String(meta.ip).slice(0, 64);
  if (meta.ua) reg.studentConfirmUserAgent = String(meta.ua).slice(0, 512);
  await reg.save();

  const newContract = await Contract.findById(reg.newContract);
  return {
    registration: reg,
    newContract,
    financialSnapshot: reg.financialSnapshot,
    alreadyCompleted: reg.transferPhase === "completed",
  };
}

async function getTransferEligibilityForStudent(userId) {
  const { canRequestRoomTransfer, findResidenceContract } = require("./ktxMembership");
  const canTransfer = await canRequestRoomTransfer(userId);
  const residence = await findResidenceContract(userId);
  const activeContract = residence
    ? await Contract.findById(residence._id)
        .populate({ path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } })
        .lean()
    : null;
  if (!canTransfer || !activeContract) {
    return {
      canTransfer: false,
      hasUpcomingRenewal: false,
      message:
        "Bạn chưa có hợp đồng đang hiệu lực (active trong thời hạn). Nếu vừa gia hạn, HĐ mới có thể đang ở trạng thái upcoming — vui lòng tải lại trang Hợp đồng hoặc liên hệ quản lý.",
    };
  }
  const upcomingContract = await findUpcomingRenewalForActive(activeContract);
  const upcomingRefundPreview = upcomingContract
    ? await computePaidMonthlyRoomFeesForContract(upcomingContract._id)
    : 0;
  const regPreview = startOfDay(new Date());
  const newEndPreview = addOneCalendarYear(regPreview);

  return {
    canTransfer: true,
    hasUpcomingRenewal: !!upcomingContract,
    activeContract: {
      _id: String(activeContract._id),
      contractNumber: activeContract.contractNumber || "",
      endDate: activeContract.endDate,
      roomNumber: activeContract.room?.roomNumber || "",
    },
    upcomingContract: upcomingContract
      ? {
          _id: String(upcomingContract._id),
          contractNumber: upcomingContract.contractNumber || "",
          startDate: upcomingContract.startDate,
          endDate: upcomingContract.endDate,
          status: upcomingContract.status,
        }
      : null,
    newContractEndDate: newEndPreview.toISOString(),
    upcomingRefundPreview,
    warningMessage: upcomingContract
      ? `Lưu ý: Bạn có hợp đồng gia hạn chờ kích hoạt. Khi chuyển phòng được duyệt, HĐ gia hạn sẽ bị hủy (${UPCOMING_CANCEL_NOTE}) và tiền đã đóng (nếu có) sẽ hoàn vào ví khấu trừ. Hợp đồng phòng mới ký 1 năm tính từ ngày bạn gửi đơn này, kết thúc khoảng ${formatDateVi(newEndPreview)}. Bạn có chắc muốn tiếp tục?`
      : null,
  };
}

async function getTransferSummaryForStudent(regId, studentUserId) {
  const reg = await loadTransferRegistration(regId);
  if (!reg) {
    const err = new Error("Không tìm thấy đơn");
    err.statusCode = 404;
    throw err;
  }
  if (String(reg.user._id || reg.user) !== String(studentUserId)) {
    const err = new Error("Không có quyền");
    err.statusCode = 403;
    throw err;
  }
  return {
    registration: {
      _id: reg._id,
      status: reg.status,
      transferPhase: reg.transferPhase,
      transferExecutedAt: reg.transferExecutedAt,
      fromRoom: reg.fromRoom,
      room: reg.room,
      financialSnapshot: reg.financialSnapshot,
      newContract: reg.newContract,
    },
    canConfirm:
      reg.status === "approved" &&
      reg.transferPhase === "awaiting_confirmation" &&
      !!reg.newContract,
    isCompleted: reg.transferPhase === "completed",
  };
}

/**
 * Admin xóa đơn chuyển phòng + HĐ CP chờ ký (nếu có). Không xóa khi đã hoàn tất chuyển phòng.
 */
async function adminRemoveTransferRegistration(regId, performedBy) {
  const reg = await Registration.findById(regId);
  if (!reg) {
    const err = new Error("Không tìm thấy đơn chuyển phòng");
    err.statusCode = 404;
    throw err;
  }
  if (reg.registrationType !== "transfer") {
    const err = new Error("Chỉ xóa được đơn loại chuyển phòng");
    err.statusCode = 400;
    throw err;
  }
  if (reg.transferPhase === "completed") {
    const err = new Error(
      "Đơn đã hoàn tất chuyển phòng — không xóa qua hệ thống. Cần xử lý thủ công HĐ/giường trong MongoDB."
    );
    err.statusCode = 400;
    throw err;
  }

  if (reg.newContract) {
    const nc = await Contract.findById(reg.newContract);
    if (nc) {
      if (String(nc.status) === "active") {
        const err = new Error("Hợp đồng chuyển phòng mới đã active — không thể xóa đơn");
        err.statusCode = 400;
        throw err;
      }
      const roomIds = new Set([String(nc.room)]);
      await releaseBedForContractId(nc._id, performedBy, "Admin xóa đơn chuyển phòng");
      await Contract.findByIdAndDelete(nc._id);
      await syncOccupancyForRooms([...roomIds]);
    }
  }

  const studentId = reg.user?._id || reg.user;
  await Registration.findByIdAndDelete(regId);
  emitTransferRegistrationChanged({ userId: studentId, registrationId: regId, action: "deleted" });
  return { message: "Đã xóa đơn chuyển phòng" };
}

/** Danh sách phòng đích theo khu — đúng giới tính trong phòng; ưu tiên khu hiện tại rồi khu cùng giới. */
async function listTransferCandidateRoomGroups(studentUserId) {
  const user = await User.findById(studentUserId).select("gender").lean();
  const genderNorm = normalizeGender(user?.gender) || normalizeStudentGender(user?.gender) || "unknown";

  const residence = await findResidenceContract(studentUserId);
  if (!residence) {
    return { studentGender: genderNorm, currentAreaId: null, currentRoomNumber: null, groups: [] };
  }

  const active = await Contract.findById(residence._id)
    .populate({ path: "room", populate: { path: "area", select: "name genderPolicy" } })
    .lean();
  const currentRoom = active?.room;
  const currentRoomId = currentRoom?._id ? String(currentRoom._id) : null;
  const currentAreaId = currentRoom?.area?._id
    ? String(currentRoom.area._id)
    : String(currentRoom?.area || "");

  const rooms = await findCandidateRooms({
    genderNorm,
    preferenceAreaId: currentAreaId || null,
  });
  const areaMap = new Map();

  for (const r of rooms) {
    if (currentRoomId && String(r._id) === currentRoomId) continue;
    const ar = r.area && typeof r.area === "object" ? r.area : null;
    const aid = String(ar?._id || r.area || "");
    if (!aid) continue;
    if (!areaMap.has(aid)) {
      const pol = ar?.genderPolicy || "mixed";
      areaMap.set(aid, {
        areaId: aid,
        areaName: ar?.name || "—",
        genderPolicy: pol,
        isCurrentArea: aid === currentAreaId,
        isGenderZone: genderNorm !== "unknown" && pol === genderNorm,
        rooms: [],
      });
    }
    const cap = Number(r.capacity) || 0;
    const occ = Number(r.currentOccupancy) || 0;
    areaMap.get(aid).rooms.push({
      _id: String(r._id),
      roomNumber: r.roomNumber,
      capacity: cap,
      currentOccupancy: occ,
      vacantSlots: cap > 0 ? Math.max(0, cap - occ) : 0,
      status: r.status,
    });
  }

  const rank = (g) => {
    if (g.isCurrentArea) return 0;
    if (g.isGenderZone) return 1;
    if (g.genderPolicy === "mixed") return 2;
    return 3;
  };

  const groups = [...areaMap.values()]
    .filter((g) => g.rooms.length > 0)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(a.areaName).localeCompare(String(b.areaName), "vi");
    });

  return {
    studentGender: genderNorm,
    currentAreaId: currentAreaId || null,
    currentRoomNumber: currentRoom?.roomNumber || null,
    groups,
  };
}

const TRANSFER_OLD_CONTRACT_STATUSES = new Set([
  OLD_CONTRACT_SETTLED_STATUS,
  "terminated_due_to_transfer",
]);

/**
 * Admin được xóa HĐ tháng phòng cũ khi SV chuyển phòng hoàn tất và chưa ở ngày nào (daysUsedOld = 0).
 */
async function evaluateTransferOldBillDeletion(bill) {
  if (!bill) return { allowed: false, reason: "Không tìm thấy hóa đơn" };
  if (bill.status === "paid") {
    return { allowed: false, reason: "Không xóa hóa đơn đã thanh toán" };
  }
  const billType = bill.billType || "monthly";
  if (billType !== "monthly") {
    return { allowed: false, reason: "Chỉ xóa hóa đơn tháng tiền phòng" };
  }

  const contractId = String(bill.contract?._id || bill.contract || "");
  const userId = String(bill.user?._id || bill.user || "");
  if (!contractId || !userId) {
    return { allowed: false, reason: "Thiếu thông tin hợp đồng hoặc sinh viên" };
  }

  const contract = await Contract.findById(contractId).select("status").lean();
  if (contract && !TRANSFER_OLD_CONTRACT_STATUSES.has(String(contract.status))) {
    return { allowed: false, reason: "Hợp đồng không phải phòng cũ đã chuyển" };
  }

  const registrations = await Registration.find({
    user: userId,
    registrationType: "transfer",
    transferPhase: "completed",
    status: "approved",
  }).lean();

  for (const reg of registrations) {
    const snap = reg.financialSnapshot || {};
    const oldContractId = String(snap.oldContractId || reg.currentContract || "");
    if (oldContractId !== contractId) continue;

    if (snap.month && snap.year && (bill.month !== snap.month || bill.year !== snap.year)) {
      continue;
    }

    let daysUsed = Number(snap.daysUsedOld);
    const oldContract = await Contract.findById(oldContractId).select("startDate").lean();
    const regDate = snap.registrationDate || reg.createdAt;
    daysUsed = computeDaysUsedInOldRoom(oldContract, regDate);

    if (daysUsed <= 0) {
      return {
        allowed: true,
        reason: "Sinh viên chuyển phòng khi chưa ở ngày nào — hóa đơn phòng cũ",
        registrationId: reg._id,
      };
    }
  }

  return { allowed: false, reason: "Hóa đơn không thuộc trường hợp chuyển phòng chưa ở ngày nào" };
}

module.exports = {
  approveTransferRequest,
  executeRoomTransfer,
  finalizeRoomTransfer,
  prepareRoomTransferOnApprove,
  completeRoomTransferSettlement,
  adminRemoveTransferRegistration,
  emitTransferRegistrationChanged,
  getTransferSummaryForStudent,
  getTransferEligibilityForStudent,
  listTransferCandidateRoomGroups,
  computeTransferFinancials,
  computePaidMonthlyRoomFeesForContract,
  evaluateTransferOldBillDeletion,
  getRegistrationApplicationDate,
  findUpcomingRenewalForActive,
  OLD_CONTRACT_SETTLED_STATUS,
  UPCOMING_CANCEL_NOTE,
};
