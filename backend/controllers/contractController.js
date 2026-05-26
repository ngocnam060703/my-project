const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Registration = require("../models/Registration");
const Application = require("../models/Application");
const Notification = require("../models/Notification");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const {
  getExtensionPolicy,
} = require("../services/contractExtensionPolicy");
const {
  createStudentExtendRequest,
  listExtendRequests: listExtendRequestsService,
  approveExtendRequest: approveExtendRequestService,
  rejectExtendRequest: rejectExtendRequestService,
  buildStudentExtensionContext,
  buildRenewalPreview,
  confirmStudentRenewal,
} = require("../services/contractExtensionService");
const { getClientIp } = require("../utils/clientIp");
const Bill = require("../models/Bill");
const Violation = require("../models/Violation");
const MaintenanceReport = require("../models/MaintenanceReport");
const { getIO } = require("../socket");
const { tryAutoAssignBed } = require("../services/bedAllocation");
const { releaseBedForContractId } = require("../services/bedOccupancy");
const { recountRoomOccupancyForRoom } = require("../services/roomOccupancySync");
const { processRenewalHandovers, runContractLifecycleJobs } = require("../services/contractRenewalLifecycle");
const {
  buildContractPricingFields,
  applyPricingSnapshotToContract,
  lockTransferContractPricingOnSign,
  assertNoManualPricingInBody,
  resolveContractDisplayPricing,
  ensureContractPricingSnapshot,
  isContractPricingFrozen,
  hasPricingSnapshot,
  isTransferContractLike,
} = require("../services/contractPricing");

function attachContractDisplayPricing(contractLean, roomLean) {
  if (!contractLean) return contractLean;
  const display = resolveContractDisplayPricing(contractLean, roomLean);
  return { ...contractLean, displayPricing: display };
}

function hasPopulatedRoom(c) {
  return !!(c?.room && typeof c.room === "object" && c.room.roomNumber);
}

function hasPopulatedUser(c) {
  return !!(c?.user && typeof c.user === "object" && (c.user.fullName || c.user.studentId));
}

function contractRoomRefId(c) {
  if (!c) return "";
  return String(c.room?._id || c.room || "");
}

/** Nạp phòng từ room / đơn chuyển / đơn đăng ký KTX cho danh sách HĐ admin. */
async function loadRoomContextMapsForContracts(rows) {
  const regIds = new Set();
  const appIds = new Set();
  const roomIdSet = new Set();

  for (const c of rows) {
    const rid = contractRoomRefId(c);
    if (rid) roomIdSet.add(rid);
    const regId = c.registration?._id || c.registration;
    if (regId) regIds.add(String(regId));
    const appId = c.application?._id || c.application;
    if (appId) appIds.add(String(appId));
  }

  const [transferRegs, apps] = await Promise.all([
    regIds.size
      ? Registration.find({ _id: { $in: [...regIds] } }).select("room fromRoom").lean()
      : [],
    appIds.size
      ? Application.find({ _id: { $in: [...appIds] } }).select("assignedRoom").lean()
      : [],
  ]);

  const regRoomByRegId = new Map(transferRegs.map((r) => [String(r._id), r.room]));
  const appRoomByAppId = new Map(apps.map((a) => [String(a._id), a.assignedRoom]));

  for (const rid of regRoomByRegId.values()) if (rid) roomIdSet.add(String(rid));
  for (const rid of appRoomByAppId.values()) if (rid) roomIdSet.add(String(rid));

  const rooms = roomIdSet.size
    ? await Room.find({ _id: { $in: [...roomIdSet] } })
        .select(ROOM_SELECT_FOR_PRICING)
        .populate("area", "name")
        .lean()
    : [];
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));

  return { roomById, regRoomByRegId, appRoomByAppId };
}

function resolveRoomLeanForContractRow(c, ctx) {
  const { roomById, regRoomByRegId, appRoomByAppId } = ctx;
  if (hasPopulatedRoom(c)) return c.room;

  const directId = contractRoomRefId(c);
  if (directId && roomById.has(directId)) return roomById.get(directId);

  if (c.registration) {
    const targetId = regRoomByRegId.get(String(c.registration?._id || c.registration));
    if (targetId && roomById.has(String(targetId))) return roomById.get(String(targetId));
  }

  if (c.application) {
    const assigned = appRoomByAppId.get(String(c.application?._id || c.application));
    if (assigned && roomById.has(String(assigned))) return roomById.get(String(assigned));
  }

  return null;
}

const ROOM_SELECT_FOR_PRICING =
  "roomNumber floor area capacity maxCapacity price currentPrice currentOccupancy status";

