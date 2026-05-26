const mongoose = require("mongoose");
const Room = require("../models/Room");
const Area = require("../models/Area");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
const Bed = require("../models/Bed");
const { normalizeGender } = require("../utils/assignRoom");
const { areaAllowsStudentGender, studentMayJoinRoom } = require("../utils/genderPolicy");
const { contractHoldsRoomSlot, syncRoomsOccupancyFromContracts, countEffectiveResidentsByRoom } = require("./roomOccupancySync");

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pushOccupantGender(map, roomId, genderRaw) {
  const g = normalizeGender(genderRaw) || (genderRaw === "male" || genderRaw === "female" ? genderRaw : null);
  if (!g) return;
  const rid = String(roomId || "");
  if (!rid) return;
  if (!map.has(rid)) map.set(rid, []);
  map.get(rid).push(g);
}

/** Khu (Area) — SV được ở khu theo genderPolicy. */
function areaAllowsGender(areaDoc, userGenderNorm) {
  return areaAllowsStudentGender(areaDoc?.genderPolicy || "mixed", userGenderNorm);
}

/** Số slot đang giữ theo HĐ + đơn approved (theo user, tránh đếm trùng). */
async function countRoomSlotHoldersByRoom(roomIds, session = null) {
  const map = new Map();
  const ids = [...new Set((roomIds || []).filter(Boolean).map(String))];
  for (const id of ids) map.set(id, new Set());
  if (!ids.length) return map;

  const today = toStartOfDay(new Date());
  const contracts = await withSession(
    Contract.find({
      room: { $in: ids },
      status: { $in: ["active", "pending_payment"] },
      endDate: { $gte: today },
    }).select("room user endDate status"),
    session
  ).lean();

  for (const c of contracts) {
    if (!contractHoldsRoomSlot(c)) continue;
    const rid = String(c.room || "");
    if (!rid || !map.has(rid)) continue;
    map.get(rid).add(`u:${String(c.user)}`);
  }

  const approvedApps = await withSession(
    Application.find({
      assignedRoom: { $in: ids },
      status: "approved",
    }).select("assignedRoom user"),
    session
  ).lean();

  for (const a of approvedApps) {
    const rid = String(a.assignedRoom || "");
    if (!rid || !map.has(rid)) continue;
    map.get(rid).add(`u:${String(a.user)}`);
  }

  const counts = new Map();
  for (const [rid, set] of map) counts.set(rid, set.size);
  return counts;
}

function roomHasVacancy(roomDoc, heldSlots) {
  const cap = Number(roomDoc.capacity) || 0;
  if (cap <= 0) return true;
  return heldSlots < cap;
}

/**
 * Giới tính người đang giữ slot phòng: HĐ, đơn đã duyệt, giường occupied/reserved.
 */
async function loadOccupantGendersByRoom(roomIds, session = null) {
  const map = new Map();
  const ids = [...new Set((roomIds || []).filter(Boolean).map(String))];
  if (!ids.length) return map;

  const today = toStartOfDay(new Date());
  const contracts = await withSession(
    Contract.find({
      room: { $in: ids },
      status: { $in: ["active", "pending_payment"] },
      endDate: { $gte: today },
    }).populate("user", "gender"),
    session
  ).lean();

  for (const c of contracts) {
    if (!contractHoldsRoomSlot(c)) continue;
    pushOccupantGender(map, c.room, c.user?.gender);
  }

  const approvedApps = await withSession(
    Application.find({
      assignedRoom: { $in: ids },
      status: "approved",
    }).select("assignedRoom genderSnapshot"),
    session
  ).lean();

  for (const a of approvedApps) {
    pushOccupantGender(map, a.assignedRoom, a.genderSnapshot);
  }

  const beds = await withSession(
    Bed.find({
      room: { $in: ids },
      status: { $in: ["occupied", "reserved"] },
    }).populate("currentUser", "gender"),
    session
  ).lean();

  for (const b of beds) {
    if (b.currentUser && typeof b.currentUser === "object") {
      pushOccupantGender(map, b.room, b.currentUser.gender);
    }
  }

  return map;
}

function roomFitsStudentGender(areaDoc, userGenderNorm, occupantGenders) {
  if (!areaDoc) return false;
  return studentMayJoinRoom(areaDoc.genderPolicy || "mixed", userGenderNorm, occupantGenders);
}

