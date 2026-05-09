/**
 * Cấu hình VNPay (sandbox / production) đọc từ biến môi trường.
 * Return URL phải là endpoint backend để verify chữ ký trước khi redirect về SPA.
 */
function getVnpayConfig() {
  return {
    tmnCode: String(process.env.VNP_TMN_CODE || "").trim(),
    hashSecret: String(process.env.VNP_HASH_SECRET || "").trim(),
    paymentHost: String(process.env.VNP_URL || "").trim(),
    /** GET — backend nhận redirect từ VNPay (vd: http://localhost:5000/api/payment/vnpay-return) */
    returnUrl: String(process.env.VNP_RETURN_URL || "").trim(),
    /** Sau khi xử lý callback — redirect trình duyệt về SPA (vd: http://localhost:3000/student/my-bills) */
    frontendRedirectUrl: String(
      process.env.VNP_FRONTEND_REDIRECT_URL || "http://localhost:3000/student/my-bills"
    ).trim(),
    /** Origin SPA để ghép returnPath tùy chọn (vd: http://localhost:3000) */
    frontendOrigin: String(process.env.VNP_FRONTEND_ORIGIN || "").trim(),
  };
}

/** Danh sách env thiếu — dùng khi tạo URL thanh toán */
function listMissingForPayment(cfg) {
  const missing = [];
  if (!cfg.tmnCode) missing.push("VNP_TMN_CODE");
  if (!cfg.hashSecret) missing.push("VNP_HASH_SECRET");
  if (!cfg.paymentHost) missing.push("VNP_URL");
  if (!cfg.returnUrl) missing.push("VNP_RETURN_URL");
  return missing;
}

module.exports = {
  getVnpayConfig,
  listMissingForPayment,
};
