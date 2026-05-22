const Bill = require("../models/Bill");

/**
 * Mã hóa đơn: HD20260001 (tháng) | HDP20260001 (phạt) | HDBT20260001 (bồi thường HH)
 * Sequence 4 chữ số theo năm, unique sparse index trên billCode.
 */
function billCodePrefix(billType) {
  if (billType === "penalty") return "HDP";
  if (billType === "damage_reimbursement") return "HDBT";
  return "HD";
}

async function generateNextBillCode({ billType = "monthly", year } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const prefix = billCodePrefix(billType);
  const rx = new RegExp(`^${prefix}${y}(\\d{4})$`);

  const candidates = await Bill.find({ billCode: new RegExp(`^${prefix}${y}`) })
    .select("billCode")
    .lean();

  let maxSeq = 0;
  for (const row of candidates) {
    const m = String(row.billCode || "").match(rx);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${y}${String(maxSeq + 1).padStart(4, "0")}`;
}

/** Gán mã nếu thiếu — retry khi trùng (race). */
async function assignBillCodeIfMissing(billDoc, { maxAttempts = 5 } = {}) {
  if (billDoc.billCode) return billDoc.billCode;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = await generateNextBillCode({ billType: billDoc.billType, year: billDoc.year });
    billDoc.billCode = code;
    try {
      await billDoc.save();
      return code;
    } catch (e) {
      if (e && e.code === 11000) {
        billDoc.billCode = "";
        continue;
      }
      throw e;
    }
  }
  throw new Error("Không thể tạo mã hóa đơn duy nhất");
}

async function ensureBillCodesForList(bills) {
  for (const b of bills) {
    if (b.billCode) continue;
    const code = await generateNextBillCode({ billType: b.billType, year: b.year });
    b.billCode = code;
    await Bill.updateOne({ _id: b._id }, { $set: { billCode: code } });
  }
}

module.exports = {
  generateNextBillCode,
  assignBillCodeIfMissing,
  ensureBillCodesForList,
};
