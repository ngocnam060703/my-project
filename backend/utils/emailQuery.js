/**
 * Tìm email trong MongoDB không phân biệt hoa/thường (khớp tài khoản tạo trước khi chuẩn hóa email).
 */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @returns {object | null} filter cho User.findOne, hoặc null nếu email rỗng */
function findUserByEmailQuery(normalizedLowerEmail) {
  const e = String(normalizedLowerEmail || "").trim().toLowerCase();
  if (!e) return null;
  return { email: { $regex: new RegExp(`^${escapeRegex(e)}$`, "i") } };
}

module.exports = { escapeRegex, findUserByEmailQuery };
