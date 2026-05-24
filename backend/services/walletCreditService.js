/**
 * Ví khấu trừ — số dư tự động trừ vào hóa đơn tháng tiếp theo.
 */
const User = require("../models/User");

async function creditUserWallet(userId, amount, note = "") {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0 || !userId) return { credited: 0 };
  await User.findByIdAndUpdate(userId, { $inc: { walletCredit: amt } });
  return { credited: amt, note };
}

/**
 * Trừ ví khi tạo/cập nhật hóa đơn monthly (gọi từ billController).
 * @returns {{ total: number, walletApplied: number }}
 */
async function applyWalletCreditToBillTotal(userId, total) {
  const gross = Math.max(0, Math.round(Number(total) || 0));
  if (!userId || gross <= 0) return { total: gross, walletApplied: 0 };

  const user = await User.findById(userId).select("walletCredit").lean();
  const available = Math.max(0, Math.round(Number(user?.walletCredit) || 0));
  if (available <= 0) return { total: gross, walletApplied: 0 };

  const walletApplied = Math.min(available, gross);
  const newTotal = gross - walletApplied;
  await User.findByIdAndUpdate(userId, { $inc: { walletCredit: -walletApplied } });
  return { total: newTotal, walletApplied };
}

module.exports = {
  creditUserWallet,
  applyWalletCreditToBillTotal,
};
