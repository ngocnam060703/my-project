const Bill = require("../models/Bill");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { assignBillCodeIfMissing } = require("./billCodeGenerator");
const { syncMeterPaymentStatusForRoomPeriod } = require("./meterBillingService");
const UNPAID_STATUSES = ["unpaid", "pending"];

function canSettleBillStatus(status) {
  return status === "overdue" || UNPAID_STATUSES.includes(String(status || ""));
}

async function notifyBillPaid(bill) {
  try {
    const io = getIO();
    io.emit("bill:paid", { userId: String(bill.user), billId: String(bill._id) });
  } catch {
    /* Socket chưa khởi tạo — không chặn xác nhận thanh toán */
  }
  try {
    await Notification.create({
      user: bill.user,
      title: "Hóa đơn đã được xác nhận thanh toán",
      message: `Hóa đơn ${bill.month}/${bill.year} đã được ghi nhận thanh toán.`,
      type: "payment_confirmed",
      link: "/student/my-bills",
    });
  } catch (err) {
    console.warn("[notifyBillPaid] Không tạo được thông báo:", err?.message || err);
  }
}

function pushPaymentHistory(bill, entry) {
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push(entry);
}

/**
 * Admin thu tại quầy — phương thức: counter.
 */
async function settleBillAtCounter({ billId, adminUserId, paymentReference }) {
  const bill = await Bill.findById(billId).populate("contract");
  if (!bill) {
    const err = new Error("Không tìm thấy hóa đơn");
    err.statusCode = 404;
    throw err;
  }
  if (bill.status === "paid") {
    const err = new Error("Hóa đơn đã được thanh toán");
    err.statusCode = 400;
    throw err;
  }
  if (!canSettleBillStatus(bill.status)) {
    const err = new Error("Hóa đơn không ở trạng thái chờ thanh toán");
    err.statusCode = 400;
    throw err;
  }
  if (Number(bill.total || 0) <= 0) {
    const err = new Error("Hóa đơn không hợp lệ: tổng tiền phải lớn hơn 0");
    err.statusCode = 400;
    throw err;
  }

  await assignBillCodeIfMissing(bill);
  const ref = String(paymentReference || "").trim() || bill.billCode || "";

  bill.status = "paid";
  bill.paidAt = new Date();
  bill.paymentMethod = "counter";
  bill.paymentReference = ref;
  bill.paidBy = adminUserId;
  pushPaymentHistory(bill, {
    at: new Date(),
    action: "paid",
    method: "counter",
    reference: ref,
    amount: Math.round(Number(bill.total || 0)),
    performedBy: adminUserId,
    note: "Sinh viên đã thanh toán tại quầy",
  });
  await bill.save();
  if (!bill.billType || bill.billType === "monthly") {
    await syncMeterPaymentStatusForRoomPeriod(bill.room, bill.month, bill.year);
  }
  await notifyBillPaid(bill);
  return bill;
}

/**
 * Sinh viên thanh toán VNPay — phương thức: online.
 */
async function settleBillViaVnpay({ bill, txnRef }) {
  if (bill.status === "paid") return bill;

  await assignBillCodeIfMissing(bill);
  const ref = String(txnRef || "").trim() || bill.billCode || "";

  bill.status = "paid";
  bill.paidAt = new Date();
  bill.paymentMethod = "online";
  bill.paymentReference = ref;
  bill.paidBy = bill.user || null;
  pushPaymentHistory(bill, {
    at: new Date(),
    action: "paid",
    method: "online",
    reference: ref,
    amount: Math.round(Number(bill.total || 0)),
    performedBy: bill.user || null,
    note: "Chuyển khoản qua VNPay",
  });
  await bill.save();
  if (!bill.billType || bill.billType === "monthly") {
    await syncMeterPaymentStatusForRoomPeriod(bill.room, bill.month, bill.year);
  }
  await notifyBillPaid(bill);
  return bill;
}

module.exports = {
  UNPAID_STATUSES,
  canSettleBillStatus,
  settleBillAtCounter,
  settleBillViaVnpay,
};
