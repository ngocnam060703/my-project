const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } = require("vnpay");

const DEFAULT_VNPAY_HOST = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const DEFAULT_RETURN_URL = "http://localhost:5000/api/bills/vnpay-return";

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

// function buildTxnRef(billId) {
//   return `${String(billId)}-${Date.now()}`;
// }

const crypto = require("crypto");

// function buildTxnRef(billId) {
//   const random = crypto.randomBytes(3).toString("hex");

//   return `${billId}-${random}-${Date.now()}`;
// }
// 2. txnRef
function buildTxnRef(billId) {
  const random = crypto.randomBytes(3).toString("hex");
  return `${billId}_${random}_${Date.now()}`;
}

function parseBillIdFromTxnRef(txnRef) {
  if (!txnRef) return null;
  return String(txnRef).split("_")[0] || null;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.connection?.remoteAddress || "127.0.0.1";
}

function getBackendOriginFromRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = String(req.headers.host || "").trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function resolveReturnUrl(req) {
  // Ưu tiên cấu hình tĩnh để tránh lệch port callback (5000/5001).
  const envReturnUrl = String(process.env.VNPAY_RETURN_URL || "").trim();
  if (envReturnUrl) return envReturnUrl;

  // Fallback theo origin thực tế khi chưa khai báo env.
  const requestOrigin = getBackendOriginFromRequest(req);
  if (requestOrigin) return `${requestOrigin}/api/bills/vnpay-return`;

  const envPort = String(process.env.PORT || "5000").trim();
  return `http://localhost:${envPort}/api/bills/vnpay-return`;
}

async function buildBillPaymentUrl({ req, billId, amount, orderInfo }) {
  const vnpay = getVnpayClient();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return vnpay.buildPaymentUrl({
    // vnp_Amount: Math.round(Number(amount || 0)),
    // 1. amount * 100
  vnp_Amount: Math.round(Number(amount || 0)),
    vnp_IpAddr: getClientIp(req),
    vnp_TxnRef: buildTxnRef(billId),
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: ProductCode.Other,
    vnp_ReturnUrl: resolveReturnUrl(req),
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