/**
 * Tỷ lệ lấp đầy [0..1) — phòng "gần đầy" có ratio cao hơn (ưu tiên gom người, tối ưu giường trống rải rác).
 */
function occupancyRatio(roomDoc, heldSlots) {
  const cap = Number(roomDoc.capacity) || 0;
  if (cap <= 0) return 0;
  const occ =
    heldSlots != null
      ? Number(heldSlots)
      : Number(roomDoc.currentOccupancy || 0);
  return Math.min(1, occ / cap);
}

function roomSortKey(roomDoc, preferenceAreaId, heldSlots) {
  const pref = preferenceAreaId ? String(preferenceAreaId) : "";
  const areaId = String(roomDoc.area?._id || roomDoc.area || "");
  const inPreferredZone = pref && areaId === pref ? 1 : 0;
  const ratio = occupancyRatio(roomDoc, heldSlots);
  const numberKey = String(roomDoc.roomNumber || "");
  return { inPreferredZone, ratio, numberKey };
}

function compareRooms(a, b, preferenceAreaId, slotHolders) {
  const heldA = slotHolders?.get(String(a._id)) ?? Number(a.currentOccupancy || 0);
  const heldB = slotHolders?.get(String(b._id)) ?? Number(b.currentOccupancy || 0);
  const ka = roomSortKey(a, preferenceAreaId, heldA);
  const kb = roomSortKey(b, preferenceAreaId, heldB);
  if (ka.inPreferredZone !== kb.inPreferredZone) return kb.inPreferredZone - ka.inPreferredZone;
  if (ka.ratio !== kb.ratio) return kb.ratio - ka.ratio;
  if (ka.numberKey < kb.numberKey) return -1;
  if (ka.numberKey > kb.numberKey) return 1;
  return 0;
}

/**
 * Lấy danh sách phòng ứng viên: đúng khu + đúng giới trong phòng (khu mixed), còn chỗ, không bảo trì.
 */
async function findCandidateRooms({ genderNorm, preferenceAreaId }, session = null) {
  const areas = await withSession(
    Area.find({ isDeleted: { $ne: true }, isActive: { $ne: false } }),
    session
  ).lean();
  const allowedAreaIds = areas.filter((a) => areaAllowsGender(a, genderNorm)).map((a) => a._id);
  if (!allowedAreaIds.length) return [];

  const rooms = await withSession(
    Room.find({
      area: { $in: allowedAreaIds },
      status: { $ne: "maintenance" },
    }).populate("area", "name genderPolicy isActive isDeleted"),
    session
  ).lean();

  const roomIds = rooms.map((r) => r._id);
  const slotHolders = roomIds.length ? await countEffectiveResidentsByRoom(roomIds) : new Map();
  const [occupantByRoom] = await Promise.all([
    loadOccupantGendersByRoom(roomIds, session),
  ]);

  return rooms
    .filter((r) => {
      const ar = r.area;
      if (!ar || ar.isDeleted) return false;
      if (ar.isActive === false) return false;
      if (!areaAllowsGender(ar, genderNorm)) return false;
      const held = slotHolders.get(String(r._id)) || 0;
      if (!roomHasVacancy(r, held)) return false;
      const occ = occupantByRoom.get(String(r._id)) || [];
      return roomFitsStudentGender(ar, genderNorm, occ);
    })
    .map((r) => {
      const held = slotHolders.get(String(r._id)) || 0;
      return { ...r, currentOccupancy: held };
    });
}

async function pickBestRoomForApplication(applicationLike, session = null) {
  const genderNorm = normalizeGender(applicationLike.genderSnapshot) || applicationLike.genderSnapshot;
  const pref = applicationLike.preferenceArea || null;
  const candidates = await findCandidateRooms({ genderNorm, preferenceAreaId: pref }, session);
  if (!candidates.length) return null;
  const slotHolders = await countRoomSlotHoldersByRoom(candidates.map((c) => c._id), session);
  candidates.sort((a, b) => compareRooms(a, b, pref, slotHolders));
  return candidates[0];
}

/** Cập nhật currentOccupancy phòng theo HĐ active đang hiệu lực (không đếm pending_payment / đơn chờ). */
async function refreshRoomOccupancyFromSlots(roomId, session = null) {
  const room = await withSession(Room.findById(roomId), session).lean();
  if (!room || room.status === "maintenance") return null;

  await syncRoomsOccupancyFromContracts([roomId]);
  return withSession(Room.findById(roomId), session);
}

