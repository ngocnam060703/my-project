const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const ContractExtensionSetting = require("../models/ContractExtensionSetting");
const { getIO } = require("../socket");

const CONTRACT_EXT_SETTING_KEY = "contract_extension";
const CONTRACT_STATUSES = ["pending_payment", "active", "expired", "terminated"];
const HOLD_SLOT_STATUSES = new Set(["pending_payment", "active"]);
const ALLOWED_STATUS_TRANSITIONS = {
  pending_payment: ["terminated"],
  active: ["expired", "terminated"],
  expired: ["terminated"],
  terminated: [],
};

async function isContractExtensionGloballyEnabled() {
  const doc = await ContractExtensionSetting.findOne({ key: CONTRACT_EXT_SETTING_KEY });
  return doc?.enable_contract_extension !== false;
}

function addCalendarMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

function parseDateValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return "Thiếu ngày bắt đầu hoặc ngày kết thúc";
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end) return "Ngày bắt đầu hoặc ngày kết thúc không hợp lệ";
  if (start >= end) return "Ngày kết thúc phải sau ngày bắt đầu";
  return null;
}

function canUpdateCoreContractData(contract) {
  return contract.status !== "active" && contract.status !== "expired" && contract.status !== "terminated";
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
  return HOLD_SLOT_STATUSES.has(String(status || ""));
}

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    const contracts = await Contract.find(filter)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
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
    const dateErr = validateDateRange(startDate, endDate);
    if (dateErr) return res.status(400).json({ message: dateErr });
    const st = bodyStatus || "pending_payment";
    if (!CONTRACT_STATUSES.includes(st)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }
    if (st === "active") {
      return res.status(400).json({ message: "Không thể tạo trực tiếp hợp đồng ở trạng thái active" });
    }
    const openContract = await Contract.findOne({
      user,
      status: { $in: ["pending_payment", "active"] },
    }).select("_id contractNumber status");
    if (openContract) {
      return res.status(400).json({
        message: `Sinh viên đã có hợp đồng đang mở (${openContract.contractNumber || openContract._id} - ${openContract.status})`,
      });
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
      startDate: parseDateValue(startDate),
      endDate: parseDateValue(endDate),
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
    const hasCoreFieldUpdate = startDate !== undefined || endDate !== undefined || terms !== undefined;
    if (hasCoreFieldUpdate && !canUpdateCoreContractData(contract)) {
      return res.status(400).json({
        message: "Hợp đồng đã có hiệu lực hoặc đã kết thúc, không được sửa nội dung. Vui lòng dùng gia hạn/phụ lục/hợp đồng mới.",
      });
    }

    const nextStartDate = startDate !== undefined ? startDate : contract.startDate;
    const nextEndDate = endDate !== undefined ? endDate : contract.endDate;
    if (startDate !== undefined || endDate !== undefined) {
      const dateErr = validateDateRange(nextStartDate, nextEndDate);
      if (dateErr) return res.status(400).json({ message: dateErr });
    }

    if (newStatus !== undefined) {
      if (!CONTRACT_STATUSES.includes(newStatus)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      if (newStatus === "active") {
        return res.status(400).json({ message: "Dùng API xác nhận thanh toán để chuyển sang active" });
      }
      if (newStatus !== contract.status) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[contract.status] || [];
        if (!allowed.includes(newStatus)) {
          return res.status(400).json({ message: `Không thể chuyển trạng thái từ ${contract.status} sang ${newStatus}` });
        }
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
    if (startDate !== undefined) contract.startDate = parseDateValue(startDate);
    if (endDate !== undefined) contract.endDate = parseDateValue(endDate);
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

exports.extend = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status !== "active") {
      return res.status(400).json({ message: "Chỉ hợp đồng active mới được gia hạn" });
    }
    const { endDate } = req.body;
    const parsedEndDate = parseDateValue(endDate);
    if (!parsedEndDate) return res.status(400).json({ message: "Ngày kết thúc mới không hợp lệ" });
    if (parsedEndDate <= contract.endDate) {
      return res.status(400).json({ message: "Ngày kết thúc mới phải lớn hơn ngày kết thúc hiện tại" });
    }
    contract.endDate = parsedEndDate;
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
    if (contract.status === "expired" || contract.status === "terminated") {
      return res.status(400).json({ message: "Hợp đồng đã kết thúc trước đó" });
    }
    if (contract.status === "active" || contract.status === "pending_payment") {
      await decrementRoomOccupancy(contract.room);
    }
    const reason = String(req.body?.reason || "").trim();
    if (reason) contract.cancelReason = reason;
    contract.status = "terminated";
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
    contract.studentConfirmedAt = contract.signedAt;
    contract.studentConfirmedBy = req.user._id;
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

exports.uploadSignedPdf = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ message: "Chỉ được upload file PDF khi hợp đồng đang chờ xác nhận" });
    }
    const signedPdfUrl = String(req.body?.signedPdfUrl || "").trim();
    if (!signedPdfUrl) {
      return res.status(400).json({ message: "Vui lòng cung cấp đường dẫn file PDF đã ký" });
    }
    const lower = signedPdfUrl.toLowerCase();
    if (!lower.endsWith(".pdf")) {
      return res.status(400).json({ message: "File hợp đồng phải là PDF" });
    }
    contract.signedPdfUrl = signedPdfUrl;
    contract.signedPdfUploadedAt = new Date();
    contract.signedPdfUploadedBy = req.user._id;
    await contract.save();
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
    if (!contract.signedPdfUrl) {
      return res.status(400).json({ message: "Chưa có file PDF hợp đồng đã ký. Vui lòng upload trước khi xác nhận." });
    }
    contract.status = "active";
    contract.paymentConfirmedAt = new Date();
    contract.paymentConfirmedBy = req.user._id;
    contract.adminReviewedAt = contract.paymentConfirmedAt;
    contract.adminReviewedBy = req.user._id;
    await contract.save();

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
