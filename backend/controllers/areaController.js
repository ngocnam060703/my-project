const Area = require("../models/Area");
const Room = require("../models/Room");

const notDeleted = { isDeleted: { $ne: true } };

exports.getAll = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { ...notDeleted };
    if (search && String(search).trim()) filter.name = new RegExp(String(search).trim(), "i");
    const areas = await Area.find(filter).populate("manager", "fullName email").sort({ name: 1 });
    const withManager = await Area.countDocuments({ ...filter, manager: { $exists: true, $ne: null } });
    const areaIds = areas.map((a) => a._id);
    const rooms = await Room.find({ area: { $in: areaIds } }).select("area currentOccupancy capacity status");
    const byArea = new Map();
    for (const r of rooms) {
      const key = String(r.area);
      if (!byArea.has(key)) {
        byArea.set(key, { totalRooms: 0, totalStudents: 0, sumRoomCapacity: 0, hasVacancy: false });
      }
      const agg = byArea.get(key);
      agg.totalRooms += 1;
      agg.totalStudents += r.currentOccupancy || 0;
      agg.sumRoomCapacity += Number(r.capacity) || 0;
      const cap = r.capacity || 0;
      const occ = r.currentOccupancy || 0;
      if (r.status !== "maintenance" && occ < cap) agg.hasVacancy = true;
    }
    const enriched = areas.map((a) => {
      const raw = a.toObject();
      const agg = byArea.get(String(a._id)) || { totalRooms: 0, totalStudents: 0, sumRoomCapacity: 0, hasVacancy: false };
      const plannedCap = agg.totalRooms > 0 ? agg.sumRoomCapacity : 0;
      const occupancyStatus =
        plannedCap > 0 && agg.totalStudents >= plannedCap ? "full" : agg.totalRooms === 0 ? "empty" : agg.hasVacancy ? "available" : "full";
      return {
        ...raw,
        totalRooms: agg.totalRooms,
        totalStudents: agg.totalStudents,
        occupancyStatus,
        effectiveCapacity: plannedCap,
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
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted }).populate("manager", "fullName email");
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });
    res.json(area);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, manager, genderPolicy, plannedTotalRooms, plannedCapacity } = req.body;
    const trimmedName = String(name || "").trim();
    const existing = await Area.findOne({ name: trimmedName, ...notDeleted });
    if (existing) return res.status(400).json({ message: "Tên khu đã tồn tại" });
    const area = await Area.create({
      name: trimmedName,
      description,
      manager,
      genderPolicy,
      plannedTotalRooms: plannedTotalRooms != null ? Number(plannedTotalRooms) : null,
      plannedCapacity: plannedCapacity != null ? Number(plannedCapacity) : null,
    });
    res.status(201).json(area);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await Area.findOne({ _id: req.params.id, ...notDeleted });
    if (!existing) return res.status(404).json({ message: "Không tìm thấy khu" });

    if (req.body.name !== undefined) {
      const trimmed = String(req.body.name || "").trim();
      const dup = await Area.findOne({ name: trimmed, _id: { $ne: existing._id }, ...notDeleted });
      if (dup) return res.status(400).json({ message: "Tên khu đã tồn tại" });
      existing.name = trimmed;
    }
    const assign = (k) => {
      if (req.body[k] !== undefined) existing[k] = req.body[k];
    };
    assign("description");
    assign("manager");
    assign("genderPolicy");
    assign("isActive");
    if (req.body.plannedTotalRooms !== undefined) existing.plannedTotalRooms = req.body.plannedTotalRooms == null ? null : Number(req.body.plannedTotalRooms);
    if (req.body.plannedCapacity !== undefined) existing.plannedCapacity = req.body.plannedCapacity == null ? null : Number(req.body.plannedCapacity);

    await existing.save();
    res.json(existing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted });
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });

    const rooms = await Room.find({ area: area._id }).select("currentOccupancy");
    const totalStudents = rooms.reduce((s, r) => s + (Number(r.currentOccupancy) || 0), 0);
    if (totalStudents > 0) {
      return res.status(400).json({ message: "Không thể xóa khu đang có sinh viên ở" });
    }

    await Area.findByIdAndUpdate(area._id, { isDeleted: true, isActive: false });
    res.json({ message: "Đã xóa khu (xóa mềm)" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
