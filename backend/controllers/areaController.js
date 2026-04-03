const Area = require("../models/Area");
const Room = require("../models/Room");

exports.getAll = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search && String(search).trim()) filter.name = new RegExp(String(search).trim(), "i");
    const areas = await Area.find(filter).populate("manager", "fullName email").sort({ name: 1 });
    const withManager = await Area.countDocuments({ ...filter, manager: { $exists: true, $ne: null } });
    const areaIds = areas.map((a) => a._id);
    const rooms = await Room.find({ area: { $in: areaIds } }).select("area currentOccupancy capacity status");
    const byArea = new Map();
    for (const r of rooms) {
      const key = String(r.area);
      if (!byArea.has(key)) {
        byArea.set(key, { totalRooms: 0, totalStudents: 0, hasVacancy: false });
      }
      const agg = byArea.get(key);
      agg.totalRooms += 1;
      agg.totalStudents += r.currentOccupancy || 0;
      const cap = r.capacity || 0;
      const occ = r.currentOccupancy || 0;
      if (r.status !== "maintenance" && occ < cap) agg.hasVacancy = true;
    }
    const enriched = areas.map((a) => {
      const agg = byArea.get(String(a._id)) || { totalRooms: 0, totalStudents: 0, hasVacancy: false };
      const occupancyStatus = agg.totalRooms === 0 ? "empty" : agg.hasVacancy ? "available" : "full";
      return {
        ...a.toObject(),
        totalRooms: agg.totalRooms,
        totalStudents: agg.totalStudents,
        occupancyStatus,
      };
    });
    res.json({
      areas: enriched,
      total: enriched.length,
      stats: { total: enriched.length, withManager, withoutManager: enriched.length - withManager },
    });
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
    const { name, description, manager, genderPolicy } = req.body;
    const existing = await Area.findOne({ name });
    if (existing) return res.status(400).json({ message: "Tên khu đã tồn tại" });
    const area = await Area.create({ name, description, manager, genderPolicy });
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
    const rooms = await Room.find({ area: req.params.id }).select("currentOccupancy");
    if (rooms.some((r) => (r.currentOccupancy || 0) > 0)) {
      return res.status(400).json({ message: "Không thể xóa khu đang có sinh viên ở" });
    }
    if (rooms.length > 0) return res.status(400).json({ message: "Không thể xóa khu đã có phòng" });
    const area = await Area.findByIdAndDelete(req.params.id);
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });
    res.json({ message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
