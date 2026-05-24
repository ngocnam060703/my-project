const Bill = require("../models/Bill");

/** Thông báo khi POST đăng ký bị chặn */
const LOCK_REJECT_MESSAGE = "Hóa đơn tháng này đã được chốt. Không thể thay đổi dịch vụ.";

/** Gợi ý hiển thị trên UI (banner) */
const LOCK_BANNER_MESSAGE =
  "Kỳ hóa đơn này đã được chốt sổ. Bạn không thể đăng ký hoặc thay đổi dịch vụ phát sinh. Vui lòng chọn kỳ hóa đơn của tháng tiếp theo nếu muốn đăng ký trước.";

/**
 * Đã chốt hóa đơn = sinh viên có ít nhất một Bill tháng/năm (mọi trạng thái, mọi loại).
 */
async function isStudentServicePeriodLocked(userId, month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!(m >= 1 && m <= 12) || y < 2000) return false;
  const exists = await Bill.exists({ user: userId, month: m, year: y });
  return !!exists;
}

async function getStudentServicePeriodLockStatus(userId, month, year) {
  const locked = await isStudentServicePeriodLocked(userId, month, year);
  return {
    month: Number(month),
    year: Number(year),
    serviceRegistrationLocked: locked,
    lockMessage: locked ? LOCK_REJECT_MESSAGE : null,
    bannerMessage: locked ? LOCK_BANNER_MESSAGE : null,
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
