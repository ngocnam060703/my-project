/**
 * Parse năm học dạng "2024-2025", "2024-25", "2024 - 2025".
 * Trả về { start, end } hoặc null nếu không đọc được.
 */
export function parseSchoolYear(value: string): { start: number; end: number } | null {
  const s = value.trim().replace(/\s+/g, "");
  const m4 = s.match(/^(\d{4})-(\d{4})$/);
  if (m4) {
    const start = parseInt(m4[1], 10);
    const end = parseInt(m4[2], 10);
    if (end >= start) return { start, end };
    return null;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})$/);
  if (m2) {
    const start = parseInt(m2[1], 10);
    const yy = parseInt(m2[2], 10);
    const century = Math.floor(start / 100) * 100;
    let end = century + yy;
    if (end < start) end += 100;
    return { start, end };
  }
  return null;
}

/**
 * Năm học không được là năm đã kết thúc: năm kết thúc (năm thứ hai) phải >= năm dương lịch hiện tại.
 * Ví dụ: 2024-2025 còn hợp lệ trong năm 2025; đến 2026 thì coi là quá khứ.
 */
export function isSchoolYearNotPast(schoolYear: string): boolean {
  const parsed = parseSchoolYear(schoolYear);
  if (!parsed) return false;
  const currentYear = new Date().getFullYear();
  return parsed.end >= currentYear;
}

export const schoolYearValidationMessage =
  "Năm học không hợp lệ hoặc đã qua. Dùng định dạng VD: 2024-2025 (năm kết thúc phải từ năm hiện tại trở đi).";
