const Bill = require("../models/Bill");
const { assignBillCodeIfMissing } = require("./billCodeGenerator");
const Contract = require("../models/Contract");
const { sendNotification } = require("./notificationService");
const { getIO } = require("../socket");

const ACTIVE_CONTRACT = { $in: ["active", "pending_payment"] };

/**
 * Tạo hóa đơn «Bồi thường hư hỏng» — tách biệt hóa đơn phạt vi phạm kỷ luật.
 */
async function createDamageReimbursementBill({ reportDoc, amount, adminUserId }) {
  const totalAmount = Math.round(Number(amount) || 0);
  if (totalAmount <= 0) {
    throw new Error("Chi phí bồi thường phải lớn hơn 0");
  }

  const existing = await Bill.findOne({ maintenanceReport: reportDoc._id });
  if (existing) return existing;

  const userId = reportDoc.user?._id || reportDoc.user;
  const roomId = reportDoc.room?._id || reportDoc.room;

  const contract = await Contract.findOne({
    user: userId,
    room: roomId,
    status: ACTIVE_CONTRACT,
  }).sort({ startDate: -1 });

  if (!contract) {
    throw new Error("Không tìm thấy hợp đồng hiệu lực để tạo hóa đơn bồi thường");
  }

  const now = new Date();
  const requestCode = reportDoc.requestCode || String(reportDoc._id).slice(-6);
  const bill = await Bill.create({
    billType: "damage_reimbursement",
    maintenanceReport: reportDoc._id,
    penaltyBreakdown: [{ label: "Bồi thường hư hỏng", amount: totalAmount }],
    contract: contract._id,
    user: userId,
    room: roomId,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    roomFee: 0,
    electricityFee: 0,
    waterFee: 0,
    otherFee: 0,
    sharedCommonFee: 0,
    personalServiceFee: 0,
    occupants: 1,
    total: totalAmount,
    dueDate: new Date(now.getFullYear(), now.getMonth(), Math.min(28, now.getDate() + 14)),
    status: "unpaid",
    note: `Bồi thường hư hỏng — mã yêu cầu ${requestCode}`,
    paymentHistory: [
      {
        at: now,
        action: "created",
        amount: totalAmount,
        performedBy: adminUserId || null,
        note: "Tạo từ khai báo hư hỏng",
      },
    ],
  });

  await assignBillCodeIfMissing(bill);

  const io = getIO();
  io.emit("bill:new", { userId: String(userId), message: "Bạn có hóa đơn bồi thường hư hỏng mới" });
  await sendNotification({
    userId,
    title: "Hóa đơn bồi thường hư hỏng",
    message: `Bạn có khoản bồi thường hư hỏng ${totalAmount.toLocaleString("vi-VN")}đ. Vui lòng thanh toán tại mục Hóa đơn.`,
    type: "bill_reminder",
    link: "/student/my-bills",
  });

  return bill;
}

module.exports = { createDamageReimbursementBill };
