const mongoose = require("mongoose");
const MaintenanceReport = require("../models/MaintenanceReport");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

const ACTIVE_CONTRACT = { $in: ["active", "pending_payment"] };

/** Hợp đồng còn hiệu lực gần nhất → phòng sinh viên đang ở (dùng cho auto room khi tạo báo cáo). */
async function resolveResidentContract(userId) {
  return Contract.findOne({
    user: userId,
    status: ACTIVE_CONTRACT,
  })
    .sort({ startDate: -1 })
    .populate({
      path: "room",
      select: "roomNumber area",
      populate: { path: "area", select: "name" },
    });
}

async function notifyAdminsNewReport({ reporter, roomDoc, incidentType }) {
  const io = getIO();
  const areaId = String(roomDoc?.area?._id || roomDoc?.area || "");
  const typeLabel = { electricity: "Điện", water: "Nước", equipment: "Thiết bị", other: "Khác" }[incidentType] || incidentType;
  const admins = await User.find({
    $or: [{ role: "admin" }, { role: "manager", managedArea: areaId || null }],
  }).select("_id");
  if (!admins.length) return;
  const title = "Khai báo hư hỏng mới";
  const msg = `${reporter?.fullName || "Sinh viên"} báo sự cố [${typeLabel}] tại phòng ${roomDoc?.roomNumber || ""}.`;
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message: msg,
      type: "general",
      link: "/admin/maintenance-reports",
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message: msg, link: "/admin/maintenance-reports" });
  }
}

async function notifyStudentResolved({ studentId, roomNumber }) {
  const io = getIO();
  const title = "Khai báo hư hỏng đã xử lý";
  const message = `Yêu cầu sửa chữa liên quan phòng ${roomNumber || ""} đã được đánh dấu hoàn thành.`;
  await Notification.create({
    user: studentId,
    title,
    message,
    type: "general",
    link: "/student/damage-report",
  });
  io.emit("notification:new", { userId: String(studentId), title, message, link: "/student/damage-report" });
}

/** GET /api/my-reports — chỉ báo cáo của sinh viên đang đăng nhập */
exports.listMine = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const items = await MaintenanceReport.find({ user: req.user._id })
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** POST /api/reports — tạo báo cáo; phòng lấy tự động từ hợp đồng */
exports.create = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên được tạo khai báo" });
    const { type: incidentType, description, images } = req.body;
    const contract = await resolveResidentContract(req.user._id);
    if (!contract || !contract.room) {
      return res.status(403).json({ message: "Bạn chưa có hợp đồng phòng đang hiệu lực để gửi khai báo" });
    }
    const roomId = contract.room._id || contract.room;
    const roomDoc =
      typeof contract.room === "object" && contract.room.roomNumber != null
        ? contract.room
        : await Room.findById(roomId).populate("area", "name");
    if (!roomDoc) return res.status(400).json({ message: "Không xác định được phòng" });

    const imgs = Array.isArray(images) ? images.filter((x) => typeof x === "string").slice(0, 10) : [];

    const doc = await MaintenanceReport.create({
      user: req.user._id,
      room: roomId,
      incidentType,
      description: String(description || "").trim(),
      images: imgs,
      status: "pending",
    });
    await notifyAdminsNewReport({
      reporter: req.user,
      roomDoc,
      incidentType,
    });
    const populated = await MaintenanceReport.findById(doc._id)
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("user", "fullName studentId email");
    res.status(201).json(populated);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** GET /api/reports/:id — sinh viên chỉ xem của mình; admin/manager xem mọi */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const doc = await MaintenanceReport.findById(id)
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("user", "fullName studentId email phone");
    if (!doc) return res.status(404).json({ message: "Không tìm thấy khai báo" });

    const isStaff = req.user.role === "admin" || req.user.role === "manager";
    const isOwner = String(doc.user?._id || doc.user) === String(req.user._id);
    if (isStaff || (isOwner && req.user.role === "user")) return res.json(doc);
    return res.status(403).json({ message: "Không có quyền xem khai báo này" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** DELETE /api/reports/:id — hủy khi còn pending, chỉ chủ báo cáo */
exports.cancel = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const doc = await MaintenanceReport.findById(id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy khai báo" });
    if (String(doc.user) !== String(req.user._id)) return res.status(403).json({ message: "Không phải khai báo của bạn" });
    if (doc.status !== "pending") {
      return res.status(400).json({ message: "Chỉ hủy được khi trạng thái là chờ xử lý" });
    }
    await MaintenanceReport.deleteOne({ _id: doc._id });
    res.json({ ok: true, deleted: String(doc._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** GET /api/admin/maintenance-reports — BQL xem danh sách (phân trang) */
exports.adminList = async (req, res) => {
  try {
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Không có quyền" });
    const status = String(req.query.status || "all");
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (status !== "all") filter.status = status;
    /** Manager chỉ xem phòng thuộc khu được giao; nếu chưa gán khu → xem toàn bộ (fallback cấu hình). */
    if (req.user.role === "manager" && req.user.managedArea) {
      const rooms = await Room.find({ area: req.user.managedArea }).select("_id");
      if (rooms.length) filter.room = { $in: rooms.map((r) => r._id) };
    }
    const [items, total] = await Promise.all([
      MaintenanceReport.find(filter)
        .populate("user", "fullName studentId email")
        .populate("room", "roomNumber area")
        .populate("room.area", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MaintenanceReport.countDocuments(filter),
    ]);
    res.json({ reports: items, total, page, limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** PATCH /api/admin/maintenance-reports/:id — cập nhật trạng thái / ghi chú */
exports.adminPatch = async (req, res) => {
  try {
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const doc = await MaintenanceReport.findById(id).populate("room", "roomNumber area");
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });
    if (req.user.role === "manager" && req.user.managedArea) {
      const roomArea = doc.room?.area?._id || doc.room?.area;
      if (String(roomArea || "") !== String(req.user.managedArea)) {
        return res.status(403).json({ message: "Khai báo không thuộc khu bạn quản lý" });
      }
    }
    const prevStatus = doc.status;
    const { status, adminNote } = req.body;
    if (status != null) doc.status = status;
    if (adminNote != null) doc.adminNote = String(adminNote).trim();
    await doc.save();
    if (prevStatus !== "resolved" && doc.status === "resolved") {
      await notifyStudentResolved({
        studentId: doc.user,
        roomNumber: doc.room?.roomNumber,
      });
    }
    const out = await MaintenanceReport.findById(doc._id)
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name");
    res.json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
