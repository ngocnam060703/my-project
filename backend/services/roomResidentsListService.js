/**
 * Danh sách SV đang ở / giữ chỗ theo phòng thực tế (giường + HĐ), dùng chung admin Phòng / Khu / Vi phạm.
 */
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
const {
  contractIsEffectiveResident,
} = require("./roomOccupancySync");

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function deriveResidencyFromContract(c) {
  if (String(c?.status || "") === "pending_payment") {
    if (!c.signedAt && !c.consentAcceptedAt) return "contract_pending_sign";
    if (!c.bed) return "signed_awaiting_admin";
    const bed = c.bed && typeof c.bed === "object" ? c.bed : null;
    if (!bed || String(bed.status) !== "occupied") return "signed_awaiting_admin";
    if (!bed.checkInAt && bed.assignedAt) return "assigned_pending_checkin";
    if (bed.checkInAt) return "checked_in_staying";
    return "assigned_pending_checkin";
  }
  const bed = c.bed && typeof c.bed === "object" ? c.bed : null;
  if (!bed || String(bed.status) !== "occupied") return "no_bed_assigned";
  if (!bed.checkInAt && bed.assignedAt) return "assigned_pending_checkin";
  if (bed.checkInAt) return "checked_in_staying";
  return "assigned_pending_checkin";
}

/**
 * HĐ active còn hạn liên quan phòng: contract.room, đơn KTX approved (assignedRoom), hoặc application trên HĐ.
 */
async function collectActiveContractsLinkedToRooms(roomIds, today) {
  const objectIds = roomIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const byId = new Map();

  const push = (rows) => {
    for (const c of rows || []) {
      if (c?._id) byId.set(String(c._id), c);
    }
  };

  push(
    await Contract.find({
      room: { $in: objectIds },
      status: "active",
      endDate: { $gte: today },
    })
      .select("_id")
      .lean()
  );

  const approvedApps = await Application.find({
    assignedRoom: { $in: objectIds },
    status: "approved",
  })
    .select("_id user assignedRoom")
    .lean();

  if (approvedApps.length) {
    const appIds = approvedApps.map((a) => a._id);
    const userIds = [...new Set(approvedApps.map((a) => a.user).filter(Boolean).map(String))];

    push(
      await Contract.find({
        application: { $in: appIds },
        status: "active",
        endDate: { $gte: today },
      })
        .select("_id")
        .lean()
    );

    if (userIds.length) {
      push(
        await Contract.find({
          user: { $in: userIds },
          status: "active",
          endDate: { $gte: today },
        })
          .select("_id")
          .lean()
      );
    }
  }

  return [...byId.keys()];
}

/** Đồng bộ contract.room từ đơn / chuyển phòng / giường trước khi lọc theo phòng trên HĐ. */
async function syncActiveContractRoomsForRoomIds(roomIds) {
  const today = startOfDay();
  const contractIds = await collectActiveContractsLinkedToRooms(roomIds, today);
  if (!contractIds.length) return;

  const { resolveContractRoomDocument, alignContractRoomWithOccupiedBed } = require("./contractResidenceSync");
  const roomKeySet = new Set(roomIds.map(String));

  await Promise.all(
    contractIds.map(async (id) => {
      const { contract, roomDoc } = await resolveContractRoomDocument(id);
      if (!contract) return;
      const rid = String(roomDoc?._id || contract.room || "");
      if (rid && roomKeySet.has(rid)) return;
      await alignContractRoomWithOccupiedBed(id);
    })
  );
}

/**
 * SV đang ở: HĐ active + còn hiệu lực + phòng ghi trên HĐ (contract.room) thuộc danh sách phòng.
 */