/** Phòng đích + phòng cũ từ đơn chuyển phòng (trang admin HĐ). */
async function enrichContractTransferContextForAdmin(contractLean) {
  if (!contractLean || !isTransferContractLike(contractLean)) return contractLean;
  const regId = contractLean.registration?._id || contractLean.registration;
  if (!regId) return contractLean;
  const reg = await Registration.findById(regId)
    .select("room fromRoom transferReason status transferPhase")
    .populate({
      path: "room",
      select: ROOM_SELECT_FOR_PRICING,
      populate: { path: "area", select: "name" },
    })
    .populate({
      path: "fromRoom",
      select: ROOM_SELECT_FOR_PRICING,
      populate: { path: "area", select: "name" },
    })
    .lean();
  if (!reg) return contractLean;
  return {
    ...contractLean,
    transferRegistration: {
      _id: reg._id,
      transferReason: reg.transferReason,
      status: reg.status,
      transferPhase: reg.transferPhase,
      targetRoom: reg.room,
      fromRoom: reg.fromRoom,
    },
  };
}

/** Đồng bộ giá HĐ chờ ký từ phòng + displayPricing cho trang admin. */
async function enrichContractsForAdminList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const {
    isPendingContractAwaitingSign,
    applyPricingSnapshotToContract,
  } = require("../services/contractPricing");

  const pendingIds = rows
    .filter((c) => c && isPendingContractAwaitingSign(c))
    .map((c) => c._id)
    .filter(Boolean);
  if (pendingIds.length) {
    const pendingDocs = await Contract.find({ _id: { $in: pendingIds } });
    const transferRegIds = [
      ...new Set(
        pendingDocs
          .filter((d) => isTransferContractLike(d) && d.registration)
          .map((d) => String(d.registration))
          .filter(Boolean)
      ),
    ];
    const transferRegs = transferRegIds.length
      ? await Registration.find({ _id: { $in: transferRegIds } }).select("room").lean()
      : [];
    const transferTargetRoomByReg = new Map(transferRegs.map((r) => [String(r._id), r.room]));

    const appIds = [
      ...new Set(
        pendingDocs
          .filter((d) => d.application)
          .map((d) => String(d.application))
          .filter(Boolean)
      ),
    ];
    const apps = appIds.length
      ? await Application.find({ _id: { $in: appIds } }).select("assignedRoom").lean()
      : [];
    const appRoomByAppId = new Map(apps.map((a) => [String(a._id), a.assignedRoom]));

    const roomIds = [
      ...new Set(
        pendingDocs.flatMap((d) => {
          const ids = [String(d.room)];
          if (isTransferContractLike(d) && d.registration) {
            const target = transferTargetRoomByReg.get(String(d.registration));
            if (target) ids.push(String(target));
          }
          if (d.application) {
            const ar = appRoomByAppId.get(String(d.application));
            if (ar) ids.push(String(ar));
          }
          return ids.filter(Boolean);
        })
      ),
    ];
    const rooms = await Room.find({ _id: { $in: roomIds } }).lean();
    const roomMap = new Map(rooms.map((r) => [String(r._id), r]));
    const userIds = [...new Set(pendingDocs.map((d) => String(d.user)).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }).select("priorityType").lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    await Promise.all(
      pendingDocs.map(async (doc) => {
        let roomDoc = roomMap.get(String(doc.room));
        if (isTransferContractLike(doc) && doc.registration) {
          const targetId = transferTargetRoomByReg.get(String(doc.registration));
          if (targetId) {
            roomDoc = roomMap.get(String(targetId)) || roomDoc;
            if (String(doc.room) !== String(targetId)) {
              doc.room = targetId;
              doc.bed = null;
            }
          }
        }
        if (!roomDoc && doc.application) {
          const assigned = appRoomByAppId.get(String(doc.application));
          if (assigned) {
            roomDoc = roomMap.get(String(assigned)) || null;
            if (roomDoc && String(doc.room) !== String(assigned)) {
              doc.room = assigned;
              doc.bed = null;
            }
          }
        }
        const userDoc = userMap.get(String(doc.user));
        if (!roomDoc) return;
        applyPricingSnapshotToContract(doc, { roomDoc, userDoc }, { force: true });
        await doc.save();
      })
    );
    const refreshed = await Contract.find({ _id: { $in: pendingIds } }).lean();
    const byId = new Map(refreshed.map((r) => [String(r._id), r]));
    rows = rows.map((c) => {
      const fresh = byId.get(String(c._id));
      if (!fresh) return c;
      const merged = { ...c, ...fresh };
      if (hasPopulatedUser(c)) merged.user = c.user;
      return merged;
    });
  }

  const roomCtx = await loadRoomContextMapsForContracts(rows);

  const enriched = await Promise.all(
    rows.map(async (c) => {
      let roomLean = resolveRoomLeanForContractRow(c, roomCtx);
      let row = roomLean ? { ...c, room: roomLean } : { ...c };
      if (isTransferContractLike(row) && row.registration) {
        const withTransfer = await enrichContractTransferContextForAdmin(row);
        const target = withTransfer.transferRegistration?.targetRoom;
        if (target && typeof target === "object") {
          row = { ...withTransfer, room: target };
          roomLean = target;
        } else {
          row = withTransfer;
          if (!roomLean) roomLean = resolveRoomLeanForContractRow(withTransfer, roomCtx);
        }
      } else if (!roomLean) {
        roomLean = resolveRoomLeanForContractRow(row, roomCtx);
        if (roomLean) row = { ...row, room: roomLean };
      }
      return attachContractDisplayPricing(row, roomLean);
    })
  );
  return enriched;
}

