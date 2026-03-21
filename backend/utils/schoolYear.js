/**
 * @param {string} value
 * @returns {{ start: number, end: number } | null}
 */
function parseSchoolYear(value) {
  if (!value || typeof value !== "string") return null;
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
 * Năm kết thúc của năm học phải >= năm dương lịch hiện tại.
 */
function isSchoolYearNotPast(schoolYear) {
  const parsed = parseSchoolYear(schoolYear);
  if (!parsed) return false;
  const currentYear = new Date().getFullYear();
  return parsed.end >= currentYear;
}

module.exports = { parseSchoolYear, isSchoolYearNotPast };