/** Gán phòng sau khi kiểm tra lại giới tính trong phòng (tránh nam/nữ chung phòng ở khu mixed). */
async function tryAssignRoomForApplication(roomId, genderNorm, session = null) {
  const room = await withSession(
    Room.findById(roomId).populate("area", "name genderPolicy isActive isDeleted"),
    session
  ).lean();
  if (!room?.area || room.area.isDeleted || room.area.isActive === false) return null;
  if (room.status === "maintenance") return null;

  const occMap = await loadOccupantGendersByRoom([roomId], session);
  const occ = occMap.get(String(roomId)) || [];
  if (!roomFitsStudentGender(room.area, genderNorm, occ)) return null;

  const heldMap = await countRoomSlotHoldersByRoom([roomId], session);
  const held = heldMap.get(String(roomId)) || 0;
  if (!roomHasVacancy(room, held)) return null;

  const nextHeld = held + 1;
  const cap = Number(room.capacity) || 0;
  return Room.findByIdAndUpdate(
    roomId,
    {
      $set: {
        currentOccupancy: nextHeld,
        status: cap > 0 && nextHeld >= cap ? "full" : "available",
      },
    },
    { returnDocument: "after", session: session || undefined }
  );
}

async function assignRoomWithRetry(applicationDoc, session) {
  const genderNorm = normalizeGender(applicationDoc.genderSnapshot) || applicationDoc.genderSnapshot;
  const pref = applicationDoc.preferenceArea || null;
  const candidates = await findCandidateRooms({ genderNorm, preferenceAreaId: pref }, session);
  if (!candidates.length) return { error: "NO_ROOM", room: null };
  const slotHolders = await countRoomSlotHoldersByRoom(candidates.map((c) => c._id), session);
  candidates.sort((a, b) => compareRooms(a, b, pref, slotHolders));
  for (const c of candidates) {
    const room = await tryAssignRoomForApplication(c._id, genderNorm, session);
    if (room) return { error: null, room };
  }
  return { error: "NO_ROOM", room: null };
}

function buildAreaVacancyStats(rooms) {
  const byArea = new Map();
  for (const r of rooms) {
    const aid = String(r.area?._id || r.area || "");
    if (!aid) continue;
    const cap = Number(r.capacity) || 0;
    const held = Number(r.currentOccupancy || 0);
    const vacantSlots = cap > 0 ? Math.max(0, cap - held) : 0;
    if (!byArea.has(aid)) {
      byArea.set(aid, { areaId: aid, availableRooms: 0, vacantSlots: 0 });
    }
    const agg = byArea.get(aid);
    agg.availableRooms += 1;
    agg.vacantSlots += vacantSlots;
  }
  return [...byArea.values()];
}

/** Gắn currentOccupancy thực tế (HĐ active + đơn approved) lên assignedRoom trong danh sách đơn. */
async function applyLiveOccupancyToAssignedRooms(applications) {
  if (!Array.isArray(applications) || !applications.length) return applications;

  const roomIds = [
    ...new Set(
      applications
        .map((a) => a.assignedRoom?._id || a.assignedRoom)
        .filter(Boolean)
        .map(String)
    ),
  ];
  if (!roomIds.length) return applications;

  const heldMap = await countEffectiveResidentsByRoom(roomIds);

  for (const app of applications) {
    const ar = app.assignedRoom;
    if (!ar || typeof ar !== "object") continue;
    const rid = String(ar._id || ar);
    const held = heldMap.get(rid);
    if (held == null) continue;
    ar.currentOccupancy = held;
    const cap = Number(ar.capacity) || 0;
    if (cap > 0 && ar.status !== "maintenance") {
      ar.status = held >= cap ? "full" : "available";
    }
  }
  return applications;
}

module.exports = {
  findCandidateRooms,
  pickBestRoomForApplication,
  assignRoomWithRetry,
  refreshRoomOccupancyFromSlots,
  tryAssignRoomForApplication,
  buildAreaVacancyStats,
  applyLiveOccupancyToAssignedRooms,
  areaAllowsGender,
  loadOccupantGendersByRoom,
  countRoomSlotHoldersByRoom,
  roomFitsStudentGender,
  occupancyRatio,
  normalizeGender,
};
