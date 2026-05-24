/** Lấy IP client (hỗ trợ proxy) — dùng cho audit trail ký hợp đồng. */
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  if (Array.isArray(xf) && xf.length) {
    return String(xf[0]).trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

module.exports = { getClientIp };
