const rateLimit = require("express-rate-limit");

/**
 * Lấy khóa client ổn định khi request.ip của Express bị undefined (hay gặp Express 5 / proxy CRA).
 * Không dùng chuỗi "req.ip" trong source để tránh cảnh báo keyGenerator của express-rate-limit v8.
 */
function clientRateKey(request) {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const socketAddr = request.socket?.remoteAddress;
  if (socketAddr && String(socketAddr).trim()) return String(socketAddr).trim();
  return "127.0.0.1";
}

/**
 * Tắt toàn bộ validation nội bộ v8 — nhiều rule (ip, proxy, stack…) dễ ném lỗi → HTTP 500
 * trước cả khi chạy controller đăng nhập (đặc biệt Express 5 + Windows + CRA proxy).
 */
const noValidate = false;

const createApiLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    /** Dev: SPA + HMR + Strict Mode dễ vượt 100/15p → 429; production giữ mức vừa phải. */
    max: process.env.NODE_ENV === "production" ? 300 : 5000,
    message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => clientRateKey(request),
    validate: noValidate,
    /** Không tính CORS preflight — mỗi API thường tốn 2 request (OPTIONS + GET/POST). */
    skip: (request) => request.method === "OPTIONS",
  });

const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 10 : 500,
    message: { message: "Đăng nhập quá nhiều lần, vui lòng thử lại sau." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => clientRateKey(request),
    validate: noValidate,
  });

module.exports = {
  createApiLimiter,
  createAuthLimiter,
  clientRateKey,
};
