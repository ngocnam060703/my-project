/**
 * Chuyển phòng (Room Transfer) — luồng nghiệp vụ:
 *
 * 1. HĐ cũ: transferred_settled; endDate = ngày nộp đơn; cancelReason từ SV hoặc mẫu chuyển phòng.
 * 2. HĐ mới: startDate = ngày nộp đơn; endDate = +1 năm; giá đóng băng; status active; giữ chỗ phòng/giường.
 * 3. Tài chính tiền phòng:
 *    - Có HĐ tháng phòng cũ đã thanh toán → bù trừ, có thể phát sinh transfer_supplement.
 *    - Chưa có / chưa trả HĐ tháng cũ → không phụ thu chuyển phòng; chốt ngày ở → HĐ tháng lẻ sau.
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
const { buildContractPricingFields, effectiveContractPrice } = require("./contractPricing");
const { assignBillCodeIfMissing } = require("./billCodeGenerator");
const { creditUserWallet } = require("./walletCreditService");

const OLD_CONTRACT_SETTLED_STATUS = "transferred_settled";
const UPCOMING_CANCEL_NOTE = "Hủy do chuyển phòng và ký hợp đồng mới 1 năm";

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

async function resolveActiveContractForTransfer(reg) {
  const userId = reg.user._id || reg.user;
  if (reg.currentContract) {
    const cid = reg.currentContract._id || reg.currentContract;
    const byId = await Contract.findOne({ _id: cid, user: userId, status: "active" }).populate("room");
    if (byId) return byId;
  }
  if (reg.fromRoom) {
    const fromId = reg.fromRoom._id || reg.fromRoom;
    return Contract.findOne({ user: userId, room: fromId, status: "active" }).populate("room");
  }
  return Contract.findOne({ user: userId, status: "active" }).populate("room");
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
 * Bù trừ tiền phòng: chốt theo ngày nộp đơn; phụ thu chỉ khi đã có HĐ tiền phòng cũ đã thanh toán.
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
  const daysUsedOldInMonth = settlementDay.getDate();
  const daysRemainingOldInMonth = Math.max(0, dim - daysUsedOldInMonth);

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
 * Chưa có HĐ tiền phòng cũ đã trả → không phụ thu CP; chốt ngày ở để xuất HĐ tháng lẻ (tạo hoặc điều chỉnh HĐ monthly chưa trả).
 */
