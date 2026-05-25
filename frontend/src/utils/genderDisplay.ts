/** Hiển thị giới tính SV (hồ sơ / snapshot đơn). */
export function formatStudentGender(g?: string | null): string {
  const s = String(g || "").toLowerCase();
  if (s === "male" || s === "m" || s.includes("nam")) return "Nam";
  if (s === "female" || s === "f" || s.includes("nữ") || s.includes("nu")) return "Nữ";
  return "Chưa rõ";
}

export function areaGenderPolicyLabel(p?: string | null): string {
  if (p === "male") return "KTX nam";
  if (p === "female") return "KTX nữ";
  return "Hỗn hợp";
}