/** Sinh viên: đồng bộ phòng HĐ chuyển + transferRegistration (lịch sử HĐ). */
async function enrichStudentContractsForList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const { alignAndRefreshContractListRows } = require("../services/contractResidenceSync");
  const synced = await alignAndRefreshContractListRows(rows);
  return Promise.all(
    synced.map(async (c) => {
      if (!isTransferContractLike(c)) {
        const roomLean = c.room && typeof c.room === "object" ? c.room : null;
        return attachContractDisplayPricing(c, roomLean);
      }
      let row = await enrichContractTransferContextForAdmin(c);
      const target = row.transferRegistration?.targetRoom;
      const roomLean =
        target && typeof target === "object"
          ? target
          : row.room && typeof row.room === "object"
            ? row.room
            : null;
      if (target && typeof target === "object") {
        row = { ...row, room: target };
      }
      return attachContractDisplayPricing(row, roomLean);
    })
  );
}

const CONTRACT_STATUSES = [
  "pending_payment",
  "upcoming",
  "active",
  "completed",
  "expired",
  "terminated",
  "transferred_settled",
  "terminated_due_to_transfer",
  "cancelled",
];
const HOLD_SLOT_STATUSES = new Set(["pending_payment", "upcoming", "active"]);
const ALLOWED_STATUS_TRANSITIONS = {
  pending_payment: ["terminated", "upcoming", "active", "cancelled"],
  upcoming: ["active", "terminated", "cancelled"],
  active: ["completed", "expired", "terminated", "terminated_due_to_transfer", "transferred_settled"],
  completed: ["terminated"],
  expired: ["terminated"],
  terminated: [],
  transferred_settled: [],
  terminated_due_to_transfer: [],
  cancelled: [],
};

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
  return (
    contract.status !== "active" &&
    contract.status !== "completed" &&
    contract.status !== "expired" &&
    contract.status !== "terminated"
  );
}

async function notifyAdminsStudentSigned({ studentName, contractNumber, contractId }) {
  const io = getIO();
  const admins = await User.find({ $or: [{ role: "admin" }, { role: "manager" }] }).select("_id");
  if (!admins.length) return;
  const title = "Sinh viên đã ký xác nhận hợp đồng";
  const message = `${studentName || "Sinh viên"} đã ký HĐ ${contractNumber || ""}. Vui lòng upload PDF và xác nhận thanh toán.`;
  const link = contractId ? `/admin/contracts?openContract=${contractId}` : "/admin/contracts";
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: "contract_pending_admin_confirm",
      link,
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message, link });
  }
}

async function syncRoomAfterContractChange(roomId) {
  if (roomId) await recountRoomOccupancyForRoom(roomId);
}

