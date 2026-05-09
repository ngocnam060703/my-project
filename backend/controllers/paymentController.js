const { getVnpayConfig, listMissingForPayment } = require("../config/vnpay");
const { getIO } = require("../socket");
const {
  normalizeClientIp,
  assertBillPayableForUser,
  buildPaymentUrl,
  recordPendingVnpayIntent,
  finalizeBillFromVnpParams,
} = require("../services/paymentService");

const ALLOWED_RETURN_PATHS = new Set(["/student/my-bills", "/admin/bills"]);

function normalizeOptionalReturnPath(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (!ALLOWED_RETURN_PATHS.has(s)) return "";
  return s;
}

function resolveFrontendRedirect(returnPathFromOrder, cfg) {
  const origin = (cfg.frontendOrigin || "").replace(/\/+$/, "");
  if (origin && returnPathFromOrder) {
    return `${origin}${returnPathFromOrder}`;
  }
  return cfg.frontendRedirectUrl;
}

function redirectBrowser(res, baseUrl, query) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    url = new URL("http://localhost:3000/student/my-bills");
  }
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  });
  return res.redirect(302, url.toString());
}

/**
 * POST /api/payment/create-vnpay
 * Body: { invoiceId, amount, returnPath? } — amount phải khớp server (chống sửa số tiền client).
 */
exports.createVnpay = async (req, res) => {
  try {
    const cfg = getVnpayConfig();
    const missing = listMissingForPayment(cfg);
    if (missing.length) {
      return res.status(500).json({
        message: `Thiếu cấu hình VNPay: ${missing.join(", ")}`,
      });
    }

    const invoiceId = req.body?.invoiceId ?? req.body?.billId;
    const amount = req.body?.amount;
    const returnPath = normalizeOptionalReturnPath(req.body?.returnPath);

    if (!invoiceId || amount === undefined || amount === null) {
      return res.status(400).json({ message: "Thiếu invoiceId hoặc amount" });
    }

    const bill = await assertBillPayableForUser({
      billId: invoiceId,
      clientAmountVnd: amount,
      user: req.user,
    });

    const clientIp = normalizeClientIp(req);
    const { paymentUrl, txnRef } = buildPaymentUrl({
      bill,
      clientIp,
      cfg,
      returnPath,
    });

    await recordPendingVnpayIntent(bill, req.user._id, txnRef);

    return res.json({ paymentUrl, txnRef });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    return res.status(status).json({ message: error.message || "Lỗi tạo thanh toán" });
  }
};

/**
 * GET /api/payment/vnpay-return
 * VNPay redirect trình duyệt về đây — verify hash, cập nhật hóa đơn nếu thành công, rồi redirect SPA.
 */
exports.vnpayReturn = async (req, res) => {
  try {
    const cfg = getVnpayConfig();
    const secret = cfg.hashSecret;
    if (!secret) {
      return redirectBrowser(res, cfg.frontendRedirectUrl, { vnpay: "config_error" });
    }

    const result = await finalizeBillFromVnpParams({
      secret,
      queryParams: req.query,
      getIo: getIO,
    });

    const targetBase = resolveFrontendRedirect(result.returnPath || "", cfg);

    if (result.outcome === "invalid_signature") {
      return redirectBrowser(res, targetBase, { vnpay: "invalid" });
    }
    if (result.outcome === "amount_mismatch") {
      return redirectBrowser(res, targetBase, { vnpay: "amount_mismatch", invoiceId: result.billId || "" });
    }
    if (result.outcome === "order_bad" || result.outcome === "bill_missing") {
      return redirectBrowser(res, targetBase, { vnpay: "not_found" });
    }
    if (result.outcome === "already_paid") {
      return redirectBrowser(res, targetBase, { vnpay: "already_paid", invoiceId: result.billId || "" });
    }
    if (result.outcome === "success") {
      return redirectBrowser(res, targetBase, { vnpay: "success", invoiceId: result.billId || "" });
    }
    return redirectBrowser(res, targetBase, {
      vnpay: "failed",
      invoiceId: result.billId || "",
      code: result.rspCode || "",
    });
  } catch (error) {
    console.error("vnpayReturn:", error);
    try {
      const cfg = getVnpayConfig();
      return redirectBrowser(res, cfg.frontendRedirectUrl, { vnpay: "server_error" });
    } catch {
      return res.status(500).send("Server error");
    }
  }
};

/**
 * GET /api/payment/vnpay-ipn
 * Server-to-server — VNPay sandbox thường gọi GET kèm query (giống return).
 */
exports.vnpayIpn = async (req, res) => {
  try {
    const cfg = getVnpayConfig();
    const secret = cfg.hashSecret;
    if (!secret) {
      return res.status(500).json({ RspCode: "99", Message: "Missing config" });
    }

    const result = await finalizeBillFromVnpParams({
      secret,
      queryParams: req.query,
      getIo: getIO,
    });

    return res.status(result.httpStatus || 200).json(result.ipn || { RspCode: "99", Message: "Unknown" });
  } catch (error) {
    console.error("vnpayIpn:", error);
    return res.status(500).json({ RspCode: "99", Message: error.message || "Server error" });
  }
};
