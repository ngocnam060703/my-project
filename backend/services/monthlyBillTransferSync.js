/**
 * Đồng bộ hóa đơn tháng khi sinh viên chuyển phòng — tránh trùng HĐ / sai tiền phòng / sai ví.
 */
const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const Registration = require("../models/Registration");
const { creditUserWallet } = require("./walletCreditService");
const { effectiveContractPrice } = require("./contractPricing");

const SETTLED_CONTRACT_STATUSES = new Set([
  "transferred_settled",
  "terminated",
  "terminated_due_to_transfer",
  "cancelled",
  "completed",
  "expired",
]);

function daysInCalendarMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeProratedRoomFeeFromStart(fullMonthlyFee, startDate, month, year) {
  const fee = Math.max(0, Math.round(Number(fullMonthlyFee) || 0));
  if (fee <= 0 || !startDate) return fee;

  const start = startOfDay(startDate);
  if (start.getFullYear() !== year || start.getMonth() + 1 !== month) return fee;

  const dim = daysInCalendarMonth(year, month);
  const daysInPeriod = Math.max(1, dim - start.getDate() + 1);
  return Math.round((fee * daysInPeriod) / dim);
}

async function findTransferRegistrationForContract(contractId) {
  if (!contractId) return null;
  return Registration.findOne({
    registrationType: "transfer",
    $or: [{ newContract: contractId }, { currentContract: contractId }],
  })
    .select("financialSnapshot transferPhase newContract currentContract")
    .lean();
}

/**
 * Tiền phòng tháng trên HĐ — tháng đầu sau chuyển phòng tính pro-rata theo snapshot đơn CP.
 */
async function resolveRoomFeeForMonthlyBill(contractDoc, month, year) {
  const full = Math.max(0, Math.round(Number(effectiveContractPrice(contractDoc)) || 0));
  if (full <= 0) return full;

  const isTransferLike = !!(contractDoc.isTransferContract || contractDoc.transferredFromContract);
  if (!isTransferLike) return full;

  const reg = await findTransferRegistrationForContract(contractDoc._id);
  const snap = reg?.financialSnapshot;
  if (
    snap &&
    Number(snap.month) === Number(month) &&
    Number(snap.year) === Number(year) &&
    Number(snap.newFirstMonthProrated) >= 0
  ) {
    return Math.round(Number(snap.newFirstMonthProrated));
  }

  return computeProratedRoomFeeFromStart(full, contractDoc.startDate, month, year);
}

async function restoreWalletFromBill(bill, note) {
  const applied = Math.max(0, Math.round(Number(bill.walletCreditApplied) || 0));
  if (applied <= 0) return 0;
  const userId = bill.user?._id || bill.user;
  await creditUserWallet(userId, applied, note || "Hoàn khấu trừ ví — hủy/điều chỉnh hóa đơn tháng");
  return applied;
}

/** Hủy HĐ tháng chưa trả khác trên cùng kỳ — mỗi SV chỉ 1 HĐ tháng / tháng (tránh trùng sau chuyển phòng). */
async function voidSupersededMonthlyBillsForUser({ userId, month, year, keepContractId, performedBy, reason }) {
  if (!userId) return { voided: 0 };

  const others = await Bill.find({
    user: userId,
    month,
    year,
    billType: "monthly",
    contract: { $ne: keepContractId },
    status: { $in: ["unpaid", "pending", "overdue"] },
  });

  let voided = 0;
  for (const bill of others) {
    const con = await Contract.findById(bill.contract).select("status contractNumber").lean();
    if (con?.status === "paid") continue;
    const settled = con && SETTLED_CONTRACT_STATUSES.has(String(con.status));
    if (!con) continue;
    if (!settled && String(con.status) === "active") continue;

    await restoreWalletFromBill(bill, `Hoàn ví — hủy HĐ ${bill.billCode || bill._id} trùng kỳ sau chuyển phòng`);
    bill.roomFee = 0;
    bill.electricityFee = 0;
    bill.waterFee = 0;
    bill.otherFee = 0;
    bill.sharedCommonFee = 0;
    bill.personalServiceFee = 0;
    bill.commonServiceBreakdown = [];
    bill.personalServiceBreakdown = [];
    bill.walletCreditApplied = 0;
    bill.total = 0;
    bill.note = `${bill.note || ""} | ${reason || "Hủy — trùng kỳ, gộp vào HĐ phòng mới"}`.trim();
    bill.paymentHistory = bill.paymentHistory || [];
    bill.paymentHistory.push({
      at: new Date(),
      action: "adjusted",
      amount: 0,
      performedBy: performedBy || null,
      note: reason || "Hủy HĐ tháng trùng kỳ (chuyển phòng)",
    });
    await bill.save();
    voided += 1;
  }
  return { voided };
}

