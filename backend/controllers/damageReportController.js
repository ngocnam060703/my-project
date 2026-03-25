const DamageReport = require("../models/DamageReport");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const FacilityLocation = require("../models/FacilityLocation");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

async function notifyAdminsDamageReport({ reporter, roomDoc, device }) {
  const io = getIO();
  const areaId = String(roomDoc?.area?._id || roomDoc?.area || "");
  const admins = await User.find({
    $or: [{ role: "admin" }, { role: "manager", managedArea: areaId || null }],
  }).select("_id");
  if (!admins.length) return;
  const title = "Báo hỏng CSVC mới";
  const msg = `${reporter?.fullName || "Sinh viên"} vừa báo hỏng "${device}" tại phòng ${roomDoc?.roomNumber || ""}.`;
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message: msg,
      type: "general",
      link: "/admin/facilities",
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message: msg, link: "/admin/facilities" });
  }
}

exports.create = async (req, res) => {
  try {
    const { room, device, description, images } = req.body;
    const roomDoc = await Room.findById(room).populate("roomLeader").populate("area", "name");
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const roomLeaderId =
      roomDoc.roomLeader?._id?.toString() ||
      roomDoc.roomLeader?.toString?.() ||
      roomDoc.roomLeader;
    if (roomLeaderId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Chỉ trưởng phòng mới được khai báo hư hỏng" });
    }
    const hasContract = await Contract.findOne({
      user: req.user._id,
      room,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!hasContract) return res.status(403).json({ message: "Bạn không phải thành viên phòng này" });
    const existsDevice = await FacilityLocation.findOne({
      room,
    }).populate("facility", "name");
    if (!existsDevice) {
      return res.status(400).json({ message: "Phòng này chưa có thiết bị để khai báo" });
    }
    const devices = await FacilityLocation.find({ room }).populate("facility", "name");
    const deviceNames = new Set(
      devices
        .map((d) => String(d.facility?.name || "").trim())
        .filter(Boolean)
    );
    if (!deviceNames.has(String(device || "").trim())) {
      return res.status(400).json({ message: "Thiết bị không thuộc phòng này" });
    }
    const report = await DamageReport.create({
      user: req.user._id,
      room,
      device: device || "Khác",
      description: description || "",
      images: Array.isArray(images) ? images : [],
    });
    await notifyAdminsDamageReport({ reporter: req.user, roomDoc, device: device || "Khác" });
    res.status(201).json(await report.populate("room"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoomDevices = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const roomDoc = await Room.findById(roomId).populate("roomLeader");
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const roomLeaderId = roomDoc.roomLeader?._id?.toString() || roomDoc.roomLeader?.toString?.() || roomDoc.roomLeader;
    if (String(roomLeaderId || "") !== String(req.user._id)) {
      return res.status(403).json({ message: "Chỉ trưởng phòng mới được xem thiết bị để khai báo" });
    }
    const hasContract = await Contract.findOne({
      user: req.user._id,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!hasContract) return res.status(403).json({ message: "Bạn không phải thành viên phòng này" });

    const locations = await FacilityLocation.find({ room: roomId }).populate("facility", "name status");
    const devices = Array.from(
      new Set(
        locations
          .map((x) => String(x.facility?.name || "").trim())
          .filter(Boolean)
      )
    );
    res.json({ roomId, devices });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMy = async (req, res) => {
  try {
    const reports = await DamageReport.find({ user: req.user._id })
      .populate("room")
      .populate("room.area", "name")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
