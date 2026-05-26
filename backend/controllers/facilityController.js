const mongoose = require("mongoose");
const Facility = require("../models/Facility");
const FacilityLocation = require("../models/FacilityLocation");
const FacilityReport = require("../models/FacilityReport");
const Room = require("../models/Room");
const Contract = require("../models/Contract");

function isAdminOrManager(user) {
  return user?.role === "admin" || user?.role === "manager";
}

async function getMemberRoom(userId) {
  const contract = await Contract.findOne({
    user: userId,
    status: { $in: ["active", "pending_payment"] },
  })
    .sort({ createdAt: -1 })
    .select("room status");
  return contract || null;
}

exports.getMyRoomFacilities = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({ message: "Chỉ sinh viên mới dùng API này" });
    }
    const memberContract = await getMemberRoom(req.user._id);
    if (!memberContract?.room) {
      return res.status(403).json({ message: "Bạn chưa có phòng hợp lệ để xem CSVC" });
    }

    const locations = await FacilityLocation.find({ room: memberContract.room })
      .populate("facility", "name code category status quantityTotal")
      .populate("room", "roomNumber floor")
      .populate("area", "name")
      .sort({ createdAt: -1 });

    res.json({
      roomId: memberContract.room,
      items: locations,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllFacilities = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { q, category, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category) filter.category = String(category);
    if (status) filter.status = String(status);
    if (q && String(q).trim()) {
      const k = String(q).trim();
      filter.$or = [{ name: new RegExp(k, "i") }, { code: new RegExp(k, "i") }];
    }
    const facilities = await Facility.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await Facility.countDocuments(filter);
    res.json({ facilities, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createFacility = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { name, code, category, status, quantityTotal } = req.body;
    if (!name || !code) return res.status(400).json({ message: "Thiếu tên hoặc mã CSVC" });
    const facility = await Facility.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      category: category ? String(category).trim() : "",
      status: status || "active",
      quantityTotal: Number(quantityTotal || 0),
    });
    res.status(201).json(facility);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Mã CSVC đã tồn tại" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.updateFacility = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "ID không hợp lệ" });
    const data = {};
    ["name", "category", "status"].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    if (req.body.code !== undefined) data.code = String(req.body.code).trim().toUpperCase();
    if (req.body.quantityTotal !== undefined) data.quantityTotal = Number(req.body.quantityTotal);
    const facility = await Facility.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!facility) return res.status(404).json({ message: "Không tìm thấy CSVC" });
    res.json(facility);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Mã CSVC đã tồn tại" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.deleteFacility = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "ID không hợp lệ" });
    const facility = await Facility.findById(id);
    if (!facility) return res.status(404).json({ message: "Không tìm thấy CSVC" });
    await FacilityLocation.deleteMany({ facility: id });
    await FacilityReport.deleteMany({ facility: id });
    await Facility.deleteOne({ _id: id });
    res.json({ message: "Đã xóa CSVC" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.assignFacilityLocation = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { facilityId, areaId, floor, roomId, quantity } = req.body;
    if (!facilityId || !roomId || !quantity) {
      return res.status(400).json({ message: "Thiếu facilityId, roomId hoặc quantity" });
    }
    if (!mongoose.isValidObjectId(facilityId) || !mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({ message: "facilityId hoặc roomId không hợp lệ" });
    }
    const facility = await Facility.findById(facilityId);
    if (!facility) return res.status(404).json({ message: "Không tìm thấy CSVC" });
    const room = await Room.findById(roomId).populate("area");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const area = areaId || room.area?._id || room.area;
    const doc = await FacilityLocation.findOneAndUpdate(
      { facility: facilityId, room: roomId },
      { facility: facilityId, room: roomId, area, floor: Number(floor || room.floor || 1), quantity: Number(quantity) },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true }
    )
      .populate("facility", "name code category status")
      .populate("room", "roomNumber floor")
      .populate("area", "name");
    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getFacilityLocations = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { roomId, areaId, facilityId, page = 1, limit = 200 } = req.query;
    const filter = {};
    if (roomId && mongoose.isValidObjectId(String(roomId))) filter.room = roomId;
    if (areaId && mongoose.isValidObjectId(String(areaId))) filter.area = areaId;
    if (facilityId && mongoose.isValidObjectId(String(facilityId))) filter.facility = facilityId;

    const items = await FacilityLocation.find(filter)
      .populate("facility", "name code category status")
      .populate({ path: "room", select: "roomNumber floor area", populate: { path: "area", select: "name" } })
      .populate("area", "name")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await FacilityLocation.countDocuments(filter);
    res.json({ items, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateFacilityLocation = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) {
      return res.status(400).json({ message: "ID phân bổ không hợp lệ" });
    }
    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Số lượng phải >= 1" });
    }
    const doc = await FacilityLocation.findByIdAndUpdate(
      id,
      { quantity },
      { returnDocument: 'after', runValidators: true }
    )
      .populate("facility", "name code category status")
      .populate({ path: "room", select: "roomNumber floor area", populate: { path: "area", select: "name" } })
      .populate("area", "name");
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phân bổ CSVC" });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteFacilityLocation = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) {
      return res.status(400).json({ message: "ID phân bổ không hợp lệ" });
    }
    const doc = await FacilityLocation.findById(id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phân bổ CSVC" });
    await FacilityLocation.deleteOne({ _id: id });
    res.json({ message: "Đã xóa phân bổ CSVC" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getFacilityReportsMy = async (req, res) => {
  try {
    const reports = await FacilityReport.find({ reportedBy: req.user._id })
      .populate("facility", "name code status category")
      .populate("room", "roomNumber")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReportableFacilitiesByRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId || !mongoose.isValidObjectId(String(roomId))) {
      return res.status(400).json({ message: "roomId không hợp lệ" });
    }
    const room = await Room.findById(roomId).populate("roomLeader");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const roomLeaderId = room.roomLeader?._id?.toString() || room.roomLeader?.toString?.() || room.roomLeader;
    if (String(roomLeaderId || "") !== String(req.user._id)) {
      return res.status(403).json({ message: "Chỉ trưởng phòng mới được khai báo hỏng CSVC" });
    }

    const memberContract = await Contract.findOne({
      user: req.user._id,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!memberContract) {
      return res.status(403).json({ message: "Bạn không phải thành viên phòng này" });
    }

    const locations = await FacilityLocation.find({ room: roomId })
      .populate("facility", "name code status")
      .sort({ createdAt: -1 });
    const facilities = Array.from(
      new Map(
        locations
          .map((loc) => {
            const f = loc.facility;
            const id = String(f?._id || "");
            const name = String(f?.name || "").trim();
            if (!id || !name) return null;
            return [id, { _id: id, name, code: String(f?.code || "").trim() }];
          })
          .filter(Boolean)
      ).values()
    );
    res.json({ roomId, facilities });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createFacilityReport = async (req, res) => {
  try {
    const { facilityId, roomId, description } = req.body;
    if (!facilityId || !roomId || !description) {
      return res.status(400).json({ message: "Thiếu facilityId, roomId hoặc description" });
    }
    if (!mongoose.isValidObjectId(facilityId) || !mongoose.isValidObjectId(roomId)) {
      return res.status(400).json({ message: "facilityId hoặc roomId không hợp lệ" });
    }

    const room = await Room.findById(roomId).populate("roomLeader");
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const roomLeaderId = room.roomLeader?._id?.toString() || room.roomLeader?.toString?.() || room.roomLeader;
    if (String(roomLeaderId || "") !== String(req.user._id)) {
      return res.status(403).json({ message: "Chỉ trưởng phòng mới được báo hỏng CSVC" });
    }

    const memberContract = await Contract.findOne({
      user: req.user._id,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!memberContract) {
      return res.status(403).json({ message: "Bạn không phải thành viên phòng này" });
    }

    const location = await FacilityLocation.findOne({ facility: facilityId, room: roomId });
    if (!location) {
      return res.status(400).json({ message: "CSVC không thuộc phòng này, không thể báo hỏng" });
    }

    const report = await FacilityReport.create({
      facility: facilityId,
      room: roomId,
      reportedBy: req.user._id,
      description: String(description).trim(),
      status: "pending",
    });
    res.status(201).json(
      await report.populate([
        { path: "facility", select: "name code category status" },
        { path: "room", select: "roomNumber" },
        { path: "reportedBy", select: "fullName studentId" },
      ])
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getFacilityReports = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { status, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = String(status);
    if (room && mongoose.isValidObjectId(String(room))) filter.room = room;

    const reports = await FacilityReport.find(filter)
      .populate("facility", "name code category status")
      .populate({ path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } })
      .populate("reportedBy", "fullName studentId")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await FacilityReport.countDocuments(filter);
    res.json({ reports, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approveFacilityReport = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    const report = await FacilityReport.findById(id);
    if (!report) return res.status(404).json({ message: "Không tìm thấy báo hỏng" });
    if (report.status !== "pending") {
      return res.status(400).json({ message: "Chỉ báo hỏng trạng thái chờ duyệt mới được duyệt" });
    }
    report.status = "fixing";
    report.adminNote = req.body?.adminNote ? String(req.body.adminNote) : report.adminNote;
    await report.save();

    await Facility.findByIdAndUpdate(report.facility, { status: "repairing" });

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.rejectFacilityReport = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    const reason = String(req.body?.adminNote || "").trim();
    if (!reason) {
      return res.status(400).json({ message: "Bắt buộc nhập lý do khi từ chối" });
    }
    const report = await FacilityReport.findById(id);
    if (!report) return res.status(404).json({ message: "Không tìm thấy báo hỏng" });
    report.status = "rejected";
    report.adminNote = reason;
    await report.save();
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.doneFacilityReport = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const { id } = req.params;
    const report = await FacilityReport.findById(id);
    if (!report) return res.status(404).json({ message: "Không tìm thấy báo hỏng" });
    if (!["fixing", "approved"].includes(report.status)) {
      return res.status(400).json({ message: "Chỉ báo hỏng đang sửa mới được đánh dấu hoàn thành" });
    }
    report.status = "done";
    report.adminNote = req.body?.adminNote ? String(req.body.adminNote) : report.adminNote;
    await report.save();

    await Facility.findByIdAndUpdate(report.facility, { status: "active" });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getFacilityStats = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    const [total, active, broken, repairing] = await Promise.all([
      Facility.countDocuments(),
      Facility.countDocuments({ status: "active" }),
      Facility.countDocuments({ status: "broken" }),
      Facility.countDocuments({ status: "repairing" }),
    ]);
    const byArea = await FacilityLocation.aggregate([
      { $group: { _id: "$area", totalQuantity: { $sum: "$quantity" } } },
      {
        $lookup: {
          from: "areas",
          localField: "_id",
          foreignField: "_id",
          as: "area",
        },
      },
      { $unwind: { path: "$area", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, areaName: "$area.name", totalQuantity: 1 } },
      { $sort: { areaName: 1 } },
    ]);
    const byRoom = await FacilityLocation.aggregate([
      { $group: { _id: "$room", totalQuantity: { $sum: "$quantity" } } },
      {
        $lookup: {
          from: "rooms",
          localField: "_id",
          foreignField: "_id",
          as: "room",
        },
      },
      { $unwind: { path: "$room", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, roomNumber: "$room.roomNumber", totalQuantity: 1 } },
      { $sort: { roomNumber: 1 } },
    ]);
    res.json({ total, active, broken, repairing, byArea, byRoom });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
