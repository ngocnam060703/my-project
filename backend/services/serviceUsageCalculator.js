const ServiceUsage = require("../models/ServiceUsage");

/**
 * Tháng (m,y) ngay trước (m-1,y) hoặc (12,y-1).
 */
function previousMonthYear(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (m <= 1) return { month: 12, year: y - 1 };
  return { month: m - 1, year: y };
}

/**
 * Chỉ số kết thời kỳ gần nhất trước kỳ (month,year) — dùng để không cho chỉ số đi lùi.
 */
async function getLatestClosingIndexBefore(roomId, serviceId, month, year) {
  const { month: pm, year: py } = previousMonthYear(month, year);
  const doc = await ServiceUsage.findOne({ room: roomId, service: serviceId, month: pm, year: py })
    .select("newIndex")
    .lean();
  return doc ? Number(doc.newIndex) : null;
}

/**
 * Kiểm tra & tính usage/amount cho dịch vụ variable (điện/nước).
 * @throws {Error} mã lỗi ngắn trong message
 */
async function validateAndComputeVariableUsage({ roomId, serviceId, month, year, oldIndex, newIndex, pricePerUnit }) {
  const o = Number(oldIndex);
  const n = Number(newIndex);
  if (Number.isNaN(o) || Number.isNaN(n)) throw new Error("INVALID_INDEX");
  if (n < o) throw new Error("NEW_INDEX_LT_OLD");

  const prevClose = await getLatestClosingIndexBefore(roomId, serviceId, month, year);
  if (prevClose != null && o < prevClose) {
    throw new Error("OLD_INDEX_LT_PREVIOUS_MONTH_CLOSE");
  }

  const usage = n - o;
  const price = Number(pricePerUnit);
  if (!(price > 0)) throw new Error("INVALID_PRICE");
  const amount = Math.round(usage * price * 100) / 100;
  return { usage, amount, prevClose };
}

module.exports = {
  previousMonthYear,
  getLatestClosingIndexBefore,
  validateAndComputeVariableUsage,
};
