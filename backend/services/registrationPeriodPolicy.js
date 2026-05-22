const RegistrationPeriod = require("../models/RegistrationPeriod");

/** Đợt đang mở theo thời gian (không phụ thuộc bật/tắt thủ công). */
async function findOpenRegistrationPeriod(now = new Date()) {
  return RegistrationPeriod.findOne({
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ startDate: -1 })
    .lean();
}

/** Đợt sắp mở gần nhất. */
async function findNextRegistrationPeriod(now = new Date()) {
  return RegistrationPeriod.findOne({
    startDate: { $gt: now },
  })
    .sort({ startDate: 1 })
    .lean();
}

module.exports = {
  findOpenRegistrationPeriod,
  findNextRegistrationPeriod,
};
