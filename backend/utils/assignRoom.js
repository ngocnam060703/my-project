const Room = require("../models/Room");
const Area = require("../models/Area");

function normalizeGender(g) {
  const s = String(g || "")
    .trim()
    .toLowerCase();
  if (s === "nữ" || s === "nu" || s === "female" || s === "f") return "female";
  if (s === "nam" || s === "male" || s === "m") return "male";
  if (s.includes("nữ")) return "female";
  if (s.includes("nam")) return "male";
  return null;
}

function areaMatchesUser(areaDoc, userGenderNorm) {
  const pol = areaDoc.genderPolicy || "mixed";
  if (pol === "mixed") return true;
  if (!userGenderNorm) return pol === "mixed";
  return pol === userGenderNorm;
}

/**
 * Chọn một phòng còn chỗ trong khu phù hợp giới tính (genderPolicy), ưu tiên phòng ít người hơn.
 */
async function assignRoomForStudent(user) {
  const g = normalizeGender(user.gender);
  const areas = await Area.find({ isDeleted: { $ne: true } }).lean();
  const allowed = areas.filter((a) => areaMatchesUser(a, g));
  const areaIds = (allowed.length ? allowed : areas).map((a) => a._id);
  if (!areaIds.length) return null;

  const room = await Room.findOne({
    area: { $in: areaIds },
    status: { $ne: "maintenance" },
    $expr: { $lt: ["$currentOccupancy", "$capacity"] },
  })
    .sort({ currentOccupancy: 1, roomNumber: 1 })
    .populate("area", "name genderPolicy");

  return room;
}

module.exports = { assignRoomForStudent, normalizeGender };
