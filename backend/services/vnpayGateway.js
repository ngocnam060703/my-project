const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } = require("vnpay");

const DEFAULT_VNPAY_HOST = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const DEFAULT_RETURN_URL = "http://localhost:5001/api/bills/vnpay-return";
const DEFAULT_CLIENT_RETURN_URL = "http://localhost:3000/student/my-bills";

let cachedClient = null;

function getVnpayClient() {
  if (cachedClient) return cachedClient;
  // Fallback sandbox credentials for local demo if .env is missing.
  const tmnCode = String(process.env.VNPAY_TMN_CODE || "Q3DODMVG").trim();
  const secureSecret = String(process.env.VNPAY_HASH_SECRET || "M0UR6SEJHRN37XJ2J07NG2RTQYV20XIQ").trim();
  const rawHost = String(process.env.VNPAY_HOST || DEFAULT_VNPAY_HOST).trim();
  const vnpayHost = rawHost.includes("/paymentv2/vpcpay.html")
    ? rawHost
    : `${rawHost.replace(/\/+$/, "")}/paymentv2/vpcpay.html`;
  cachedClient = new VNPay({
    tmnCode,
    secureSecret,
    vnpayHost,
    testMode: String(process.env.VNPAY_TEST_MODE || "true") === "true",
    hashAlgorithm: "SHA512",
    loggerFn: ignoreLogger,
  });
  return cachedClient;
}

function buildTxnRef(billId) {
  return `${String(billId)}-${Date.now()}`;
}

function parseBillIdFromTxnRef(txnRef) {
  if (!txnRef) return null;
  return String(txnRef).split("-")[0] || null;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.connection?.remoteAddress || "127.0.0.1";
}

async function buildBillPaymentUrl({ req, billId, amount, orderInfo }) {
  const vnpay = getVnpayClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return vnpay.buildPaymentUrl({
    vnp_Amount: Math.round(Number(amount || 0)),
    vnp_IpAddr: getClientIp(req),
    vnp_TxnRef: buildTxnRef(billId),
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: ProductCode.Other,
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL || DEFAULT_RETURN_URL,
    vnp_Locale: VnpLocale.VN,
    vnp_CreateDate: dateFormat(new Date()),
    vnp_ExpireDate: dateFormat(tomorrow),
  });
}

function verifyReturnQuery(query) {
  const vnpay = getVnpayClient();
  return vnpay.verifyReturnUrl(query);
}

function getClientReturnBaseUrl() {
  return process.env.VNPAY_CLIENT_RETURN_URL || DEFAULT_CLIENT_RETURN_URL;
}

module.exports = {
  buildBillPaymentUrl,
  verifyReturnQuery,
  parseBillIdFromTxnRef,
  getClientReturnBaseUrl,
};
