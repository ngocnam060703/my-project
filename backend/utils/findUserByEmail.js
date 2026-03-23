const { findUserByEmailQuery } = require("./emailQuery");

/**
 * Tìm user theo email đã chuẩn hóa (chữ thường, trim).
 * 1) Khớp chính xác (nhanh, index được)
 * 2) $expr so sánh email lowercase (không dùng RegExp — tránh lỗi driver/Mongo một số môi trường)
 * 3) Fallback RegExp (tương thích cũ)
 */
async function findUserByEmailFlexible(User, normalizedLowerEmail) {
  const email = String(normalizedLowerEmail || "").trim().toLowerCase();
  if (!email) return null;

  let user = await User.findOne({ email });
  if (user) return user;

  try {
    user = await User.findOne({
      $expr: {
        $eq: [{ $toLower: { $ifNull: ["$email", ""] } }, email],
      },
    });
  } catch (e) {
    console.warn("[findUserByEmail] $expr:", e?.message || e);
  }
  if (user) return user;

  const q = findUserByEmailQuery(email);
  if (!q) return null;
  try {
    return await User.findOne(q);
  } catch (e) {
    console.warn("[findUserByEmail] regex:", e?.message || e);
    return null;
  }
}

module.exports = { findUserByEmailFlexible };
