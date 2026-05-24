const mongoose = require("mongoose");
const MaintenanceReport = require("../models/MaintenanceReport");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const FacilityLocation = require("../models/FacilityLocation");

function isStudentRole(role) {
  const r = String(role || "");
  return r === "user" || r === "student";
}
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

async function notifyAdminsNewReport({ reporter, roomDoc, damagedItemLabel }) {
  const io = getIO();
  const areaId = String(roomDoc?.area?._id || roomDoc?.area || "");
  const itemLabel = damagedItemLabel || "thiết bị/vật tư";
  const admins = await User.find({
    $or: [{ role: "admin" }, { role: "manager", managedArea: areaId || null }],
  }).select("_id");
  if (!admins.length) return;
  const title = "Khai báo hư hỏng mới";
  const msg = `${reporter?.fullName || "Sinh viên"} báo hỏng [${itemLabel}] tại phòng ${roomDoc?.roomNumber || ""}.`;
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

const STUDENT_HIDDEN_FIELDS = [
  "damageCause",
  "compensationAmount",
  "resolutionType",
  "severity",
  "maintenanceStatus",
  "adminNote",
  "bill",
  "processedBy",
];

function toStudentMaintenanceDto(doc) {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  for (const k of STUDENT_HIDDEN_FIELDS) delete o[k];
  if (doc?.status === "resolved" && doc?.resolutionType === "compensation" && doc?.bill) {
    o.hasCompensationBill = true;
  }
  return o;
}

function stripStudentForbiddenFields(body) {
  const allowed = ["facilityLocationId", "damagedItemLabel", "description", "images"];
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

async function resolveDamagedItemForRoom(roomId, { facilityLocationId, damagedItemLabel }) {
  const customLabel = String(damagedItemLabel || "").trim();
  if (facilityLocationId) {
    const loc = await FacilityLocation.findById(facilityLocationId).populate("facility", "name code");
    if (!loc || String(loc.room) !== String(roomId)) {
      const err = new Error("Thiết bị/vật tư không thuộc phòng của bạn");
      err.status = 400;
      throw err;
    }
    const fac = loc.facility;
    const name = fac?.name || customLabel || "CSVC phòng";
    const label = loc.quantity > 1 ? `${name} (SL ${loc.quantity})` : name;
    return {
      facilityLocation: loc._id,
      facility: fac?._id || null,
      damagedItemLabel: label,
    };
  }
  if (customLabel.length < 2) {
    const err = new Error("Vui lòng chọn thiết bị/vật tư hoặc nhập tên (tối thiểu 2 ký tự)");
    err.status = 400;
    throw err;
  }
  return { facilityLocation: null, facility: null, damagedItemLabel: customLabel };
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
  { path: "facility", select: "name code" },
  { path: "processedBy", select: "fullName" },
  { path: "bill", select: "billCode total status billType" },
];

/** CSVC phòng cho form khai báo — kho FacilityLocation + fallback Room.amenities */
async function listRoomFacilityOptions(userId) {
  const contract = await resolveResidentContract(userId);
  if (!contract?.room) {
    const err = new Error("Bạn chưa có hợp đồng phòng đang hiệu lực");
    err.status = 403;
    throw err;
  }
  const roomId = contract.room._id || contract.room;
  const locations = await FacilityLocation.find({ room: roomId })
    .populate("facility", "name code category")
    .sort({ createdAt: -1 })
    .lean();

  const items = locations
    .filter((loc) => loc.facility && typeof loc.facility === "object")
    .map((loc) => ({
      _id: String(loc._id),
      quantity: Number(loc.quantity) || 1,
      facility: {
        name: loc.facility.name,
        code: loc.facility.code || "",
      },
      source: "inventory",
    }));

  const roomDoc = await Room.findById(roomId).select("amenities roomNumber").lean();
  if (items.length === 0 && roomDoc?.amenities?.length) {
    roomDoc.amenities.forEach((raw, i) => {
      const name = String(raw || "").trim();
      if (!name) return;
      items.push({
        _id: `amenity:${encodeURIComponent(name)}`,
        quantity: 1,
        facility: { name, code: "" },
        source: "amenity",
      });
    });
  }

  return {
    roomId: String(roomId),
    roomNumber: roomDoc?.roomNumber || contract.room?.roomNumber || "",
    items,
  };
}

async function listMine(userId) {
  const items = await MaintenanceReport.find({ user: userId })
    .populate("room", "roomNumber area")
    .populate("room.area", "name")
    .populate("facility", "name code")
    .sort({ createdAt: -1 });
  return items.map((doc) => toStudentMaintenanceDto(doc));
}

async function createReport(user, body) {
  const safe = stripStudentForbiddenFields(body);
  const { facilityLocationId, damagedItemLabel, description, images } = safe;
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
  const itemFields = await resolveDamagedItemForRoom(roomId, {
    facilityLocationId,
    damagedItemLabel,
  });
  const imgs = Array.isArray(images) ? images.filter((x) => typeof x === "string").slice(0, 10) : [];
  const doc = await MaintenanceReport.create({
    user: user._id,
    room: roomId,
    ...itemFields,
    incidentType: "",
    description: String(description || "").trim(),
    images: imgs,
    status: "pending",
  });
  await notifyAdminsNewReport({ reporter: user, roomDoc, damagedItemLabel: itemFields.damagedItemLabel });
  const populated = await MaintenanceReport.findById(doc._id).populate(POPULATE_DETAIL);
  return toStudentMaintenanceDto(populated);
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
  const { status, adminNote, damageCause, compensationAmount } = body;

  if (adminNote != null) doc.adminNote = String(adminNote).trim();

  /** Tiếp nhận — chuyển «Đang sửa chữa» */
  if (status === "processing" && doc.status === "pending") {
    doc.status = "processing";
    doc.processedAt = new Date();
    doc.processedBy = req.user._id;
    await doc.save();
    return MaintenanceReport.findById(doc._id).populate(POPULATE_DETAIL);
  }

  /** Phán quyết — «Đã khắc phục» + nguyên nhân + phí đền bù */
  const cause = damageCause || doc.damageCause;
  const finishing =
    status === "resolved" ||
    (damageCause && ["natural_wear", "student_caused"].includes(String(damageCause)));

  if (finishing) {
    if (!cause) {
      const err = new Error("Vui lòng chọn nguyên nhân hư hỏng sau khi kiểm tra thực tế");
      err.status = 400;
      throw err;
    }
    if (!["processing", "pending", "resolved"].includes(doc.status)) {
      const err = new Error("Đơn không ở trạng thái cho phép hoàn tất xử lý");
      err.status = 400;
      throw err;
    }

    doc.damageCause = cause;
    doc.status = "resolved";
    doc.processedAt = new Date();
    doc.processedBy = req.user._id;
    doc.maintenanceStatus = "completed";

    if (cause === "natural_wear") {
      doc.compensationAmount = 0;
      doc.resolutionType = "maintenance";
      doc.bill = null;
    } else if (cause === "student_caused") {
      const amt = Math.round(Number(compensationAmount ?? doc.compensationAmount) || 0);
      if (amt <= 0) {
        const err = new Error("Phí đền bù phải lớn hơn 0 khi nguyên nhân là sinh viên làm hỏng");
        err.status = 400;
        throw err;
      }
      doc.compensationAmount = amt;
      doc.resolutionType = "compensation";
      const bill = await createDamageReimbursementBill({
        reportDoc: doc,
        amount: amt,
        adminUserId: req.user._id,
      });
      doc.bill = bill._id;
    }
  } else if (status != null && status !== doc.status) {
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
  listRoomFacilityOptions,
  createReport,
  cancelReport,
  adminList,
  adminPatch,
  resolveResidentContract,
  toStudentMaintenanceDto,
  isStudentRole,
  INCIDENT_LABEL,
};
