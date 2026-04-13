/**
 * Hạn thanh toán mặc định theo tháng hóa đơn (ví dụ ngày 10).
 * Dùng biến môi trường BILL_DUE_DAY (1–28) để tránh lỗi tháng 2.
 */
function clampDueDay(raw) {
  const n = parseInt(String(raw || "10"), 10);
  if (Number.isNaN(n)) return 10;
  return Math.min(28, Math.max(1, n));
}

function dueDateForBillingMonth(year, month, dueDayOpt) {
  const y = Number(year);
  const m = Number(month);
  const day = clampDueDay(dueDayOpt != null ? dueDayOpt : process.env.BILL_DUE_DAY);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(day, lastDay);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

module.exports = { dueDateForBillingMonth, clampDueDay };
