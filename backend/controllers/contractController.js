const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const ContractExtensionSetting = require("../models/ContractExtensionSetting");
const Bill = require("../models/Bill");
const Violation = require("../models/Violation");
const MaintenanceReport = require("../models/MaintenanceReport");
const { getIO } = require("../socket");
const { tryAutoAssignBed } = require("../services/bedAllocation");
const { releaseBedForContractId } = require("../services/bedOccupancy");

const CONTRACT_EXT_SETTING_KEY = "contract_extension";

async function isContractExtensionGloballyEnabled() {
  const doc = await ContractExtensionSetting.findOne({ key: CONTRACT_EXT_SETTING_KEY });
  return doc?.enable_contract_extension !== false;
}

function addCalendarMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

async function notifyAdminsNewExtendRequest({ studentName, contractNumber, months }) {
  const io = getIO();
  const admins = await User.find({ $or: [{ role: "admin" }, { role: "manager" }] }).select("_id");
  if (!admins.length) return;
  const title = "Yêu cầu gia hạn hợp đồng";
  const message = `${studentName || "Sinh viên"} xin gia hạn HĐ ${contractNumber || ""} thêm ${months} tháng.`;
  const link = "/admin/contracts";
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: "contract_renewal",
      link,
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message, link });
  }
}

async function decrementRoomOccupancy(roomId) {
  if (!roomId) return;
  const room = await Room.findById(roomId);
  if (!room) return;
  room.currentOccupancy = Math.max(0, room.currentOccupancy - 1);
  room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
  await room.save();
}

