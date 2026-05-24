const mongoose = require("mongoose");
const Room = require("../models/Room");
const Area = require("../models/Area");
const Contract = require("../models/Contract");
const Bed = require("../models/Bed");
const BedHistory = require("../models/BedHistory");
const Bill = require("../models/Bill");
const { syncExpiredActiveContracts, countTakenSlots } = require("../services/bedOccupancy");

function deriveResidencyOperationalStatus(bed) {
  if (!bed || String(bed.status) !== "occupied") return "no_bed_assigned";
  if (!bed.checkInAt && bed.assignedAt) return "assigned_pending_checkin";
  if (bed.checkInAt) return "checked_in_staying";
  return "assigned_pending_checkin";
}

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
    await syncExpiredActiveContracts();
    const room = await Room.findById(req.params.id)
      .populate("area", "name genderPolicy")
      .populate("roomLeader", "fullName studentId email phone");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const contracts = await Contract.find({
      room: room._id,
      status: { $in: ["active", "pending_payment"] },
    })
      .populate("user", "fullName studentId email phone gender")
      .populate({ path: "bed", select: "code status assignedAt checkInAt equipmentStatus" })
      .sort({ createdAt: 1 });

    const userIds = contracts.filter((c) => c.user).map((c) => c.user._id);
    let debtMap = {};
    if (userIds.length) {
      const debtAgg = await Bill.aggregate([
        { $match: { user: { $in: userIds }, status: { $in: ["pending", "unpaid", "overdue"] } } },
        { $group: { _id: "$user", debtTotal: { $sum: "$total" } } },
      ]);
      debtMap = Object.fromEntries(debtAgg.map((d) => [String(d._id), Number(d.debtTotal || 0)]));
    }

    const taken = await countTakenSlots(room._id);
    const occupiedOnly = await Bed.countDocuments({ room: room._id, status: "occupied" });
    const reservedOnly = await Bed.countDocuments({ room: room._id, status: "reserved" });
    const cap = Math.max(1, Number(room.capacity || 1));

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
        bed: c.bed || null,
        bedCode: c.bed?.code || "",
        assignedAt: c.bed?.assignedAt || null,
        checkInAt: c.bed?.checkInAt || null,
        debtTotal: debtMap[String(c.user._id)] || 0,
        residencyOperationalStatus: deriveResidencyOperationalStatus(c.bed),
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
      slotStats: {
        totalSlots: cap,
        occupiedSlots: occupiedOnly,
        reservedSlots: reservedOnly,
        emptySlots: Math.max(0, cap - taken),
        fillRatePercent: cap ? Math.round((taken / cap) * 1000) / 10 : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRoomResidencyHistory = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
    const roomId = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });

    const room = await Room.findById(roomId).populate("area", "name").lean();
    const areaName =
      room && room.area && typeof room.area === "object" ? String(room.area.name || "").trim() : "";
    const roomNumber = room ? String(room.roomNumber || "").trim() : "";

    const rows = await BedHistory.find({ room: roomId })
      .populate("user", "fullName studentId")
      .populate({ path: "bed", select: "code" })
      .populate({ path: "contract", select: "contractNumber status" })
      .sort({ createdAt: 1 })
      .lean();

    const open = new Map();
    const periods = [];

    const cidOf = (h) => {
      const c = h.contract;
      return c ? String(c._id || c) : "";
    };

    const contractNumberOf = (h) => {
      const c = h.contract;
      if (c && typeof c === "object") return String(c.contractNumber || "").trim();
      return "";
    };

    const locPayload = () => ({ areaName, roomNumber });

    for (const h of rows) {
      const cid = cidOf(h);
      const bedCode = h.toBedCode || h.fromBedCode || (h.bed && h.bed.code) || "";
      if (["assigned", "transferred_in"].includes(h.action)) {
        if (cid) {
          open.set(cid, {
            contractId: cid,
            contractNumber: contractNumberOf(h),
            user: h.user,
            bedCode,
            moveInAt: h.createdAt,
            reasonIn: h.note || "",
            ...locPayload(),
          });
        }
      }
      if (["checked_out", "transferred_out"].includes(h.action)) {
        const seg = cid ? open.get(cid) : null;
        if (seg) {
          periods.push({
            ...seg,
            moveOutAt: h.createdAt,
            reasonOut: h.note || "",
            areaName: seg.areaName || areaName,
            roomNumber: seg.roomNumber || roomNumber,
          });
          open.delete(cid);
        }
      }
    }

    for (const seg of open.values()) {
      periods.push({
        ...seg,
        moveOutAt: null,
        reasonOut: "",
        ongoing: true,
        areaName: seg.areaName || areaName,
        roomNumber: seg.roomNumber || roomNumber,
      });
    }

    periods.sort((a, b) => new Date(b.moveInAt).getTime() - new Date(a.moveInAt).getTime());
    res.json({ periods });
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
    const priceNum = Math.max(0, Math.round(Number(price) || 0));
    const capNum = Math.max(1, Math.round(Number(capacity) || 1));
    const room = await Room.create({
      roomNumber,
      area,
      capacity: capNum,
      maxCapacity: capNum,
      price: priceNum,
      currentPrice: priceNum,
      floor,
      amenities: ams,
      description,
      status,
      currentOccupancy: Math.max(0, Math.round(Number(currentOccupancy) || 0)),
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
