/**
 * Seed bảng vi phạm chuẩn + migrate billType cho hóa đơn cũ.
 * Chạy: node backend/scripts/seedViolationRules.js (từ thư mục backend)
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const ViolationRule = require("../models/ViolationRule");
const Bill = require("../models/Bill");

const RULES = [
  {
    order: 1,
    code: "VP001",
    name: "Đi về trễ quá 23h",
    severity: "light",
    points: 1,
    fineMin: 0,
    fineMax: 0,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Nhắc nhở / cảnh cáo",
    canImmediateExpulsion: false,
  },
  {
    order: 2,
    code: "VP002",
    name: "Gây ồn",
    severity: "light",
    points: 1,
    fineMin: 0,
    fineMax: 0,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Cảnh cáo",
    canImmediateExpulsion: false,
  },
  {
    order: 3,
    code: "VP003",
    name: "Không giữ vệ sinh",
    severity: "light",
    points: 1,
    fineMin: 20000,
    fineMax: 50000,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Nhắc nhở / phạt",
    canImmediateExpulsion: false,
  },
  {
    order: 4,
    code: "VP004",
    name: "Tự ý chuyển phòng",
    severity: "medium",
    points: 2,
    fineMin: 100000,
    fineMax: 100000,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Phạt + cảnh cáo",
    canImmediateExpulsion: false,
  },
  {
    order: 5,
    code: "VP005",
    name: "Dẫn người ngoài vào",
    severity: "medium",
    points: 2,
    fineMin: 100000,
    fineMax: 200000,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Phạt + cảnh cáo",
    canImmediateExpulsion: false,
  },
  {
    order: 6,
    code: "VP006",
    name: "Sử dụng thiết bị cấm",
    severity: "medium",
    points: 2,
    fineMin: 100000,
    fineMax: 300000,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Phạt tiền",
    canImmediateExpulsion: false,
  },
  {
    order: 7,
    code: "VP007",
    name: "Làm hỏng tài sản nhẹ",
    severity: "heavy",
    points: 3,
    fineMin: 50000,
    fineMax: 200000,
    compensationRequired: true,
    compensationNote: "Bồi thường theo mức hư hỏng",
    handlingAction: "Bồi thường + phạt",
    canImmediateExpulsion: false,
  },
  {
    order: 8,
    code: "VP008",
    name: "Phá hoại tài sản",
    severity: "heavy",
    points: 4,
    fineMin: 0,
    fineMax: 200000,
    compensationRequired: true,
    compensationNote: "Bồi thường 100% giá trị",
    handlingAction: "Bồi thường + kỷ luật",
    canImmediateExpulsion: true,
  },
  {
    order: 9,
    code: "VP009",
    name: "Đánh nhau / gây rối",
    severity: "heavy",
    points: 4,
    fineMin: 200000,
    fineMax: 500000,
    compensationRequired: false,
    compensationNote: "Có thể bồi thường thêm",
    handlingAction: "Kỷ luật",
    canImmediateExpulsion: true,
  },
  {
    order: 10,
    code: "VP010",
    name: "Vi phạm nhiều lần (xét theo tổng điểm kỳ)",
    severity: "heavy",
    points: 0,
    fineMin: 0,
    fineMax: 0,
    compensationRequired: false,
    compensationNote: "",
    handlingAction: "Xử lý theo tổng điểm tích lũy",
    canImmediateExpulsion: false,
  },
];

async function run() {
  await connectDB();
  try {
    await Bill.collection.dropIndex("contract_1_month_1_year_1");
    console.log("Dropped legacy bill unique index contract_1_month_1_year_1");
  } catch (e) {
    console.log("Skip drop legacy index:", e.message);
  }
  await Bill.updateMany({ billType: { $exists: false } }, { $set: { billType: "monthly" } });
  await Bill.syncIndexes();

  for (const r of RULES) {
    await ViolationRule.findOneAndUpdate(
      { code: r.code },
      { $set: r },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log("Seeded ViolationRule:", RULES.length);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