function statusHoldsSlot(status) {
  return status === "active" || status === "pending_payment";
}

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, area, search, faculty, major, hasDebt, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const baseMatch = {};
    if (status) baseMatch.status = status;
    if (user) baseMatch.user = user;
    if (room) baseMatch.room = room;

    // Quick filter: only students who still owe bills (pending/unpaid/overdue)
    if (String(hasDebt || "") === "1" || String(hasDebt || "") === "true") {
      const debtUserIds = await Bill.distinct("user", { status: { $in: ["pending", "unpaid", "overdue"] } });
      if (!debtUserIds || debtUserIds.length === 0) {
        return res.json({ contracts: [], total: 0 });
      }
      baseMatch.user = { $in: debtUserIds };
    }

    // Filter by area (khu) for contracts: room.area = area
    if (area && String(area).trim() && !room) {
      const roomsInArea = await Room.find({ area: String(area).trim() }).select("_id").lean();
      baseMatch.room = { $in: roomsInArea.map((r) => r._id) };
    }

    const needsUserFilter = !!(search && String(search).trim()) || !!(faculty && String(faculty).trim()) || !!(major && String(major).trim());
    if (needsUserFilter) {
      const rx = search && String(search).trim()
        ? new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : null;

      // IMPORTANT: after $lookup + $unwind, user fields live under `user.*`
      const userAnd = [{ "user.isDeleted": { $ne: true } }];
      if (rx) userAnd.push({ $or: [{ "user.fullName": rx }, { "user.studentId": rx }, { "user.email": rx }, { "user.phone": rx }] });
      if (faculty && String(faculty).trim()) userAnd.push({ "user.faculty": String(faculty).trim() });
      if (major && String(major).trim()) userAnd.push({ "user.major": String(major).trim() });
      const userMatch = userAnd.length > 1 ? { $and: userAnd } : userAnd[0];

      const pipeline = [
        { $match: baseMatch },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $match: userMatch },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            items: [
              { $skip: (pageNum - 1) * lim },
              { $limit: lim },
              { $lookup: { from: "rooms", localField: "room", foreignField: "_id", as: "room" } },
              { $unwind: { path: "$room", preserveNullAndEmptyArrays: true } },
              { $lookup: { from: "areas", localField: "room.area", foreignField: "_id", as: "roomArea" } },
              { $unwind: { path: "$roomArea", preserveNullAndEmptyArrays: true } },
              {
                $addFields: {
                  room: {
                    _id: "$room._id",
                    roomNumber: "$room.roomNumber",
                    area: { _id: "$roomArea._id", name: "$roomArea.name" },
                  },
                },
              },
              {
                $project: {
                  registration: 1,
                  application: 1,
                  user: {
                    _id: "$user._id",
                    fullName: "$user.fullName",
                    email: "$user.email",
                    phone: "$user.phone",
                    studentId: "$user.studentId",
                    gender: "$user.gender",
                    citizenId: "$user.citizenId",
                    dateOfBirth: "$user.dateOfBirth",
                    faculty: "$user.faculty",
                    major: "$user.major",
                  },
                  room: 1,
                  startDate: 1,
                  endDate: 1,
                  status: 1,
                  contractNumber: 1,
                  terms: 1,
                  signedAt: 1,
                  createdBy: 1,
                  paymentConfirmedAt: 1,
                  paymentConfirmedBy: 1,
                  monthlyRent: 1,
                  depositAmount: 1,
                  createdAt: 1,
                  updatedAt: 1,
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
      ];

      const agg = await Contract.aggregate(pipeline);
      const items = agg?.[0]?.items || [];
      const totalCount = agg?.[0]?.total?.[0]?.count || 0;
      return res.json({ contracts: items, total: totalCount });
    }

    const contracts = await Contract.find(baseMatch)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth faculty major")
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .sort({ createdAt: -1 });
    const total = await Contract.countDocuments(baseMatch);
    res.json({ contracts, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyContracts = async (req, res) => {
  try {
    const contracts = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 });
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** CRUD — tạo hợp đồng (admin/manager). Cộng chỗ phòng nếu trạng thái pending_payment hoặc active. */
exports.create = async (req, res) => {
  try {
    const { user, room, startDate, endDate, status: bodyStatus, terms, registration: regId } = req.body;
    if (!user || !room || !startDate || !endDate) {
      return res.status(400).json({ message: "Thiếu user, room, startDate hoặc endDate" });
    }
    if (!mongoose.isValidObjectId(user) || !mongoose.isValidObjectId(room)) {
      return res.status(400).json({ message: "user hoặc room không hợp lệ" });
    }
    const u = await User.findById(user);
    if (!u) return res.status(404).json({ message: "Không tìm thấy sinh viên" });
    const roomDoc = await Room.findById(room);
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const st = bodyStatus || "pending_payment";
    if (!["pending_payment", "active", "expired", "terminated"].includes(st)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }
    if (statusHoldsSlot(st)) {
      if (roomDoc.currentOccupancy >= roomDoc.capacity) {
        return res.status(400).json({ message: "Phòng đã đầy" });
      }
      roomDoc.currentOccupancy += 1;
      roomDoc.status = roomDoc.currentOccupancy >= roomDoc.capacity ? "full" : "available";
      await roomDoc.save();
    }
    let registrationRef = null;
    if (regId) {
      if (!mongoose.isValidObjectId(regId)) return res.status(400).json({ message: "registration không hợp lệ" });
      registrationRef = regId;
    }
    const cnRaw = req.body.contractNumber;
    const contractNumber =
      cnRaw !== undefined && cnRaw !== null && String(cnRaw).trim() !== "" ? String(cnRaw).trim() : `HD-${Date.now()}`;
    const contract = await Contract.create({
      registration: registrationRef,
      user,
      room,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: st,
      terms: terms != null ? String(terms) : "",
      contractNumber,
      createdBy: req.user._id,
    });
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        populate: [{ path: "area", select: "name" }, { path: "roomLeader", select: "_id fullName" }],
      });
    res.status(201).json(populated);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ message: "Số hợp đồng đã tồn tại" });
    }
    console.error("create contract:", error);
    res.status(500).json({ message: error.message || "Lỗi khi tạo hợp đồng" });
  }
};

/** CRUD — cập nhật (ngày, điều khoản, trạng thái). Điều chỉnh chỗ phòng khi đổi trạng thái. */
exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const contract = await Contract.findById(id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const { startDate, endDate, terms, status: newStatus } = req.body;
    if (newStatus !== undefined) {
      if (!["pending_payment", "active", "expired", "terminated"].includes(newStatus)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      const oldHolds = statusHoldsSlot(contract.status);
      const nextHolds = statusHoldsSlot(newStatus);
      if (oldHolds && !nextHolds) {
        await decrementRoomOccupancy(contract.room);
      } else if (!oldHolds && nextHolds) {
        const roomDoc = await Room.findById(contract.room);
        if (!roomDoc) return res.status(400).json({ message: "Phòng không tồn tại" });
        if (roomDoc.currentOccupancy >= roomDoc.capacity) {
          return res.status(400).json({ message: "Phòng đã đầy, không thể đặt trạng thái này" });
        }
        roomDoc.currentOccupancy += 1;
        roomDoc.status = roomDoc.currentOccupancy >= roomDoc.capacity ? "full" : "available";
        await roomDoc.save();
      }
      contract.status = newStatus;
    }
    if (startDate !== undefined) contract.startDate = new Date(startDate);
    if (endDate !== undefined) contract.endDate = new Date(endDate);
    if (terms !== undefined) contract.terms = String(terms);
    await contract.save();
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        populate: [{ path: "area", select: "name" }, { path: "roomLeader", select: "_id fullName" }],
      });
    res.json(populated);
  } catch (error) {
    console.error("update contract:", error);
    res.status(500).json({ message: error.message || "Lỗi khi cập nhật hợp đồng" });
  }
};

