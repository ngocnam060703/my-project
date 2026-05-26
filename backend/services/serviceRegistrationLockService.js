const Bill = require("../models/Bill");

/** Thông báo khi POST đăng ký bị chặn */
const LOCK_REJECT_MESSAGE =
  "Admin đã tạo hóa đơn tháng cho kỳ này. Không thể đăng ký hoặc thay đổi dịch vụ.";

/** Gợi ý hiển thị trên UI (banner) — {month}/{year} thay bằng kỳ đang xem */
const LOCK_BANNER_MESSAGE =
  "Admin đã tạo hóa đơn tháng {period}. Bạn không thể đăng ký hoặc thay đổi dịch vụ cho kỳ này. Chọn tháng sau nếu muốn đăng ký trước.";

function monthlyBillExistsFilter(userId, month, year) {
  return {
    user: userId,
    month: Number(month),
    year: Number(year),
    $or: [{ billType: "monthly" }, { billType: { $exists: false } }],
  };
}

/**
 * Khóa đăng ký DV khi SV đã có hóa đơn loại monthly cho đúng tháng/năm (admin đã tạo HĐ tháng).
 * Không khóa vì hóa đơn phạt / bồi thường / phụ thu chuyển phòng.
 */
async function isStudentServicePeriodLocked(userId, month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!(m >= 1 && m <= 12) || y < 2000) return false;
  const exists = await Bill.exists(monthlyBillExistsFilter(userId, m, y));
  return !!exists;
}

async function getStudentServicePeriodLockStatus(userId, month, year) {
  const m = Number(month);
  const y = Number(year);
  const locked = await isStudentServicePeriodLocked(userId, m, y);
  const periodLabel = `${m}/${y}`;
  return {
    month: m,
    year: y,
    serviceRegistrationLocked: locked,
    lockMessage: locked ? LOCK_REJECT_MESSAGE : null,
    bannerMessage: locked ? LOCK_BANNER_MESSAGE.replace("{period}", periodLabel) : null,
  };
}

async function assertStudentServicePeriodEditable(userId, month, year) {
  const locked = await isStudentServicePeriodLocked(userId, month, year);
  if (!locked) return;
  const err = new Error(LOCK_REJECT_MESSAGE);
  err.statusCode = 409;
  err.code = "SERVICE_PERIOD_LOCKED";
  throw err;
}

module.exports = {
  LOCK_REJECT_MESSAGE,
  LOCK_BANNER_MESSAGE,
  isStudentServicePeriodLocked,
  getStudentServicePeriodLockStatus,
  assertStudentServicePeriodEditable,
};
