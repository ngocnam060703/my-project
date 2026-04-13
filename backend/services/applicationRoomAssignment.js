const mongoose = require("mongoose");
const Room = require("../models/Room");
const Area = require("../models/Area");
const { normalizeGender } = require("../utils/assignRoom");

/**
 * Khu (Area) có thể chứa sinh viên theo genderPolicy.
 */
function areaAllowsGender(areaDoc, userGenderNorm) {
  const pol = areaDoc.genderPolicy || "mixed";
  if (pol === "mixed") return true;
  if (!userGenderNorm || userGenderNorm === "unknown") return pol === "mixed";
  return pol === userGenderNorm;
}

/**
 * Tỷ lệ lấp đầy [0..1) — phòng "gần đầy" có ratio cao hơn (ưu tiên gom người, tối ưu giường trống rải rác).
 */
function occupancyRatio(roomDoc) {
  const cap = Number(roomDoc.capacity) || 0;
  if (cap <= 0) return 0;
  return Math.min(1, Number(roomDoc.currentOccupancy || 0) / cap);
}

/**
 * Chấm điểm phòng để sắp xếp: khu nguyện vọng trước, sau đó phòng gần đầy, cuối cùng ổn định theo số phòng.
 * @param {import("mongoose").Types.ObjectId|string|null|undefined} preferenceAreaId
 * @param {import("mongoose").Document|object} roomDoc — có populate area nếu cần so khớm preference
 */
function roomSortKey(roomDoc, preferenceAreaId) {
  const pref = preferenceAreaId ? String(preferenceAreaId) : "";
  const areaId = String(roomDoc.area?._id || roomDoc.area || "");
  const inPreferredZone = pref && areaId === pref ? 1 : 0;
  const ratio = occupancyRatio(roomDoc);
  const numberKey = String(roomDoc.roomNumber || "");
  return { inPreferredZone, ratio, numberKey };
}

function compareRooms(a, b, preferenceAreaId) {
  const ka = roomSortKey(a, preferenceAreaId);
  const kb = roomSortKey(b, preferenceAreaId);
  if (ka.inPreferredZone !== kb.inPreferredZone) return kb.inPreferredZone - ka.inPreferredZone;
  /** Ưu tiên phòng gần đầy: tỷ lệ lấp đầy cao hơn đứng trước */
  if (ka.ratio !== kb.ratio) return kb.ratio - ka.ratio;
  if (ka.numberKey < kb.numberKey) return -1;
  if (ka.numberKey > kb.numberKey) return 1;
  return 0;
}

/**
 * Lấy danh sách phòng ứng viên: đúng giới tính theo khu, còn chỗ, không bảo trì.
 * @param {object} params
 * @param {"male"|"female"|"unknown"|null} params.genderNorm
 * @param {import("mongoose").Types.ObjectId|string|null|undefined} params.preferenceAreaId
 * @param {import("mongoose").ClientSession|null} session
 */
async function findCandidateRooms({ genderNorm, preferenceAreaId }, session = null) {
  const areas = await Area.find({ isDeleted: { $ne: true }, isActive: { $ne: false } })
    .session(session || null)
    .lean();
  const allowedAreaIds = areas.filter((a) => areaAllowsGender(a, genderNorm)).map((a) => a._id);
  if (!allowedAreaIds.length) return [];

  const rooms = await Room.find({
    area: { $in: allowedAreaIds },
    status: { $ne: "maintenance" },
    $expr: { $lt: ["$currentOccupancy", "$capacity"] },
  })
    .populate("area", "name genderPolicy isActive isDeleted")
    .session(session || null)
    .lean();

  /** Lọc phòng thuộc khu vẫn active (populate area có thể null nếu bị xóa) */
  return rooms.filter((r) => {
    const ar = r.area;
    if (!ar || ar.isDeleted) return false;
    if (ar.isActive === false) return false;
    return areaAllowsGender(ar, genderNorm);
  });
}

/**
 * Chọn một phòng tối ưu theo nghiệp vụ (không giữ chỗ — gọi lại lúc duyệt để tránh race).
 */
async function pickBestRoomForApplication(applicationLike, session = null) {
  const genderNorm = normalizeGender(applicationLike.genderSnapshot) || applicationLike.genderSnapshot;
  const pref = applicationLike.preferenceArea || null;
  const candidates = await findCandidateRooms({ genderNorm, preferenceAreaId: pref }, session);
  if (!candidates.length) return null;
  candidates.sort((a, b) => compareRooms(a, b, pref));
  return candidates[0];
}

/**
 * Cố gắng tăng occupancy an toàn (atomic) — tránh vượt capacity khi nhiều request đồng thời.
 */
async function tryIncrementRoomOccupancy(roomId, session) {
  const updated = await Room.findOneAndUpdate(
    {
      _id: roomId,
      status: { $ne: "maintenance" },
      $expr: { $lt: ["$currentOccupancy", "$capacity"] },
    },
    { $inc: { currentOccupancy: 1 } },
    { new: true, session }
  );
  if (!updated) return null;
  updated.status = updated.currentOccupancy >= updated.capacity ? "full" : "available";
  await updated.save({ session });
  return updated;
}

/**
 * Duyệt lần lượt danh sách ứng viên đã sort cho đến khi increment thành công.
 */
async function assignRoomWithRetry(applicationDoc, session) {
  const genderNorm = normalizeGender(applicationDoc.genderSnapshot) || applicationDoc.genderSnapshot;
  const pref = applicationDoc.preferenceArea || null;
  const candidates = await findCandidateRooms({ genderNorm, preferenceAreaId: pref }, session);
  if (!candidates.length) return { error: "NO_ROOM", room: null };
  candidates.sort((a, b) => compareRooms(a, b, pref));
  for (const c of candidates) {
    const room = await tryIncrementRoomOccupancy(c._id, session);
    if (room) return { error: null, room };
  }
  return { error: "NO_ROOM", room: null };
}

module.exports = {
  findCandidateRooms,
  pickBestRoomForApplication,
  assignRoomWithRetry,
  areaAllowsGender,
  occupancyRatio,
  normalizeGender,
};
