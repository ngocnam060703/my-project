const Contract = require("../models/Contract");
const Bill = require("../models/Bill");
const Room = require("../models/Room");

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    const contracts = await Contract.find(filter)
      .populate("user", "fullName email phone studentId")
      .populate("room")
      .populate("room.area", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    const total = await Contract.countDocuments(filter);
    res.json({ contracts, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyContracts = async (req, res) => {
  try {
    const contracts = await Contract.find({ user: req.user._id })
      .populate("room")
      .populate("room.area", "name")
      .sort({ createdAt: -1 });
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate("user", "fullName email phone studentId")
      .populate("room")
      .populate("room.area", "name");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (req.user.role === "user" && contract.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền xem" });
    }
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.extend = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const { endDate } = req.body;
    contract.endDate = new Date(endDate);
    await contract.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.terminate = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).populate("room");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    contract.status = "terminated";
    await contract.save();
    const room = await Room.findById(contract.room._id);
    room.currentOccupancy = Math.max(0, room.currentOccupancy - 1);
    room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
    await room.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
