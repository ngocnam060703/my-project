/**
 * Dịch vụ thanh toán VNPay — sinh URL, ký HMAC SHA512, verify callback (return / IPN).
 *
 * Luồng KTX: Invoice (Bill) → cổng VNPay → callback hợp lệ → cập nhật Bill → Socket “bill:paid”
 * → các API “công nợ” (GET bills unpaid / dashboard) tự đồng bộ vì đọc trực tiếp từ MongoDB.
 */
const crypto = require("crypto");
const qs = require("qs");
const moment = require("moment");
const Bill = require("../models/Bill");

/** Trạng thái coi là chưa thanh toán */
const UNPAID_STATUSES = ["unpaid", "pending"];

/**
 * Lọc key có giá trị rỗng và sắp xếp key alphabet — chuẩn VNPay ký request.
 */
function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "")
    .sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Chuỗi query để hash — qs đảm bảo encode khớp khi verify phản hồi.
 */
function buildSignData(params) {
  const sorted = sortObject(params);
  return qs.stringify(sorted, {
    encodeValuesOnly: true,
    sort: (a, b) => a.localeCompare(b),
  });
}

function hmacSha512(secret, data) {
  return crypto.createHmac("sha512", secret).update(Buffer.from(data, "utf-8")).digest("hex");
}

function verifySecureHash(secret, queryParams) {
  const params = { ...queryParams };
  const secureHash = String(params.vnp_SecureHash || "").trim();
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;
  const signData = buildSignData(params);
  const signed = hmacSha512(secret, signData);
  return { ok: signed === secureHash, signData };
}

function formatCreateDate(date) {
  return moment(date).format("YYYYMMDDHHmmss");
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

function parseBillMetaFromOrderInfo(orderInfo) {
  const raw = String(orderInfo || "");
  const billMatch = raw.match(/billId=([a-f0-9]{24})/i);
  const billId = billMatch ? billMatch[1] : "";
  const retMatch = raw.match(/\|\s*retPath=([^|]+)/);
  let returnPath = "";
  if (retMatch) {
    const decoded = decodeURIComponent(String(retMatch[1]).trim());
    if (decoded.startsWith("/") && !decoded.includes("..")) returnPath = decoded;
  }
  return { billId, returnPath };
}

function normalizeClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = forwarded ? String(forwarded).split(",")[0].trim() : req.socket.remoteAddress || "127.0.0.1";
  return raw.replace(/^::ffff:/, "") || "127.0.0.1";
}

function appendBillMetaToOrderInfo(baseOrderInfo, billId, returnPath) {
  let s = `${baseOrderInfo} | billId=${billId}`;
  if (returnPath) {
    s += ` | retPath=${encodeURIComponent(returnPath)}`;
  }
  return s;
}

/**
 * Kiểm tra quyền và điều kiện nghiệp vụ trước khi tạo URL cổng thanh toán.
 */
async function assertBillPayableForUser({ billId, clientAmountVnd, user }) {
  const bill = await Bill.findById(billId).populate("contract").populate("user", "fullName");
  if (!bill) {
    const err = new Error("Không tìm thấy hóa đơn");
    err.statusCode = 404;
    throw err;
  }

  const isStaff = user.role === "admin" || user.role === "manager";
  const billUserId = String(bill.user?._id || bill.user || "");
  if (!isStaff && billUserId !== String(user._id)) {
    const err = new Error("Không có quyền thanh toán hóa đơn này");
    err.statusCode = 403;
    throw err;
  }

  if (bill.status === "paid") {
    const err = new Error("Hóa đơn đã được thanh toán");
    err.statusCode = 400;
    throw err;
  }

  if (!UNPAID_STATUSES.includes(bill.status) && bill.status !== "overdue") {
    const err = new Error("Hóa đơn không ở trạng thái chờ thanh toán");
    err.statusCode = 400;
    throw err;
  }

  if (bill.contract && isContractExpired(bill.contract.endDate, new Date())) {
    const err = new Error("Hợp đồng đã hết hạn, không thể thanh toán");
    err.statusCode = 400;
    throw err;
  }

  const expected = Math.round(Number(bill.total || 0));
  const posted = Math.round(Number(clientAmountVnd));
  if (!Number.isFinite(posted) || posted <= 0 || posted !== expected) {
    const err = new Error("Số tiền không khớp với hóa đơn");
    err.statusCode = 400;
    throw err;
  }

  return bill;
}

/**
 * Sinh URL VNPay + txnRef (mã đơn hàng phía merchant).
 */
function buildPaymentUrl({ bill, clientIp, cfg, returnPath }) {
  const now = new Date();
  const txnRef = `KTX${String(bill._id).slice(-10)}${now.getTime()}`;
  const amountMinor = Math.round(Number(bill.total || 0)) * 100;

  const baseOrderInfo =
    `Thanh toan hoa don ${bill.billType === "penalty" ? "phat" : "thang"} ${bill.month}/${bill.year}`.trim();
  const orderInfo = appendBillMetaToOrderInfo(baseOrderInfo, bill._id, returnPath || "");

  const params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: cfg.tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Amount: amountMinor,
    vnp_ReturnUrl: cfg.returnUrl,
    vnp_IpAddr: clientIp,
    vnp_CreateDate: formatCreateDate(now),
  };

  const signData = buildSignData(params);
  const secureHash = hmacSha512(cfg.hashSecret, signData);
  const sep = cfg.paymentHost.includes("?") ? "&" : "?";
  const paymentUrl = `${cfg.paymentHost}${sep}${signData}&vnp_SecureHash=${secureHash}`;

  return { paymentUrl, txnRef, amountMinor };
}