function statusHoldsSlot(status) {
  return HOLD_SLOT_STATUSES.has(String(status || ""));
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
                    floor: "$room.floor",
                    capacity: "$room.capacity",
                    currentOccupancy: "$room.currentOccupancy",
                    price: "$room.price",
                    currentPrice: "$room.currentPrice",
                    maxCapacity: "$room.maxCapacity",
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
                  signedPdfUrl: 1,
                  studentConfirmedAt: 1,
                  createdBy: 1,
                  paymentConfirmedAt: 1,
                  paymentConfirmedBy: 1,
                  monthlyRent: 1,
                  contractPrice: 1,
                  roomCurrentPriceSnapshot: 1,
                  roomCapacityAtSigning: 1,
                  baseSlotPriceBeforeDiscount: 1,
                  priorityDiscountPercent: 1,
                  financialLockedAt: 1,
                  depositAmount: 1,
                  isTransferContract: 1,
                  transferredFromContract: 1,
                  studentSignStatus: 1,
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
      let items = agg?.[0]?.items || [];
      const totalCount = agg?.[0]?.total?.[0]?.count || 0;
      const { alignAndRefreshContractListRows } = require("../services/contractResidenceSync");
      items = await alignAndRefreshContractListRows(items);
      items = await enrichContractsForAdminList(items);
      return res.json({ contracts: items, total: totalCount });
    }

    let contracts = await Contract.find(baseMatch)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth faculty major")
      .populate({
        path: "room",
        select: "roomNumber floor area capacity maxCapacity price currentPrice currentOccupancy status",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .sort({ createdAt: -1 });
    const total = await Contract.countDocuments(baseMatch);
    const { alignAndRefreshContractListRows } = require("../services/contractResidenceSync");
    let contractsSynced = await alignAndRefreshContractListRows(
      contracts.map((c) => (c.toObject ? c.toObject() : c))
    );
    contractsSynced = await enrichContractsForAdminList(contractsSynced);
    res.json({ contracts: contractsSynced, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyContracts = async (req, res) => {
  try {
    let contracts = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        select: "roomNumber floor area capacity price currentOccupancy status",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 });
    contracts = await enrichStudentContractsForList(
      contracts.map((c) => (c.toObject ? c.toObject() : c))
    );
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
      const held = await Contract.countDocuments({
        room: roomDoc._id,
        status: { $in: ["active", "pending_payment"] },
      });
      if (held >= roomDoc.capacity) {
        return res.status(400).json({ message: "Phòng đã đầy" });
      }
    }
    let registrationRef = null;
    if (regId) {
      if (!mongoose.isValidObjectId(regId)) return res.status(400).json({ message: "registration không hợp lệ" });
      registrationRef = regId;
    }
    const cnRaw = req.body.contractNumber;
    const contractNumber =
      cnRaw !== undefined && cnRaw !== null && String(cnRaw).trim() !== "" ? String(cnRaw).trim() : `HD-${Date.now()}`;
    const pricing = buildContractPricingFields({ roomDoc, userDoc: u });
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
      ...pricing,
    });
    if (statusHoldsSlot(st)) {
      await syncRoomAfterContractChange(room);
    }
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        select: "roomNumber floor area capacity price currentOccupancy status",
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
    assertNoManualPricingInBody(req.body);
    if (isContractPricingFrozen(contract)) {
      const pricingKeys = [
        "contractPrice",
        "monthlyRent",
        "depositAmount",
        "roomCurrentPriceSnapshot",
        "roomCapacityAtSigning",
        "priorityDiscountPercent",
        "baseSlotPriceBeforeDiscount",
      ];
      for (const key of pricingKeys) {
        if (req.body[key] !== undefined) {
          return res.status(400).json({
            message: "Hợp đồng đã khóa giá — không được sửa tiền phòng/slot/sức chứa trên bản ghi HĐ",
          });
        }
      }
    }

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

    let roomNeedSync = false;
    const roomId = contract.room;

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
        const oldHolds = statusHoldsSlot(contract.status);
        const nextHolds = statusHoldsSlot(newStatus);
        if (oldHolds && !nextHolds) {
          await releaseBedForContractId(contract._id, req.user?._id, "Hợp đồng đổi trạng thái — không còn giữ slot");
          contract.bed = null;
          roomNeedSync = true;
        } else if (!oldHolds && nextHolds) {
          const roomDoc = await Room.findById(contract.room);
          if (!roomDoc) return res.status(400).json({ message: "Phòng không tồn tại" });
          const preview = await Contract.countDocuments({
            room: roomDoc._id,
            status: { $in: ["active", "pending_payment"] },
            _id: { $ne: contract._id },
          });
          if (preview >= roomDoc.capacity) {
            return res.status(400).json({ message: "Phòng đã đầy, không thể đặt trạng thái này" });
          }
          roomNeedSync = true;
        }
        contract.status = newStatus;
      }
    }
    if (startDate !== undefined) contract.startDate = parseDateValue(startDate);
    if (endDate !== undefined) contract.endDate = parseDateValue(endDate);
    if (terms !== undefined) contract.terms = String(terms);
    await contract.save();
    if (roomNeedSync) await syncRoomAfterContractChange(roomId);
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId gender citizenId dateOfBirth")
      .populate({
        path: "room",
        select: "roomNumber floor area capacity price currentOccupancy status",
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
        select: ROOM_SELECT_FOR_PRICING,
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      });
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const {
      alignContractRoomWithOccupiedBed,
      resolveContractRoomDocument,
    } = require("../services/contractResidenceSync");
    await alignContractRoomWithOccupiedBed(contract);
    await resolveContractRoomDocument(contract);
    const {
      isPendingContractAwaitingSign,
      applyPricingSnapshotToContract,
    } = require("../services/contractPricing");
    if (isPendingContractAwaitingSign(contract)) {
      const [roomDoc, userDoc] = await Promise.all([
        Room.findById(contract.room),
        User.findById(contract.user).select("priorityType"),
      ]);
      if (roomDoc) {
        applyPricingSnapshotToContract(contract, { roomDoc, userDoc }, { force: true });
        await contract.save();
      }
    }
    await contract.populate({
      path: "room",
      select: ROOM_SELECT_FOR_PRICING,
      populate: [
        { path: "area", select: "name" },
        { path: "roomLeader", select: "_id fullName" },
      ],
    });
    const ownerId = String(contract.user?._id || contract.user || "");
    const isStudent = req.user.role === "user" || req.user.role === "student";
    if (isStudent && ownerId !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền xem" });
    }
    const lean = contract.toObject ? contract.toObject() : contract;
    let roomLean = lean.room && typeof lean.room === "object" ? lean.room : null;
    let payload = attachContractDisplayPricing(lean, roomLean);
    if (isTransferContractLike(payload)) {
      payload = await enrichContractTransferContextForAdmin(payload);
      const target = payload.transferRegistration?.targetRoom;
      if (target && typeof target === "object") {
        payload = { ...payload, room: target };
        roomLean = target;
        payload = attachContractDisplayPricing(payload, roomLean);
      }
    }
    res.json(payload);
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
        select: "roomNumber floor area capacity price currentOccupancy status",
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
      await releaseBedForContractId(contract._id, req.user?._id, "Hợp đồng chấm dứt");
    }
    const reason = String(req.body?.reason || "").trim();
    if (reason) contract.cancelReason = reason;
    contract.status = "terminated";
    contract.bed = null;
    await contract.save();
    await syncRoomAfterContractChange(contract.room);
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin/Manager: xóa hợp đồng — đồng bộ lại số đang ở của phòng/khu. */
exports.remove = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const contract = await Contract.findById(id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const roomId = contract.room;
    if (statusHoldsSlot(contract.status)) {
      await releaseBedForContractId(contract._id, req.user?._id, "Xóa hợp đồng");
    }
    await Contract.findByIdAndDelete(contract._id);
    await syncRoomAfterContractChange(roomId);
    res.json({ message: "Đã xóa hợp đồng và cập nhật số đang ở phòng" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.studentSign = async (req, res) => {
  try {
    const consentAccepted = req.body?.consentAccepted === true || req.body?.consentAccepted === "true";
    if (!consentAccepted) {
      return res.status(400).json({
        message: "Bạn phải xác nhận đã đọc và cam kết tuân thủ điều khoản hợp đồng và nội quy KTX",
      });
    }
    const contract = await Contract.findById(req.params.id).populate("registration");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền ký hợp đồng này" });
    }
    const isTransferLike =
      contract.isTransferContract || String(contract.contractNumber || "").startsWith("HD-CP");
    const legacyTransferNeedsSign = isTransferLike && !contract.consentAcceptedAt;
    if (!["pending_payment", "upcoming"].includes(contract.status)) {
      if (!legacyTransferNeedsSign) {
        return res.status(400).json({ message: "Hợp đồng không ở trạng thái cho phép ký" });
      }
    }
    if (contract.isRenewalContract && contract.renewalConsentAt) {
      return res.status(400).json({ message: "Hợp đồng gia hạn đã được xác nhận — chờ đến ngày có hiệu lực" });
    }
    if (contract.signedAt && !legacyTransferNeedsSign) {
      return res.status(400).json({ message: "Hợp đồng đã được ký" });
    }
    const {
      alignTransferContractRoomFromRegistration,
      resolveContractRoomDocument,
    } = require("../services/contractResidenceSync");
    if (isTransferLike) {
      await alignTransferContractRoomFromRegistration(contract);
    }
    const { roomDoc } = await resolveContractRoomDocument(contract);
    const userDoc = await User.findById(contract.user).select("priorityType");
    if (!roomDoc) {
      return res.status(400).json({
        message:
          "Không tìm thấy phòng của hợp đồng. Liên hệ BQL để gán lại phòng trên đơn đăng ký / chuyển phòng.",
      });
    }
    const now = new Date();
    if (isTransferLike) {
      lockTransferContractPricingOnSign(contract, { roomDoc, userDoc, lockedAt: now });
    } else if (String(contract.status) === "pending_payment") {
      applyPricingSnapshotToContract(contract, { roomDoc, userDoc }, { force: true });
      contract.financialLockedAt = now;
    } else {
      contract.financialLockedAt = contract.financialLockedAt || now;
    }
    contract.signedAt = now;
    contract.studentSignStatus = "student_signed";
    contract.studentConfirmedAt = now;
    contract.studentConfirmedBy = req.user._id;
    contract.studentSignIp = getClientIp(req);
    contract.studentSignUserAgent = String(req.headers["user-agent"] || "").slice(0, 500);
    contract.consentAcceptedAt = now;
    await contract.save();

    if (!isTransferLike) {
      try {
        await tryAutoAssignBed(contract._id, req.user._id);
      } catch {
        // best-effort — admin có thể gán lại từ HĐ / phòng
      }
    }
    await syncRoomAfterContractChange(roomDoc._id);

    await notifyAdminsStudentSigned({
      studentName: req.user.fullName,
      contractNumber: contract.contractNumber,
      contractId: String(contract._id),
    });

    const io = getIO();
    if (isTransferLike) {
      contract.isTransferContract = true;
      await contract.save();
      if (contract.registration) {
        const { emitTransferRegistrationChanged } = require("../services/roomTransferService");
        emitTransferRegistrationChanged({
          userId: req.user._id,
          registrationId: contract.registration._id || contract.registration,
          action: "student_signed",
        });
      }
      io.emit("registration:transfer-changed", {
        userId: req.user._id.toString(),
        action: "student_signed",
      });
      io.emit("contract:student-signed", {
        userId: req.user._id.toString(),
        contractId: String(contract._id),
        message: "Bạn đã ký hợp đồng chuyển phòng. Chờ admin xác nhận.",
      });
      await Notification.create({
        user: req.user._id,
        title: "Đã ký hợp đồng chuyển phòng",
        message: `Bạn đã ký ${contract.contractNumber}. Vui lòng chờ admin xác nhận để hợp đồng có hiệu lực và hoàn tất chuyển phòng.`,
        type: "contract_signed",
        link: "/student/my-contracts",
      });
    } else {
      io.emit("contract:student-signed", {
        userId: req.user._id.toString(),
        contractId: String(contract._id),
        message: "Bạn đã ký xác nhận hợp đồng. Chờ admin xác nhận để hợp đồng có hiệu lực.",
      });
      await Notification.create({
        user: req.user._id,
        title: "Đã gửi xác nhận thanh toán",
        message: "Bạn đã ký xác nhận hợp đồng. Vui lòng chờ admin xác nhận.",
        type: "contract_signed",
        link: "/student/my-contracts",
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
    if (!["pending_payment", "upcoming"].includes(contract.status)) {
      return res.status(400).json({ message: "Chỉ được upload file PDF khi hợp đồng chưa hiệu lực" });
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
    if (!["pending_payment", "upcoming"].includes(contract.status)) {
      return res.status(400).json({ message: "Hợp đồng không ở trạng thái chờ xác nhận thanh toán" });
    }
    if (contract.isRenewalContract) {
      if (!contract.renewalConsentAt) {
        return res.status(400).json({ message: "Sinh viên chưa xác nhận gia hạn hợp đồng" });
      }
    } else if (contract.isTransferContract) {
      if (!contract.signedAt) {
        return res.status(400).json({ message: "Sinh viên chưa ký hợp đồng chuyển phòng" });
      }
    } else {
      if (!contract.signedAt) {
        return res.status(400).json({ message: "Sinh viên chưa ký hợp đồng" });
      }
      if (!contract.signedPdfUrl) {
        return res.status(400).json({ message: "Chưa có file PDF hợp đồng đã ký. Vui lòng upload trước khi xác nhận." });
      }
    }
    const { resolveContractRoomDocument } = require("../services/contractResidenceSync");
    const { roomDoc } = await resolveContractRoomDocument(contract);
    const userDoc = await User.findById(contract.user).select("priorityType");
    if (!roomDoc) {
      return res.status(400).json({
        message: "Không tìm thấy phòng của hợp đồng — kiểm tra đơn đăng ký / chuyển phòng trước khi xác nhận.",
      });
    }
    if (
      roomDoc &&
      String(contract.status) === "pending_payment" &&
      !isContractPricingFrozen(contract) &&
      !hasPricingSnapshot(contract)
    ) {
      applyPricingSnapshotToContract(contract, { roomDoc, userDoc });
    }
    if (!contract.financialLockedAt) {
      contract.financialLockedAt = contract.signedAt || contract.renewalConsentAt || new Date();
    }
    const now = new Date();
    contract.paymentConfirmedAt = now;
    contract.paymentConfirmedBy = req.user._id;
    contract.adminReviewedAt = now;
    contract.adminReviewedBy = req.user._id;

    if (contract.isRenewalContract && contract.status === "upcoming") {
      const start = new Date(contract.startDate);
      start.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      await contract.save();
      if (start.getTime() <= today.getTime()) {
        await processRenewalHandovers(now);
        const refreshed = await Contract.findById(contract._id);
        return res.json(refreshed || contract);
      }
      await Notification.create({
        user: contract.user,
        title: "Đã xác nhận thanh toán gia hạn",
        message: `Hợp đồng ${contract.contractNumber} sẽ có hiệu lực từ ${start.toLocaleDateString("vi-VN")}. HĐ hiện tại vẫn đang active.`,
        type: "contract_renewal",
        link: "/student/my-contracts",
      });
      return res.json(contract);
    }

    if (contract.isTransferContract && contract.registration) {
      const Registration = require("../models/Registration");
      const { completeRoomTransferSettlement } = require("../services/roomTransferService");
      const reg = await Registration.findById(contract.registration);
      if (reg && reg.transferPhase !== "completed") {
        await completeRoomTransferSettlement(reg, contract, { performedBy: req.user._id });
      }
    }

    contract.status = "active";
    await contract.save();

    try {
      await tryAutoAssignBed(contract._id, req.user?._id);
    } catch {
      // best-effort
    }
    await syncRoomAfterContractChange(contract.room);

    const io = getIO();
    const transferDone = contract.isTransferContract;
    io.emit("registration:approved", {
      userId: contract.user.toString(),
      message: transferDone ? "Chuyển phòng đã hoàn tất" : "Bạn là thành viên của KTX",
    });
    await Notification.create({
      user: contract.user,
      title: transferDone ? "Chuyển phòng hoàn tất" : "Bạn là thành viên của KTX",
      message: transferDone
        ? `Admin đã xác nhận hợp đồng ${contract.contractNumber}. Hợp đồng cũ đã thanh lý; bạn đã chuyển sang phòng mới.`
        : "Thanh toán đã được xác nhận. Hợp đồng của bạn đã có hiệu lực, bạn là thành viên của KTX.",
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

    const contractDoc = await Contract.findById(id);
    if (!contractDoc) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const { resolveContractLivingRoomId } = require("../services/violationResidentsService");
    const livingRoomId = await resolveContractLivingRoomId(contractDoc);
    if (livingRoomId && String(contractDoc.room) !== String(livingRoomId)) {
      contractDoc.room = livingRoomId;
      contractDoc.bed = null;
      await contractDoc.save();
    }

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
    await runContractLifecycleJobs();
    const student = await User.findById(req.user._id)
      .select("fullName email phone studentId gender citizenId dateOfBirth avatar")
      .lean();
    const contracts = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        select: "roomNumber floor area capacity price currentOccupancy status",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();
    const { resolveContractRoomDocument } = require("../services/contractResidenceSync");
    for (const c of contracts) {
      const roomMissing =
        !c.room || (typeof c.room === "object" && c.room !== null && !c.room.roomNumber);
      if (roomMissing) {
        await resolveContractRoomDocument(c._id);
      }
      if (c.status === "pending_payment" && (c.contractPrice == null || c.roomCapacityAtSigning == null)) {
        await ensureContractPricingSnapshot(c._id);
      }
    }
    const contractsRefreshed = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        select: "roomNumber floor area capacity price currentPrice maxCapacity currentOccupancy status",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();
    let contractsWithDisplay = await enrichStudentContractsForList(contractsRefreshed);
    const { attachPopulatedRoomToContractLean } = require("../services/roomResidentsListService");
    contractsWithDisplay = await Promise.all(
      contractsWithDisplay.map((row) => attachPopulatedRoomToContractLean(row))
    );
    const { findResidenceContract, isWithinStayPeriod } = require("../services/ktxMembership");
    const residenceLean = await findResidenceContract(req.user._id, { syncLifecycle: false });
    let activeContract = residenceLean
      ? contractsWithDisplay.find((c) => String(c._id) === String(residenceLean._id)) ||
        contractsWithDisplay.find((c) => c.status === "active" && isWithinStayPeriod(c)) ||
        null
      : contractsWithDisplay.find((c) => c.status === "active" && isWithinStayPeriod(c)) || null;
    if (activeContract) {
      activeContract = await attachPopulatedRoomToContractLean(activeContract);
      const roomId = activeContract.room?._id || activeContract.room;
      if (roomId) {
        const { syncRoomsOccupancyFromContracts } = require("../services/roomOccupancySync");
        await syncRoomsOccupancyFromContracts([roomId]);
      }
    }
    const extendRequests = await ContractExtendRequest.find({ user: req.user._id })
      .populate("contract", "contractNumber status endDate startDate")
      .sort({ createdAt: -1 })
      .lean();
    const extensionPolicy = await getExtensionPolicy();
    const extensionContext = await buildStudentExtensionContext(req.user._id, activeContract);
    let pendingRenewalContract = extensionContext.pendingRenewalContract;
    if (pendingRenewalContract?._id) {
      const pendingDoc = await Contract.findById(pendingRenewalContract._id)
        .populate({
          path: "room",
          select: "roomNumber floor area capacity currentPrice price currentOccupancy",
          populate: { path: "area", select: "name" },
        })
        .lean();
      pendingRenewalContract = attachContractDisplayPricing(
        pendingDoc,
        pendingDoc?.room && typeof pendingDoc.room === "object" ? pendingDoc.room : null
      );
    }
    res.json({
      student,
      contracts: contractsWithDisplay,
      activeContract,
      extendRequests,
      extensionEnabled: extensionContext.extensionEnabled,
      extensionPeriod: extensionContext.extensionPeriod,
      canRequestExtension: extensionContext.canRenewContract,
      canRenewContract: extensionContext.canRenewContract,
      extensionBlockReason: extensionContext.renewalBlockReason || extensionContext.extensionBlockReason,
      renewalBlockReason: extensionContext.renewalBlockReason,
      renewalWindowDays: extensionContext.renewalWindowDays,
      renewalMode: extensionContext.renewalMode,
      batchExtensionMonths: extensionContext.batchExtensionMonths,
      pendingRenewalContract,
      hasPendingExtendRequest: extensionContext.hasPendingExtendRequest,
      daysUntilContractEnd: extensionContext.daysUntilContractEnd,
      eligibilityDays: extensionContext.renewalWindowDays ?? 30,
      extensionPolicy,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /contracts/:id/renewal-preview — xem trước HĐ gia hạn (giá phòng hiện tại) */
exports.getRenewalPreview = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const monthsRaw = req.query.months;
    const months =
      monthsRaw != null && monthsRaw !== ""
        ? parseInt(String(monthsRaw), 10)
        : undefined;
    if (months != null && (!Number.isFinite(months) || months < 1 || months > 36)) {
      return res.status(400).json({ message: "Số tháng gia hạn phải từ 1 đến 36" });
    }
    const contract = await Contract.findById(id).lean();
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (String(contract.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền" });
    }
    const preview = await buildRenewalPreview(contract, months);
    res.json(preview);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
};

/** POST /contracts/:id/confirm-renewal — SV xác nhận gia hạn, tạo HĐ mới */
exports.confirmRenewal = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const monthsRaw = req.body?.months;
    const months =
      monthsRaw != null && monthsRaw !== ""
        ? parseInt(String(monthsRaw), 10)
        : undefined;
    const result = await confirmStudentRenewal({
      sourceContractId: id,
      userId: req.user._id,
      userFullName: req.user.fullName,
      months,
      consentAccepted: req.body?.consentAccepted,
      req,
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ message: e.message });
  }
};

/** Sinh viên: POST /contracts/:id/request-extend (legacy — khuyến nghị dùng confirm-renewal) */
exports.requestExtend = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const months = parseInt(req.body?.months, 10);
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      return res.status(400).json({ message: "Số tháng gia hạn phải từ 1 đến 36" });
    }
    const populated = await createStudentExtendRequest({
      contractId: id,
      userId: req.user._id,
      userFullName: req.user.fullName,
      months,
    });
    res.status(201).json(populated);
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(400).json({ message: "Đã có yêu cầu gia hạn đang chờ duyệt" });
    }
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
};

/** Admin / Manager: danh sách yêu cầu gia hạn */
exports.listExtendRequests = async (req, res) => {
  try {
    const st = String(req.query.status || "pending");
    const search = String(req.query.search || "").trim();
    const rows = await listExtendRequestsService({ status: st, search });
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.approveExtendRequest = async (req, res) => {
  try {
    const rid = String(req.params.requestId || "").trim();
    if (!mongoose.isValidObjectId(rid)) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" });
    }
    const result = await approveExtendRequestService({ requestId: rid, reviewerId: req.user._id });
    res.json(result);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
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
    const out = await rejectExtendRequestService({ requestId: rid, reviewerId: req.user._id, note });
    res.json(out);
  } catch (e) {
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
};
