/** Chuẩn hoá priorityType / priorityProofUrl trước khi lưu User. */
function normalizePriorityFields(payload) {
  const p = payload || {};
  const type = String(p.priorityType || "normal").trim() || "normal";
  p.priorityType = type;
  if (type === "normal") {
    p.priorityProofUrl = null;
  } else if (p.priorityProofUrl !== undefined) {
    p.priorityProofUrl = p.priorityProofUrl || null;
  }
  return p;
}

module.exports = { normalizePriorityFields };
