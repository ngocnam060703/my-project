const Room = require("../models/Room");
const Area = require("../models/Area");

exports.getAll = async (req, res) => {
  try {
    const { area, status, available, minPrice, maxPrice, minCapacity, capacity, roomNumber, sortBy = "roomNumber", sortOrder = "asc", page = 1, limit = 100 } = req.query;
    const filter = {};
    if (area) filter.area = area;
    if (roomNumber && String(roomNumber).trim()) filter.roomNumber = new RegExp(String(roomNumber).trim(), "i");
    if (status) filter.status = status;
    if (available === "true") filter.$expr = { $lt: ["$currentOccupancy", "$capacity"] };
    if (minPrice || maxPrice) {
      filter.price = filter.price || {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (minCapacity || capacity) {
      filter.capacity = filter.capacity || {};
      if (minCapacity) filter.capacity.$gte = Number(minCapacity);
      if (capacity) filter.capacity.$lte = Number(capacity);
    }
    const sortField = { price: "price", capacity: "capacity", roomNumber: "roomNumber", area: "area.name" }[sortBy] || "roomNumber";
    const sort = { [sortField]: sortOrder === "desc" ? -1 : 1 };
    const rooms = await Room.find(filter)
      .populate("area", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort(sort);
    const total = await Room.countDocuments(filter);
    const [availableCount, fullCount, maintenanceCount] = await Promise.all([
      Room.countDocuments({ ...filter, status: "available" }),
      Room.countDocuments({ ...filter, status: "full" }),
      Room.countDocuments({ ...filter, status: "maintenance" }),
    ]);
    res.json({ rooms, total, stats: { available: availableCount, full: fullCount, maintenance: maintenanceCount } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate("area", "name");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      roomNumber,
      area,
      capacity,
      price,
      floor,
      amenities,
      description,
      status,
      currentOccupancy,
    } = req.body;
    const existing = await Room.findOne({ area, roomNumber });
    if (existing) return res.status(400).json({ message: "Phòng đã tồn tại trong khu này" });
    const room = await Room.create({
      roomNumber,
      area,
      capacity,
      price,
      floor,
      amenities,
      description,
      status,
      currentOccupancy,
    });
    res.status(201).json(await room.populate("area", "name"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate("area", "name");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (room.currentOccupancy > 0) return res.status(400).json({ message: "Không thể xóa phòng đang có người ở" });
    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
