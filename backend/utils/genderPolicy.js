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

/** Kiểm tra SV được ở khu theo genderPolicy. */
function genderAllowsStay(userGender, areaGenderPolicy) {
  const pol = normalizeGenderPolicy(areaGenderPolicy);
  const g = String(userGender || "")
    .toLowerCase()
    .trim();
  if (pol === "mixed") return true;
  if (pol === "male") return g === "male" || g === "m" || g === "nam";
  if (pol === "female") return g === "female" || g === "f" || g === "nu" || g === "nữ";
  return true;
}

module.exports = { normalizeGenderPolicy, genderAllowsStay };
