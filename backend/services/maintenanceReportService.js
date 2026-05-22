const mongoose = require("mongoose");
const MaintenanceReport = require("../models/MaintenanceReport");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { createDamageReimbursementBill } = require("./damageReimbursementBillService");

const ACTIVE_CONTRACT = { $in: ["active", "pending_payment"] };
const INCIDENT_LABEL = { electricity: "Điện", water: "Nước", equipment: "Thiết bị", other: "Khác" };

function buildRequestCode(doc) {
  const d = doc.createdAt ? new Date(doc.createdAt) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const suffix = String(doc._id || "").slice(-6).toUpperCase();
  return `YC-${y}${m}-${suffix}`;
}

async function ensureRequestCodes(items) {
  for (const doc of items) {
    if (doc.requestCode) continue;
    const code = buildRequestCode(doc);
    doc.requestCode = code;
    await MaintenanceReport.updateOne({ _id: doc._id }, { $set: { requestCode: code } });
  }
}

async function resolveResidentContract(userId) {
  return Contract.findOne({ user: userId, status: ACTIVE_CONTRACT })
    .sort({ startDate: -1 })
    .populate({
      path: "room",
      select: "roomNumber area",
      populate: { path: "area", select: "name" },
    });
}

async function buildManagerScopeFilter(req) {
  const filter = {};
  if (req.user.role === "manager" && req.user.managedArea) {
    const rooms = await Room.find({ area: req.user.managedArea }).select("_id");
    if (rooms.length) filter.room = { $in: rooms.map((r) => r._id) };
    else filter.room = { $in: [] };
  }
  return filter;
}

async function assertManagerAccess(req, doc) {
  if (req.user.role !== "manager" || !req.user.managedArea) return;
  const roomArea = doc.room?.area?._id || doc.room?.area;
  if (String(roomArea || "") !== String(req.user.managedArea)) {
    const err = new Error("Khai báo không thuộc khu bạn quản lý");
    err.status = 403;
    throw err;
  }
}

async function notifyAdminsNewReport({ reporter, roomDoc, incidentType }) {
  const io = getIO();
  const areaId = String(roomDoc?.area?._id || roomDoc?.area || "");
  const typeLabel = INCIDENT_LABEL[incidentType] || incidentType;
  const admins = await User.find({
    $or: [{ role: "admin" }, { role: "manager", managedArea: areaId || null }],
  }).select("_id");
  if (!admins.length) return;
  const title = "Khai báo hư hỏng mới";
  const msg = `${reporter?.fullName || "Sinh viên"} báo sự cố [${typeLabel}] tại phòng ${roomDoc?.roomNumber || ""}.`;
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message: msg,
      type: "general",
      link: "/admin/maintenance-reports",
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message: msg, link: "/admin/maintenance-reports" });
  }
}

async function notifyStudentResolved({ studentId, roomNumber, resolutionType, compensationAmount }) {
  const io = getIO();
  const isComp = resolutionType === "compensation";
  const title = isComp ? "Khai báo hư hỏng — bồi thường" : "Khai báo hư hỏng đã xử lý";
  const message = isComp
    ? `Yêu cầu phòng ${roomNumber || ""} đã xử lý. Bạn cần bồi thường ${Math.round(compensationAmount || 0).toLocaleString("vi-VN")}đ (xem Hóa đơn).`
    : `Yêu cầu sửa chữa phòng ${roomNumber || ""} đã được xử lý (yêu cầu bảo trì).`;
  await Notification.create({
    user: studentId,
    title,
    message,
    type: "general",
    link: isComp ? "/student/my-bills" : "/student/damage-report",
  });
  io.emit("notification:new", { userId: String(studentId), title, message, link: "/student/damage-report" });
}

function stripStudentForbiddenFields(body) {
  const allowed = ["type", "description", "images"];
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

async function buildAdminListFilter(req, query) {
  const scopeFilter = await buildManagerScopeFilter(req);
  const filter = { ...scopeFilter };
  const status = String(query.status || "all");
  if (status !== "all") filter.status = status;

  const month = parseInt(query.month, 10);
  const year = parseInt(query.year, 10);
  if (month >= 1 && month <= 12 && year >= 2000) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    filter.createdAt = { $gte: start, $lt: end };
  } else if (query.date) {
    const d = new Date(String(query.date));
    if (!Number.isNaN(d.getTime())) {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }
  }

  const search = String(query.search || "").trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      $or: [{ fullName: rx }, { studentId: rx }],
      role: { $in: ["user", "student"] },
    }).select("_id");
    const or = [{ requestCode: rx }, { description: rx }];
    if (users.length) or.push({ user: { $in: users.map((u) => u._id) } });
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: or });
  }

  return filter;
}

async function getAdminSummary(scopeFilter) {
  const [totalAll, pendingCount, resolvedCount, cancelledCount, processingCount] = await Promise.all([
    MaintenanceReport.countDocuments(scopeFilter),
    MaintenanceReport.countDocuments({ ...scopeFilter, status: "pending" }),
    MaintenanceReport.countDocuments({ ...scopeFilter, status: "resolved" }),
    MaintenanceReport.countDocuments({ ...scopeFilter, status: "cancelled" }),
    MaintenanceReport.countDocuments({ ...scopeFilter, status: "processing" }),
  ]);
  return { totalAll, pendingCount, resolvedCount, cancelledCount, processingCount };
}

const POPULATE_LIST =
  "user room processedBy bill";
const POPULATE_DETAIL = [
  { path: "user", select: "fullName studentId email phone" },
  { path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } },
  { path: "processedBy", select: "fullName" },
  { path: "bill", select: "billCode total status billType" },
];

