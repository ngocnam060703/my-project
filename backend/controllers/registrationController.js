const Registration = require("../models/Registration");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { isSchoolYearNotPast } = require("../utils/schoolYear");
const RegistrationPeriod = require("../models/RegistrationPeriod");

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    if (req.user.role === "manager" && req.user.managedArea) {
      const rooms = await Room.find({ area: req.user.managedArea }).select("_id");
      filter.room = { $in: rooms.map((r) => r._id) };
    }
    const registrations = await Registration.find(filter)
      .populate("user", "fullName email phone studentId")
      .populate("room")
      .populate("room.area", "name")
      .populate("reviewedBy", "fullName")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    const total = await Registration.countDocuments(filter);
    res.json({ registrations, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyRegistrations = async (req, res) => {
  try {
    const registrations = await Registration.find({ user: req.user._id })
      .populate("room")
      .populate("room.area", "name")
      .sort({ createdAt: -1 });
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { room, semester, schoolYear, startDate } = req.body;
    const existing = await Registration.findOne({ user: req.user._id, status: "pending" });
    if (existing) return res.status(400).json({ message: "Bạn đã có đơn đăng ký đang chờ duyệt" });
    const roomDoc = await Room.findById(room);
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (roomDoc.currentOccupancy >= roomDoc.capacity) return res.status(400).json({ message: "Phòng đã đầy" });
    const start = startDate ? new Date(startDate) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ message: "Vui lòng chọn ngày bắt đầu" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startNormalized = new Date(start);
    startNormalized.setHours(0, 0, 0, 0);
    if (startNormalized < today) {
      return res.status(400).json({ message: "Ngày bắt đầu không được ở trong quá khứ" });
    }
    if (!schoolYear || typeof schoolYear !== "string" || !isSchoolYearNotPast(schoolYear)) {
      return res.status(400).json({
        message:
          "Năm học không hợp lệ hoặc đã qua. Dùng định dạng VD: 2024-2025 (năm kết thúc phải từ năm hiện tại trở đi).",
      });
    }
    const periodCount = await RegistrationPeriod.countDocuments();
    if (periodCount > 0) {
      const now = new Date();
      const period = await RegistrationPeriod.findOne({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
      if (!period) {
        return res.status(400).json({ message: "Đăng ký nội trú hiện đã đóng. Vui lòng đợi đợt đăng ký tiếp theo." });
      }
    }
    const registration = await Registration.create({ user: req.user._id, room, semester, schoolYear, startDate: startNormalized });
    res.status(201).json(await registration.populate(["room", "room.area"]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.id).populate("room").populate("user");
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    if (reg.status !== "pending") return res.status(400).json({ message: "Đơn đã được xử lý" });
    const room = await Room.findById(reg.room._id);
    if (room.currentOccupancy >= room.capacity) return res.status(400).json({ message: "Phòng đã đầy" });
    reg.status = "approved";
    reg.reviewedBy = req.user._id;
    reg.reviewedAt = new Date();
    await reg.save();
    room.currentOccupancy += 1;
    room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
    if (!room.roomLeader) room.roomLeader = reg.user._id;
    await room.save();
    const startDate = reg.startDate ? new Date(reg.startDate) : new Date();
    const io = getIO();
    io.emit("registration:approved", { userId: reg.user._id.toString(), message: "Đơn đăng ký của bạn đã được duyệt" });
    await Notification.create({
      user: reg.user._id,
      title: "Đơn được duyệt",
      message: "Đơn của bạn đã được phê duyệt, vui lòng thanh toán để hoàn tất.",
      type: "registration_approved",
      link: "/my-contracts",
    });

    const contract = await Contract.create({
      registration: reg._id,
      user: reg.user._id,
      room: reg.room._id,
      startDate,
      endDate: new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)),
      contractNumber: `HD-${Date.now()}`,
      signedAt: new Date(),
    });
    res.json({ registration: reg, contract });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const regBefore = await Registration.findById(req.params.id).select("user");
    const reason = req.body.reason || "";
    const reg = await Registration.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", reviewedBy: req.user._id, reviewedAt: new Date(), rejectionReason: reason },
      { new: true }
    );
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    const io = getIO();
    io.emit("registration:rejected", { userId: regBefore?.user?.toString(), message: "Đơn đăng ký của bạn đã bị từ chối", reason });
    if (regBefore?.user) {
      await Notification.create({
        user: regBefore.user,
        title: "Đơn bị từ chối",
        message: reason ? `Đơn của bạn đã bị từ chối. Lý do: ${reason}` : "Đơn của bạn đã bị từ chối.",
        type: "registration_rejected",
        link: "/my-registrations",
      });
    }
    res.json(reg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.id);
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    if (reg.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền hủy đơn này" });
    }
    if (reg.status !== "pending") {
      return res.status(400).json({ message: "Chỉ có thể hủy đơn đang chờ duyệt" });
    }
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã hủy đơn đăng ký" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
