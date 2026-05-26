const Notification = require("../models/Notification");

exports.getMy = async (req, res) => {
  try {
    const { limit = 20, unreadOnly } = req.query;
    const filter = { user: req.user._id };
    if (unreadOnly === "true") filter.isRead = false;
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true, readAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!notif) return res.status(404).json({ message: "Không tìm thấy thông báo" });
    res.json(notif);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id }, { isRead: true, readAt: new Date() });
    res.json({ message: "Đã đánh dấu đã đọc" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