exports.getById = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      });
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const ownerId = String(contract.user?._id || contract.user || "");
    if (req.user.role === "user" && ownerId !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền xem" });
    }
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Admin/Manager: Student 360 view for a contract.
 * GET /api/contracts/:id/360
 */
exports.get360 = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID hợp đồng không hợp lệ" });
    }

    const contract = await Contract.findById(id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth avatar className major faculty enrollmentDate homeroomTeacher addressNative addressPermanent addressTemporary addressAbsent address familyFatherName familyFatherPhone familyMotherName familyMotherPhone familyEmergencyPhone")
      .populate({
        path: "room",
        populate: [{ path: "area", select: "name genderPolicy" }, { path: "roomLeader", select: "_id fullName studentId" }],
      })
      .lean();
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const userId = String(contract.user?._id || contract.user || "");
    const roomId = String(contract.room?._id || contract.room || "");
    const now = new Date();

    // Residence: contract history (latest first)
    const contracts = await Contract.find({ user: userId })
      .populate({ path: "room", populate: { path: "area", select: "name" } })
      .sort({ startDate: -1, createdAt: -1 })
      .lean();
    const activeContract =
      contracts.find((c) => c.status === "active" && new Date(c.endDate) >= now) ||
      contracts.find((c) => c.status === "active") ||
      contracts.find((c) => c.status === "pending_payment") ||
      null;

    // Financial: bills for this contract + unpaid for this user
    const [billsByContract, unpaidBills] = await Promise.all([
      Bill.find({ contract: contract._id })
        .sort({ year: -1, month: -1, createdAt: -1 })
        .lean(),
      Bill.find({ user: userId, status: { $in: ["pending", "unpaid", "overdue"] } })
        .sort({ dueDate: 1, year: -1, month: -1 })
        .lean(),
    ]);
    const debtTotal = unpaidBills.reduce((sum, b) => sum + Number(b.total || 0), 0);

    // Violations (by user or by room if splitToRoom)
    const violations = await Violation.find({
      $or: [{ user: contract.user?._id || contract.user }, { room: contract.room?._id || contract.room }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const violationCount = violations.filter((v) => v.status === "pending").length;

    // Maintenance reports (room/user)
    const maintenanceReports = await MaintenanceReport.find({ $or: [{ room: roomId }, { user: userId }] })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Timeline (minimal v1)
    const timeline = [];
    if (contract.createdAt) timeline.push({ type: "contract_created", at: contract.createdAt, title: "Tạo hợp đồng", meta: { contractNumber: contract.contractNumber } });
    if (contract.signedAt) timeline.push({ type: "student_signed", at: contract.signedAt, title: "Sinh viên ký xác nhận" });
    if (contract.paymentConfirmedAt) timeline.push({ type: "admin_confirmed", at: contract.paymentConfirmedAt, title: "Admin xác nhận (hợp đồng có hiệu lực)" });
    for (const b of billsByContract) {
      timeline.push({ type: "bill_created", at: b.createdAt, title: `Tạo hóa đơn ${b.month}/${b.year}`, meta: { status: b.status, total: b.total } });
      if (b.paidAt) timeline.push({ type: "bill_paid", at: b.paidAt, title: `Thanh toán hóa đơn ${b.month}/${b.year}`, meta: { total: b.total, method: b.paymentMethod } });
    }
    for (const v of violations.slice(0, 20)) {
      timeline.push({ type: "violation", at: v.createdAt, title: `Vi phạm: ${v.ruleName || "—"}`, meta: { severity: v.severity, status: v.status } });
    }
    for (const r of maintenanceReports.slice(0, 20)) {
      timeline.push({ type: "maintenance", at: r.createdAt, title: `Báo sự cố: ${r.incidentType}`, meta: { status: r.status } });
    }
    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.json({
      contract,
      student: contract.user || null,
      residence: {
        currentRoom: activeContract?.room || contract.room || null,
        activeContract: activeContract || null,
        contractHistory: contracts,
      },
      financial: {
        debtTotal,
        unpaidBills,
        billsByContract,
      },
      violations: {
        pendingCount: violationCount,
        items: violations,
      },
      maintenance: {
        items: maintenanceReports,
      },
      timeline,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
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
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status === "active" || contract.status === "pending_payment") {
      await decrementRoomOccupancy(contract.room);
      await releaseBedForContractId(contract._id, req.user?._id, "Hợp đồng chấm dứt");
    }
    contract.status = "terminated";
    contract.bed = null;
    await contract.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.studentSign = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).populate("registration");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền ký hợp đồng này" });
    }
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ message: "Hợp đồng không ở trạng thái chờ thanh toán" });
    }
    contract.signedAt = new Date();
    await contract.save();

    const io = getIO();
    io.emit("bill:new", {
      userId: req.user._id.toString(),
      message: "Bạn đã xác nhận thanh toán. Chờ admin xác nhận để hợp đồng có hiệu lực.",
    });
    await Notification.create({
      user: req.user._id,
      title: "Đã gửi xác nhận thanh toán",
      message: "Bạn đã xác nhận thanh toán hợp đồng. Vui lòng chờ admin xác nhận.",
      type: "contract_signed",
      link: "/student/my-contracts",
    });

    if (contract.createdBy) {
      await Notification.create({
        user: contract.createdBy,
        title: "Sinh viên đã ký xác nhận",
        message: `Sinh viên đã ký xác nhận hợp đồng ${contract.contractNumber}. Vui lòng xác nhận thanh toán.`,
        type: "contract_pending_admin_confirm",
        link: "/admin/contracts",
      });
    }

    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ message: "Hợp đồng không ở trạng thái chờ thanh toán" });
    }
    if (!contract.signedAt) {
      return res.status(400).json({ message: "Sinh viên chưa ký hợp đồng" });
    }
    contract.status = "active";
    contract.paymentConfirmedAt = new Date();
    contract.paymentConfirmedBy = req.user._id;
    await contract.save();

    // Auto assign bed (best effort) when contract becomes active
    try {
      await tryAutoAssignBed(contract._id, req.user?._id);
    } catch {
      // best-effort: bed assignment can be done manually later
    }

    const io = getIO();
    io.emit("registration:approved", {
      userId: contract.user.toString(),
      message: "Bạn là thành viên của KTX",
    });
    await Notification.create({
      user: contract.user,
      title: "Bạn là thành viên của KTX",
      message: "Thanh toán đã được xác nhận. Hợp đồng của bạn đã có hiệu lực, bạn là thành viên của KTX.",
      type: "contract_active",
      link: "/student/my-contracts",
    });

    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin/Manager: đảm bảo có slot giường + gán giường trống cho hợp đồng (khắc phục thiếu bed). */