/** Sau hoàn tất chuyển phòng: chốt HĐ tháng phòng cũ (pro-rata / hủy nếu chưa ở ngày nào). */
async function reconcileOldRoomMonthlyBillAfterTransfer({ oldContract, financialSnapshot, performedBy }) {
  if (!oldContract?._id || !financialSnapshot) return null;

  const month = Number(financialSnapshot.month);
  const year = Number(financialSnapshot.year);
  if (!(month >= 1 && month <= 12) || year < 2000) return null;

  const bill = await Bill.findOne({
    contract: oldContract._id,
    month,
    year,
    billType: "monthly",
    status: { $in: ["unpaid", "pending", "overdue"] },
  });
  if (!bill) return null;

  const daysUsedOld = Math.max(0, Number(financialSnapshot.daysUsedOld) || 0);
  const oldActualCharge = Math.max(0, Math.round(Number(financialSnapshot.oldActualCharge) || 0));

  if (daysUsedOld <= 0 && oldActualCharge <= 0) {
    await restoreWalletFromBill(bill, "Hoàn ví — SV chưa ở ngày nào ở phòng cũ");
    bill.roomFee = 0;
    bill.electricityFee = 0;
    bill.waterFee = 0;
    bill.otherFee = 0;
    bill.sharedCommonFee = 0;
    bill.personalServiceFee = 0;
    bill.commonServiceBreakdown = [];
    bill.personalServiceBreakdown = [];
    bill.walletCreditApplied = 0;
    bill.total = 0;
    bill.note = `${bill.note || ""} | Hủy — chuyển phòng ngay, chưa ở ngày nào ở phòng cũ`.trim();
    bill.paymentHistory = bill.paymentHistory || [];
    bill.paymentHistory.push({
      at: new Date(),
      action: "adjusted",
      amount: 0,
      performedBy: performedBy || null,
      note: "Hủy HĐ tháng phòng cũ — chưa ở ngày nào",
    });
    await bill.save();
    return bill;
  }

  if (oldActualCharge > 0 && Number(bill.roomFee) !== oldActualCharge) {
    const prev = bill.roomFee;
    bill.roomFee = oldActualCharge;
    bill.personalServiceFee = 0;
    bill.personalServiceBreakdown = [];
    const gross =
      oldActualCharge +
      Number(bill.electricityFee || 0) +
      Number(bill.waterFee || 0) +
      Number(bill.otherFee || 0) +
      Number(bill.sharedCommonFee || 0);
    await restoreWalletFromBill(bill, "Hoàn ví — điều chỉnh HĐ phòng cũ sau chuyển phòng");
    bill.walletCreditApplied = 0;
    bill.total = Math.round(gross);
    bill.note = `${bill.note || ""} | Chốt ${daysUsedOld} ngày ở phòng cũ (${oldActualCharge.toLocaleString("vi-VN")}đ)`.trim();
    bill.paymentHistory = bill.paymentHistory || [];
    bill.paymentHistory.push({
      at: new Date(),
      action: "adjusted",
      amount: bill.total,
      performedBy: performedBy || null,
      note: `Tiền phòng cũ: ${prev} → ${oldActualCharge}`,
    });
    await bill.save();
  }
  return bill;
}

module.exports = {
  resolveRoomFeeForMonthlyBill,
  voidSupersededMonthlyBillsForUser,
  reconcileOldRoomMonthlyBillAfterTransfer,
  computeProratedRoomFeeFromStart,
};
