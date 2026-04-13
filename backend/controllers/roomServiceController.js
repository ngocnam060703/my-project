const mongoose = require("mongoose");
const RoomService = require("../models/RoomService");
const Room = require("../models/Room");
const Service = require("../models/Service");

exports.list = async (req, res) => {
  try {
    const { room, service, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (room && mongoose.isValidObjectId(String(room))) filter.room = room;
    if (service && mongoose.isValidObjectId(String(service))) filter.service = service;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const p = Math.max(1, parseInt(page, 10));
    const rows = await RoomService.find(filter)
      .populate("room", "roomNumber area")
      .populate("service", "name price measureUnit tariffType type unit isActive")
      .sort({ createdAt: -1 })
      .skip((p - 1) * lim)
      .limit(lim)
      .lean();
    const total = await RoomService.countDocuments(filter);
    res.json({ items: rows, total, page: p, limit: lim });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { room, service, note, isActive } = req.body;
    if (!mongoose.isValidObjectId(String(room)) || !mongoose.isValidObjectId(String(service))) {
      return res.status(400).json({ message: "room và service phải là ObjectId hợp lệ" });
    }
    const [r, s] = await Promise.all([Room.findById(room), Service.findById(service)]);
    if (!r) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (!s) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    const doc = await RoomService.create({
      room,
      service,
      note: note != null ? String(note) : "",
      isActive: isActive !== false,
    });
    const out = await RoomService.findById(doc._id).populate("room", "roomNumber").populate("service", "name price measureUnit tariffType");
    res.status(201).json(out);
  } catch (e) {
    if (e?.code === 11000) return res.status(400).json({ message: "Phòng đã được gán dịch vụ này" });
    res.status(500).json({ message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "ID không hợp lệ" });
    const doc = await RoomService.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });
    res.json({ message: "Đã gỡ gán" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