/**
 * Ghi nhận phiên thanh toán đang chờ cổng (không đánh dấu đã trả).
 */
async function recordPendingVnpayIntent(bill, userId, txnRef) {
  bill.paymentReference = txnRef;
  bill.paymentHistory = bill.paymentHistory || [];
  bill.paymentHistory.push({
    at: new Date(),
    action: "created",
    method: "vnpay",
    reference: txnRef,
    amount: Math.round(Number(bill.total || 0)),
    performedBy: userId || null,
    note: "Khởi tạo thanh toán VNPay — chờ callback xác nhận",
  });
  await bill.save();
}

/**
 * Xử lý sau khi verify chữ ký thành công (Return URL hoặc IPN).
 * Chỉ cập nhật trạng thái “Đã thanh toán” khi checksum đúng và ResponseCode (và TransactionStatus) báo thành công.
 */
async function finalizeBillFromVnpParams({ secret, queryParams, getIo }) {
  const verify = verifySecureHash(secret, queryParams);
  if (!verify.ok) {
    return { outcome: "invalid_signature", httpStatus: 200, ipn: { RspCode: "97", Message: "Invalid signature" } };
  }

  const params = { ...queryParams };
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const rspCode = String(params.vnp_ResponseCode || "");
  const txnStatus = String(params.vnp_TransactionStatus || "");
  const txnRef = String(params.vnp_TxnRef || "");
  const amountVnd = Math.round(Number(params.vnp_Amount || 0) / 100);
  const transactionNo = String(params.vnp_TransactionNo || "").trim();
  const payDateRaw = String(params.vnp_PayDate || "");

  const { billId, returnPath } = parseBillMetaFromOrderInfo(params.vnp_OrderInfo);

  if (!billId) {
    return { outcome: "order_bad", httpStatus: 200, ipn: { RspCode: "01", Message: "Order not found" } };
  }

  const bill = await Bill.findById(billId);
  if (!bill) {
    return { outcome: "bill_missing", httpStatus: 200, ipn: { RspCode: "01", Message: "Order not found" } };
  }

  if (bill.status === "paid") {
    return {
      outcome: "already_paid",
      billId,
      returnPath,
      httpStatus: 200,
      ipn: { RspCode: "00", Message: "Already confirmed" },
    };
  }

  if (amountVnd !== Math.round(Number(bill.total || 0))) {
    return { outcome: "amount_mismatch", billId, returnPath, httpStatus: 200, ipn: { RspCode: "04", Message: "Invalid amount" } };
  }

  const gatewayOk = rspCode === "00" && txnStatus === "00";

  bill.paymentHistory = bill.paymentHistory || [];
  const paidAtFromGateway = payDateRaw.length >= 14 ? moment(payDateRaw, "YYYYMMDDHHmmss").toDate() : new Date();

  bill.paymentHistory.push({
    at: new Date(),
    action: gatewayOk ? "paid" : "adjusted",
    method: "vnpay",
    reference: txnRef,
    amount: amountVnd,
    performedBy: null,
    note: gatewayOk
      ? `VNPay giao dịch thành công (GD: ${transactionNo || "—"})`
      : `VNPay không thành công — ResponseCode=${rspCode}, TransactionStatus=${txnStatus}`,
  });

  if (gatewayOk) {
    bill.status = "paid";
    bill.paidAt = paidAtFromGateway;
    bill.paymentMethod = "vnpay";
    bill.paymentReference = txnRef;
    bill.vnpayTransactionNo = transactionNo;
    await bill.save();

    const io = typeof getIo === "function" ? getIo() : null;
    if (io) {
      io.emit("bill:paid", { userId: String(bill.user), billId: String(bill._id) });
    }

    return {
      outcome: "success",
      billId,
      returnPath,
      httpStatus: 200,
      ipn: { RspCode: "00", Message: "Confirm Success" },
    };
  }

  /**
   * Thất bại: không đổi status hiện tại (unpaid / overdue / pending) — chỉ lưu lịch sử để đối soát.
   */
  await bill.save();

  return {
    outcome: "failed",
    billId,
    returnPath,
    rspCode,
    txnStatus,
    httpStatus: 200,
    ipn: { RspCode: "00", Message: "Confirm received" },
  };
}

module.exports = {
  sortObject,
  buildSignData,
  hmacSha512,
  verifySecureHash,
  normalizeClientIp,
  assertBillPayableForUser,
  buildPaymentUrl,
  recordPendingVnpayIntent,
  finalizeBillFromVnpParams,
  appendBillMetaToOrderInfo,
};
