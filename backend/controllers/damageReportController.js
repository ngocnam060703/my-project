const DamageReport = require("../models/DamageReport");
const Room = require("../models/Room");
const Contract = require("../models/Contract");

exports.create = async (req, res) => {
  try {
    const { room, device, description, images } = req.body;
    const roomDoc = await Room.findById(room).populate("roomLeader");
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const roomLeaderId = roomDoc.roomLeader?.toString?.() || roomDoc.roomLeader;
    if (roomLeaderId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Chỉ trưởng phòng mới được khai báo hư hỏng" });
    }
    const hasContract = await Contract.findOne({ user: req.user._id, room, status: "active" });
    if (!hasContract) return res.status(403).json({ message: "Bạn không phải thành viên phòng này" });
    const report = await DamageReport.create({
      user: req.user._id,
      room,
      device: device || "Khác",
      description: description || "",
      images: Array.isArray(images) ? images : [],
    });
    res.status(201).json(await report.populate("room"));
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