async function settleOldRoomMonthlyBill({ oldContract, studentUserId, financialSnapshot, registrationDate }) {
  if (financialSnapshot.hasPaidOldRoomBill) return null;

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
  const { supplementAmount, month, year, hasPaidOldRoomBill, financialMode } = financialSnapshot;
  if (financialMode !== "room_offset" || !hasPaidOldRoomBill || supplementAmount <= 0) return null;

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
    note: `Phụ thu chuyển phòng (đơn ${registrationId}) — bù trừ HĐ 1 năm, tháng đầu prorate`,
    penaltyBreakdown: [
      {
        label: `Tiền phòng mới (prorate ${daysLabel}, ${Math.round(newMonthlySlotPrice).toLocaleString("vi-VN")}đ/tháng/chỗ)`,
        amount: Math.round(newFirstMonthProrated),
      },
      {
        label: "Bù trừ từ HĐ / tiền đã đóng phòng cũ (trừ)",
        amount: Math.round(Math.min(totalCreditFromOld, newFirstMonthProrated)),
      },
      { label: "Phụ thu còn phải thu", amount: supplementAmount },
    ],
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
 * Thực thi chuyển phòng: thanh lý HĐ cũ, HĐ mới 1 năm, giường, tài chính.
 */
async function finalizeRoomTransfer(reg, { reviewedBy, approvalDate }) {
  const financialSnapshot = reg.financialSnapshot || {};
  const registrationDate = startOfDay(
    new Date(financialSnapshot.registrationDate || getRegistrationApplicationDate(reg))
  );
  const apprDay = startOfDay(approvalDate || financialSnapshot.approvalDate || reg.reviewedAt || new Date());

  const targetRoom = await Room.findById(reg.room._id || reg.room).populate("area", "name");
  const oldContract = await Contract.findById(financialSnapshot.oldContractId || reg.currentContract).populate("room");
  if (!targetRoom || !oldContract) {
    const err = new Error("Thiếu dữ liệu phòng hoặc hợp đồng");
    err.statusCode = 400;
    throw err;
  }

  const fromRoom = await Room.findById(oldContract.room?._id || oldContract.room);
  const studentUserId = reg.user._id || reg.user;
  const user = await User.findById(studentUserId);
  const newRoomNumber = targetRoom.roomNumber || "";

  if (String(fromRoom.roomLeader || "") === String(studentUserId)) {
    fromRoom.roomLeader = null;
    await fromRoom.save();
  }

  await settleOldRoomMonthlyBill({
    oldContract,
    studentUserId,
    financialSnapshot,
    registrationDate,
  });

  const upcomingId = financialSnapshot.upcomingRenewal?.contractId;
  let upcomingContract = upcomingId ? await Contract.findById(upcomingId) : await findUpcomingRenewalForActive(oldContract);

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

  await releaseBedForContractId(oldContract._id, reviewedBy || studentUserId, "Chuyển phòng — duyệt đơn");

  const pricing = buildContractPricingFields({ roomDoc: targetRoom, userDoc: user });
  const newEndDate = addOneCalendarYear(registrationDate);

  const now = new Date();
  const newContract = await Contract.create({
    registration: reg._id,
    user: studentUserId,
    room: targetRoom._id,
    startDate: registrationDate,
    endDate: newEndDate,
    contractNumber: `HD-CP${Date.now()}`,
    status: "active",
    isTransferContract: true,
    transferredFromContract: oldContract._id,
    terms: oldContract.terms || "",
    paymentConfirmedAt: now,
    paymentConfirmedBy: reviewedBy || studentUserId,
    adminReviewedAt: now,
    adminReviewedBy: reviewedBy || studentUserId,
    financialLockedAt: now,
    ...pricing,
  });

  if (!targetRoom.roomLeader) {
    targetRoom.roomLeader = studentUserId;
    await targetRoom.save();
  }

  const bedResult = await tryAutoAssignBed(newContract._id, reviewedBy || studentUserId);
  await syncOccupancyForRooms([fromRoom._id, targetRoom._id]);

  let supplementBill = null;
  if (
    financialSnapshot.financialMode === "room_offset" &&
    financialSnapshot.hasPaidOldRoomBill &&
    financialSnapshot.supplementAmount > 0
  ) {
    supplementBill = await createTransferSupplementBill({
      userId: studentUserId,
      newContract,
      newRoom: targetRoom,
      financialSnapshot,
      registrationId: reg._id,
      performedBy: reviewedBy || studentUserId,
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

  return { oldContract, newContract, supplementBill, bedAssigned: bedResult?.ok === true };
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
  if (reg.transferPhase === "completed" || reg.newContract) {
    const err = new Error("Đơn chuyển phòng đã được thực thi");
    err.statusCode = 400;
    throw err;
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
  if (String(fromRoom.area?._id || fromRoom.area) !== String(targetRoom.area?._id || targetRoom.area)) {
    const err = new Error("Chỉ được duyệt chuyển phòng trong cùng khu");
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(reg.user._id || reg.user);
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

  const result = await finalizeRoomTransfer(reg, { reviewedBy, approvalDate });

  const studentId = reg.user._id || reg.user;
  const io = getIO();
  io.emit("registration:approved", {
    userId: String(studentId),
    message: "Đơn chuyển phòng đã được duyệt và hoàn tất",
  });
  await Notification.create({
    user: studentId,
    title: "Chuyển phòng hoàn tất",
    message: `Bạn đã chuyển sang phòng ${targetRoom.roomNumber}. Hợp đồng mới ${result.newContract.contractNumber} đã có hiệu lực (1 năm từ ngày nộp đơn). Vui lòng ký xác nhận tại «Hợp đồng của tôi» nếu chưa ký.`,
    type: "registration_approved",
    link: "/student/my-contracts",
  });

  const populated = await Registration.findById(reg._id)
    .populate("room")
    .populate("fromRoom")
    .populate("newContract", "contractNumber status startDate endDate");

  return {
    registration: populated,
    financialSnapshot,
    ...result,
    message: "Đã duyệt và hoàn tất chuyển phòng.",
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

  const approvalDate = startOfDay(reg.reviewedAt || new Date());
  const result = await finalizeRoomTransfer(reg, { reviewedBy: studentUserId, approvalDate });
  reg.studentConfirmedAt = new Date();
  if (meta.ip) reg.studentConfirmIp = String(meta.ip).slice(0, 64);
  if (meta.ua) reg.studentConfirmUserAgent = String(meta.ua).slice(0, 512);
  await reg.save();

  return { registration: reg, ...result, alreadyCompleted: false };
}

async function getTransferEligibilityForStudent(userId) {
  const { canRequestRoomTransfer } = require("./ktxMembership");
  const canTransfer = await canRequestRoomTransfer(userId);
  const activeContract = await Contract.findOne({ user: userId, status: "active" })
    .populate({ path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } })
    .lean();
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
    canConfirm: reg.status === "approved" && reg.transferPhase !== "completed",
    isCompleted: reg.transferPhase === "completed",
  };
}

module.exports = {
  approveTransferRequest,
  executeRoomTransfer,
  finalizeRoomTransfer,
  getTransferSummaryForStudent,
  getTransferEligibilityForStudent,
  computeTransferFinancials,
  computePaidMonthlyRoomFeesForContract,
  getRegistrationApplicationDate,
  findUpcomingRenewalForActive,
  OLD_CONTRACT_SETTLED_STATUS,
  UPCOMING_CANCEL_NOTE,
};