exports.ensureBed = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "ID hợp đồng không hợp lệ" });

    const result = await tryAutoAssignBed(id, req.user?._id);
    if (!result.ok) {
      return res.status(400).json({ message: result.message || "Không gán được giường" });
    }

    const contract = await Contract.findById(id)
      .populate({
        path: "room",
        select: "roomNumber floor area capacity currentOccupancy price status",
        populate: { path: "area", select: "name genderPolicy" },
      })
      .populate("bed", "code status equipmentStatus")
      .lean();

    res.json({
      assigned: !result.already,
      alreadyHadBed: !!result.already,
      bed: result.bed || contract?.bed || null,
      contract,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /api/my-contract — tổng hợp cho UI “Hợp đồng của tôi” */
exports.getMyContractOverview = async (req, res) => {
  try {
    const student = await User.findById(req.user._id)
      .select("fullName email phone studentId gender citizenId dateOfBirth avatar")
      .lean();
    const contracts = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();
    const activeContract = contracts.find((c) => c.status === "active") || null;
    const extendRequests = await ContractExtendRequest.find({ user: req.user._id })
      .populate("contract", "contractNumber status endDate startDate")
      .sort({ createdAt: -1 })
      .lean();
    const extensionEnabled = await isContractExtensionGloballyEnabled();
    res.json({ student, contracts, activeContract, extendRequests, extensionEnabled });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Sinh viên: POST /contracts/:id/request-extend */
exports.requestExtend = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    if (!(await isContractExtensionGloballyEnabled())) {
      return res.status(400).json({ message: "Chức năng gia hạn hợp đồng hiện đang tắt" });
    }
    const months = parseInt(req.body?.months, 10);
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      return res.status(400).json({ message: "Số tháng gia hạn phải từ 1 đến 36" });
    }
    const contract = await Contract.findById(id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (String(contract.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền với hợp đồng này" });
    }
    if (contract.status !== "active") {
      return res.status(400).json({ message: "Chỉ hợp đồng đang hiệu lực (active) mới được gửi yêu cầu gia hạn" });
    }
    const dup = await ContractExtendRequest.findOne({ contract: contract._id, status: "pending" });
    if (dup) {
      return res.status(400).json({ message: "Đã có yêu cầu gia hạn đang chờ duyệt cho hợp đồng này" });
    }
    const doc = await ContractExtendRequest.create({
      contract: contract._id,
      user: req.user._id,
      months,
      status: "pending",
      snapshotEndDate: contract.endDate,
    });
    const populated = await ContractExtendRequest.findById(doc._id)
      .populate("contract", "contractNumber")
      .lean();
    await notifyAdminsNewExtendRequest({
      studentName: req.user.fullName,
      contractNumber: contract.contractNumber,
      months,
    });
    res.status(201).json(populated);
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(400).json({ message: "Đã có yêu cầu gia hạn đang chờ duyệt" });
    }
    res.status(500).json({ message: e.message });
  }
};

/** Admin / Manager: danh sách yêu cầu gia hạn */
exports.listExtendRequests = async (req, res) => {
  try {
    const st = String(req.query.status || "pending");
    const filter = {};
    if (st !== "all") filter.status = st;
    const rows = await ContractExtendRequest.find(filter)
      .populate("user", "fullName email studentId")
      .populate("contract", "contractNumber status startDate endDate")
      .populate("reviewedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.approveExtendRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rid = String(req.params.requestId || "").trim();
    if (!mongoose.isValidObjectId(rid)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" });
    }
    const reqDoc = await ContractExtendRequest.findById(rid).session(session);
    if (!reqDoc || reqDoc.status !== "pending") {
      await session.abortTransaction();
      return res.status(404).json({ message: "Không tìm thấy yêu cầu hoặc đã xử lý" });
    }
    const contract = await Contract.findById(reqDoc.contract).session(session);
    if (!contract) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Hợp đồng không tồn tại" });
    }
    if (contract.status !== "active") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Hợp đồng không còn active, không thể gia hạn" });
    }
    const newEnd = addCalendarMonths(contract.endDate, reqDoc.months);
    contract.endDate = newEnd;
    await contract.save({ session });
    reqDoc.status = "approved";
    reqDoc.appliedEndDate = newEnd;
    reqDoc.reviewedBy = req.user._id;
    reqDoc.reviewedAt = new Date();
    reqDoc.note = "";
    await reqDoc.save({ session });
    await session.commitTransaction();

    const io = getIO();
    io.emit("contract:extended", {
      userId: String(contract.user),
      message: `Yêu cầu gia hạn ${reqDoc.months} tháng đã được duyệt. Ngày kết thúc mới: ${newEnd.toLocaleDateString("vi-VN")}`,
    });
    await Notification.create({
      user: contract.user,
      title: "Gia hạn hợp đồng được duyệt",
      message: `Hợp đồng ${contract.contractNumber} đã được gia hạn thêm ${reqDoc.months} tháng.`,
      type: "contract_renewal",
      link: "/student/my-contracts",
    });

    const out = await ContractExtendRequest.findById(reqDoc._id)
      .populate("contract", "contractNumber endDate")
      .lean();
    res.json({ request: out, contract });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ message: e.message });
  } finally {
    session.endSession();
  }
};

exports.rejectExtendRequest = async (req, res) => {
  try {
    const rid = String(req.params.requestId || "").trim();
    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" });
    }
    const note = String(req.body?.note || "").trim();
    if (!note) return res.status(400).json({ message: "Vui lòng nhập lý do từ chối" });
    const reqDoc = await ContractExtendRequest.findById(rid);
    if (!reqDoc || reqDoc.status !== "pending") {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu hoặc đã xử lý" });
    }
    reqDoc.status = "rejected";
    reqDoc.note = note;
    reqDoc.reviewedBy = req.user._id;
    reqDoc.reviewedAt = new Date();
    await reqDoc.save();

    const contract = await Contract.findById(reqDoc.contract).select("user contractNumber").lean();
    if (contract?.user) {
      await Notification.create({
        user: contract.user,
        title: "Yêu cầu gia hạn bị từ chối",
        message: `Hợp đồng ${contract.contractNumber}: ${note}`,
        type: "contract_renewal",
        link: "/student/my-contracts",
      });
    }

    res.json(await ContractExtendRequest.findById(reqDoc._id).populate("contract", "contractNumber").lean());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