async function listMine(userId) {
  return MaintenanceReport.find({ user: userId })
    .populate("room", "roomNumber area")
    .populate("room.area", "name")
    .populate("bill", "billCode total status")
    .sort({ createdAt: -1 });
}

async function createReport(user, body) {
  const safe = stripStudentForbiddenFields(body);
  const { type: incidentType, description, images } = safe;
  const contract = await resolveResidentContract(user._id);
  if (!contract || !contract.room) {
    const err = new Error("Bạn chưa có hợp đồng phòng đang hiệu lực để gửi khai báo");
    err.status = 403;
    throw err;
  }
  const roomId = contract.room._id || contract.room;
  const roomDoc =
    typeof contract.room === "object" && contract.room.roomNumber != null
      ? contract.room
      : await Room.findById(roomId).populate("area", "name");
  if (!roomDoc) {
    const err = new Error("Không xác định được phòng");
    err.status = 400;
    throw err;
  }
  const imgs = Array.isArray(images) ? images.filter((x) => typeof x === "string").slice(0, 10) : [];
  const doc = await MaintenanceReport.create({
    user: user._id,
    room: roomId,
    incidentType,
    description: String(description || "").trim(),
    images: imgs,
    status: "pending",
  });
  await notifyAdminsNewReport({ reporter: user, roomDoc, incidentType });
  return MaintenanceReport.findById(doc._id).populate(POPULATE_DETAIL);
}

async function cancelReport(userId, reportId) {
  const doc = await MaintenanceReport.findById(reportId);
  if (!doc) {
    const err = new Error("Không tìm thấy khai báo");
    err.status = 404;
    throw err;
  }
  if (String(doc.user) !== String(userId)) {
    const err = new Error("Không phải khai báo của bạn");
    err.status = 403;
    throw err;
  }
  if (doc.status !== "pending") {
    const err = new Error("Chỉ hủy được khi trạng thái là chờ xử lý");
    err.status = 400;
    throw err;
  }
  doc.status = "cancelled";
  doc.cancelledAt = new Date();
  await doc.save();
  return { ok: true, id: String(doc._id) };
}

async function adminList(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const scopeFilter = await buildManagerScopeFilter(req);
  const filter = await buildAdminListFilter(req, req.query);
  const [items, total, summary] = await Promise.all([
    MaintenanceReport.find(filter)
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("processedBy", "fullName")
      .populate("bill", "billCode total status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MaintenanceReport.countDocuments(filter),
    getAdminSummary(scopeFilter),
  ]);
  await ensureRequestCodes(items);
  return { reports: items, total, page, limit, summary };
}

async function adminPatch(req, reportId, body) {
  const doc = await MaintenanceReport.findById(reportId).populate("room", "roomNumber area");
  if (!doc) {
    const err = new Error("Không tìm thấy");
    err.status = 404;
    throw err;
  }
  await assertManagerAccess(req, doc);

  const prevStatus = doc.status;
  const {
    status,
    adminNote,
    severity,
    damageCause,
    resolutionType,
    compensationAmount,
    maintenanceStatus,
  } = body;

  if (adminNote != null) doc.adminNote = String(adminNote).trim();
  if (severity != null) doc.severity = severity;
  if (damageCause != null) doc.damageCause = damageCause;
  if (maintenanceStatus != null) doc.maintenanceStatus = maintenanceStatus;

  if (status === "processing" && doc.status === "pending") {
    doc.status = "processing";
    if (!doc.processedAt) {
      doc.processedAt = new Date();
      doc.processedBy = req.user._id;
    }
  } else if (status === "resolved" || resolutionType) {
    const rType = resolutionType || doc.resolutionType;
    if (!rType) {
      const err = new Error("Vui lòng chọn loại xử lý: Yêu cầu bảo trì hoặc Bồi thường");
      err.status = 400;
      throw err;
    }
    if (!damageCause && !doc.damageCause) {
      const err = new Error("Vui lòng xác nhận nguyên nhân hư hỏng");
      err.status = 400;
      throw err;
    }
    if (damageCause) doc.damageCause = damageCause;

    doc.resolutionType = rType;
    doc.status = "resolved";
    doc.processedAt = new Date();
    doc.processedBy = req.user._id;

    if (rType === "maintenance") {
      doc.compensationAmount = 0;
      doc.maintenanceStatus = maintenanceStatus || doc.maintenanceStatus || "scheduled";
    } else if (rType === "compensation") {
      const amt = Math.round(Number(compensationAmount ?? doc.compensationAmount) || 0);
      if (amt <= 0) {
        const err = new Error("Chi phí bồi thường phải lớn hơn 0");
        err.status = 400;
        throw err;
      }
      doc.compensationAmount = amt;
      doc.maintenanceStatus = "";
      const bill = await createDamageReimbursementBill({
        reportDoc: doc,
        amount: amt,
        adminUserId: req.user._id,
      });
      doc.bill = bill._id;
    }
  } else if (status != null) {
    doc.status = status;
    if (["processing", "resolved"].includes(status) && !doc.processedAt) {
      doc.processedAt = new Date();
      doc.processedBy = req.user._id;
    }
  }

  await doc.save();

  if (prevStatus !== "resolved" && doc.status === "resolved") {
    await notifyStudentResolved({
      studentId: doc.user,
      roomNumber: doc.room?.roomNumber,
      resolutionType: doc.resolutionType,
      compensationAmount: doc.compensationAmount,
    });
  }

  return MaintenanceReport.findById(doc._id).populate(POPULATE_DETAIL);
}

module.exports = {
  listMine,
  createReport,
  cancelReport,
  adminList,
  adminPatch,
  resolveResidentContract,
  INCIDENT_LABEL,
};