async function listActiveEffectiveResidentsByContractRoom(roomIds, opts = {}) {
  const ids = [
    ...new Set(
      (roomIds || [])
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map((id) => String(id))
    ),
  ];
  if (!ids.length) return [];

  const rooms = await Room.find({ _id: { $in: ids } })
    .select("roomNumber floor area roomLeader")
    .populate("area", "name")
    .lean();
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));

  const now = new Date();
  const today = startOfDay(now);
  const userSelect =
    opts.userSelect || "fullName studentId email phone gender major enrollmentDate faculty";

  await syncActiveContractRoomsForRoomIds(ids);

  const contractIds = await collectActiveContractsLinkedToRooms(ids, today);
  if (!contractIds.length) return [];

  const contracts = await Contract.find({ _id: { $in: contractIds } })
    .populate("user", userSelect)
    .populate({ path: "bed", select: "code status assignedAt checkInAt equipmentStatus" })
    .sort({ createdAt: 1 })
    .lean();

  const residents = [];
  const seen = new Set();

  for (const c of contracts) {
    if (!c.user || !contractIsEffectiveResident(c, now)) continue;

    const roomKey = String(c.room?._id || c.room || "");
    const room = roomById.get(roomKey);
    if (!room) continue;

    const uid = String(c.user._id || c.user);
    if (seen.has(uid)) continue;
    seen.add(uid);

    const roomLeaderId = String(opts.roomLeaderId || room.roomLeader || "");
    const bed = c.bed && typeof c.bed === "object" ? c.bed : null;

    residents.push({
      contractId: c._id,
      status: c.status,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      user: c.user,
      isRoomLeader: roomLeaderId && roomLeaderId === uid,
      bed: bed || null,
      bedCode: bed?.code || "",
      assignedAt: bed?.assignedAt || null,
      checkInAt: bed?.checkInAt || null,
      room: {
        _id: room._id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        area: room.area,
      },
      residencyOperationalStatus: deriveResidencyFromContract({ ...c, bed }),
    });
  }

  return residents;
}

/** @param {string} roomId */
async function listContractResidentsForRoom(roomId, opts = {}) {
  if (!mongoose.isValidObjectId(String(roomId || ""))) return [];
  const room = await Room.findById(roomId).select("roomLeader").lean();
  return listActiveEffectiveResidentsByContractRoom([roomId], {
    ...opts,
    roomLeaderId: opts.roomLeaderId || room?.roomLeader,
  });
}

/** Gộp SV tất cả phòng trong khu — HĐ active, contract.room thuộc phòng trong khu. */
async function listContractResidentsForZone(areaId) {
  if (!mongoose.isValidObjectId(String(areaId || ""))) return [];

  const rooms = await Room.find({ area: areaId })
    .select("_id roomNumber floor roomLeader")
    .sort({ floor: 1, roomNumber: 1 })
    .lean();

  const roomIds = rooms.map((r) => r._id);
  const leaderByRoom = new Map(rooms.map((r) => [String(r._id), r.roomLeader]));

  const raw = await listActiveEffectiveResidentsByContractRoom(roomIds, {
    userSelect: "fullName studentId email phone gender major enrollmentDate",
  });

  const residents = [];
  const seen = new Set();
  for (const r of raw) {
    const uid = String(r.user?._id || "");
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const rk = String(r.room?._id || "");
    residents.push({
      ...r,
      isRoomLeader:
        String(leaderByRoom.get(rk) || "") === uid || Boolean(r.isRoomLeader),
    });
  }

  residents.sort((a, b) => {
    const ar = String(a.room?.roomNumber || "");
    const br = String(b.room?.roomNumber || "");
    if (ar < br) return -1;
    if (ar > br) return 1;
    return String(a.user?.fullName || "").localeCompare(String(b.user?.fullName || ""), "vi");
  });

  return residents;
}

const ROOM_SELECT =
  "roomNumber floor area capacity maxCapacity price currentPrice currentOccupancy status";

/** Gắn phòng populate cho HĐ (SV/admin) khi contract.room lệch hoặc null. */
async function attachPopulatedRoomToContractLean(c) {
  if (!c || !c._id) return c;
  if (c.room && typeof c.room === "object" && c.room.roomNumber) return c;

  const { resolveContractLivingRoomId } = require("./violationResidentsService");
  const { resolveContractRoomDocument } = require("./contractResidenceSync");

  let roomId = await resolveContractLivingRoomId(c);
  if (!roomId) {
    const { contract: doc } = await resolveContractRoomDocument(c._id);
    if (doc?.room) roomId = String(doc.room._id || doc.room);
  }
  if (!roomId) return c;

  const roomLean = await Room.findById(roomId)
    .select(ROOM_SELECT)
    .populate("area", "name")
    .lean();
  return roomLean ? { ...c, room: roomLean } : c;
}

module.exports = {
  listActiveEffectiveResidentsByContractRoom,
  listContractResidentsForRoom,
  listContractResidentsForZone,
  deriveResidencyFromContract,
  attachPopulatedRoomToContractLean,
  syncActiveContractRoomsForRoomIds,
  collectActiveContractsLinkedToRooms,
};
