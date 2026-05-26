/** Chuẩn hoá genderPolicy khu (male | female | mixed). */
function normalizeGenderPolicy(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "male" || s === "nam" || s === "m") return "male";
  if (s === "female" || s === "nu" || s === "nữ" || s === "f") return "female";
  if (s === "mixed" || s === "hỗn hợp" || s === "hon hop") return "mixed";
  return "mixed";
}

/** Chuẩn hoá giới tính SV → male | female | null. */
function normalizeStudentGender(g) {
  const s = String(g || "")
    .trim()
    .toLowerCase();
  if (s === "nữ" || s === "nu" || s === "female" || s === "f") return "female";
  if (s === "nam" || s === "male" || s === "m") return "male";
  if (s.includes("nữ")) return "female";
  if (s.includes("nam")) return "male";
  return null;
}

/** SV được ở khu theo genderPolicy (male/female/mixed). */
function areaAllowsStudentGender(areaGenderPolicy, userGenderNorm) {
  const pol = normalizeGenderPolicy(areaGenderPolicy);
  if (pol === "mixed") return true;
  if (!userGenderNorm || userGenderNorm === "unknown") return false;
  return pol === userGenderNorm;
}

/**
 * Khu hỗn hợp: nam và nữ cùng khu nhưng không chung phòng — phòng trống hoặc cùng giới với người đang ở.
 * @param {string|null|undefined} userGenderNorm male | female | unknown
 * @param {Array<string|null|undefined>} occupantGenderNorms giới tính người đang giữ slot trong phòng
 */
function roomAllowsStudentInMixed(userGenderNorm, occupantGenderNorms) {
  const occ = (occupantGenderNorms || []).map((g) => normalizeStudentGender(g) || (g === "male" || g === "female" ? g : null)).filter(Boolean);
  if (occ.length === 0) return true;
  if (!userGenderNorm || userGenderNorm === "unknown") return false;
  const roomGender = occ[0];
  if (!occ.every((g) => g === roomGender)) return false;
  return roomGender === userGenderNorm;
}

/** SV được vào phòng: đúng khu + (khu mixed thì cùng giới trong phòng). */
function studentMayJoinRoom(areaGenderPolicy, userGenderNorm, occupantGenderNorms) {
  if (!areaAllowsStudentGender(areaGenderPolicy, userGenderNorm)) return false;
  const pol = normalizeGenderPolicy(areaGenderPolicy);
  if (pol === "mixed") return roomAllowsStudentInMixed(userGenderNorm, occupantGenderNorms);
  return true;
}

/** Kiểm tra SV được ở khu theo genderPolicy (chuỗi gender thô từ User). */
function genderAllowsStay(userGender, areaGenderPolicy) {
  const pol = normalizeGenderPolicy(areaGenderPolicy);
  const norm = normalizeStudentGender(userGender);
  return areaAllowsStudentGender(pol, norm || "unknown");
}

module.exports = {
  normalizeGenderPolicy,
  normalizeStudentGender,
  areaAllowsStudentGender,
  roomAllowsStudentInMixed,
  studentMayJoinRoom,
  genderAllowsStay,
};
