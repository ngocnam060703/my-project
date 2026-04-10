const Room = require("../models/Room");
const Area = require("../models/Area");
const Contract = require("../models/Contract");

function sanitizeAmenities(input) {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => !/^wi-?fi$/i.test(x));
}

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

exports.getResidents = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("area", "name")
      .populate("roomLeader", "fullName studentId email phone");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const contracts = await Contract.find({
      room: room._id,
      status: { $in: ["active", "pending_payment"] },
    })
      .populate("user", "fullName studentId email phone gender")
      .sort({ createdAt: 1 });
    const residents = contracts
      .filter((c) => c.user)
      .map((c) => ({
        contractId: c._id,
        status: c.status,
        contractNumber: c.contractNumber,
        startDate: c.startDate,
        endDate: c.endDate,
        user: c.user,
        isRoomLeader: String(room.roomLeader?._id || "") === String(c.user?._id || ""),
      }));
    res.json({
      room: {
        _id: room._id,
        roomNumber: room.roomNumber,
        area: room.area,
        capacity: room.capacity,
        currentOccupancy: room.currentOccupancy,
      },
      residents,
      totalResidents: residents.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.setRoomLeader = async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Thiếu userId" });
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const activeContract = await Contract.findOne({
      room: room._id,
      user: userId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!activeContract) {
      return res.status(400).json({ message: "Sinh viên này không thuộc phòng hiện tại" });
    }
    room.roomLeader = userId;
    await room.save();
    const updatedRoom = await Room.findById(room._id).populate("roomLeader", "fullName studentId email phone");
    res.json({
      message: "Đã cập nhật trưởng phòng",
      room: {
        _id: updatedRoom._id,
        roomNumber: updatedRoom.roomNumber,
        roomLeader: updatedRoom.roomLeader,
      },
    });
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
    const areaDoc = await Area.findOne({ _id: area, isDeleted: { $ne: true } });
    if (!areaDoc) return res.status(400).json({ message: "Khu không tồn tại hoặc đã ngừng sử dụng" });
    let ams = sanitizeAmenities(amenities);
    if (!ams.length) {
      ams = ["Giường", "Tủ", "Quạt"];
    }
    const room = await Room.create({
      roomNumber,
      area,
      capacity,
      price,
      floor,
      amenities: ams,
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
    const updateData = { ...req.body };
    if (updateData.amenities !== undefined) {
      updateData.amenities = sanitizeAmenities(updateData.amenities);
    }
    const room = await Room.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate("area", "name");
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
