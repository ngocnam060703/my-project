const Area = require("../models/Area");
const Room = require("../models/Room");

exports.getAll = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search && String(search).trim()) filter.name = new RegExp(String(search).trim(), "i");
    const areas = await Area.find(filter).populate("manager", "fullName email").sort({ name: 1 });
    const withManager = await Area.countDocuments({ ...filter, manager: { $exists: true, $ne: null } });
    res.json({ areas, total: areas.length, stats: { total: areas.length, withManager, withoutManager: areas.length - withManager } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id).populate("manager", "fullName email");
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });
    res.json(area);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, manager } = req.body;
    const existing = await Area.findOne({ name });
    if (existing) return res.status(400).json({ message: "Tên khu đã tồn tại" });
    const area = await Area.create({ name, description, manager });
    res.status(201).json(area);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const area = await Area.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });
    res.json(area);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const rooms = await Room.countDocuments({ area: req.params.id });
    if (rooms > 0) return res.status(400).json({ message: "Không thể xóa khu đã có phòng" });
    const area = await Area.findByIdAndDelete(req.params.id);
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });
    res.json({ message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
