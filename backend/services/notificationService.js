const Notification = require("../models/Notification");
const { getIO } = require("../socket");

/** Đồng bộ với enum trong models/Notification.js */
const NOTIFICATION_TYPES = new Set([
  "registration_approved",
  "registration_rejected",
  "bill_reminder",
  "contract_renewal",
  "payment_confirmed",
  "contract_signed",
  "contract_pending_admin_confirm",
  "contract_active",
  "discipline_warning",
  "discipline_admin",
  "discipline_expel",
  "discipline_resolved",
  "general",
]);

function normalizeType(type) {
  const t = String(type || "general").trim();
  return NOTIFICATION_TYPES.has(t) ? t : "general";
}

/**
 * Gửi thông báo — không throw nếu lưu DB lỗi (tránh rollback nghiệp vụ chính).
 */
async function sendNotification({ userId, title, message, type = "general", link = "" }) {
  if (!userId) return null;
  const safeType = normalizeType(type);
  try {
    const doc = await Notification.create({
      user: userId,
      title: String(title || "").trim() || "Thông báo",
      message: String(message || "").trim() || "",
      type: safeType,
      link: String(link || "").trim(),
    });
    const io = getIO();
    io.emit("notification:new", {
      userId: String(userId),
      title: doc.title,
      message: doc.message,
      link: doc.link,
      type: safeType,
    });
    return doc;
  } catch (e) {
    console.error("[notificationService]", e.message);
    return null;
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  normalizeType,
  sendNotification,
};
