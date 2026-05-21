const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Phân loại nghiệp vụ KTX: chung phòng vs đăng ký cá nhân (giữ tương thích hóa đơn cũ). */
    type: { type: String, enum: ["common", "personal"], required: true },
    /** Đơn giá: VND / đơn vị measureUnit (kWh, m³) hoặc VND / tháng với fixed. */
    price: { type: Number, required: true, min: 0 },
    /** Chu kỳ đăng ký SV: monthly | once — khác với measureUnit. */
    unit: { type: String, enum: ["monthly", "once"], required: true },
    /** Đơn vị đo cho chỉ số / kê khai: tháng | kWh | m³ */
    measureUnit: { type: String, enum: ["month", "kwh", "m3"], default: "month" },
    /** Cố định mỗi kỳ vs theo chỉ số (điện/nước). */
    tariffType: { type: String, enum: ["fixed", "variable"], default: "fixed" },
    /** Mô hình tính phí cá nhân: single (cũ) | hybrid (theo lượt + gói tháng). */
    billingModel: { type: String, enum: ["single", "hybrid"], default: "single" },
    /** Giá gói tháng cho dịch vụ hybrid (vd: giặt theo tháng). */
    monthlyPackagePrice: { type: Number, default: 0, min: 0 },
    /** Số lượt bao gồm trong gói tháng. */
    includedUsesPerMonth: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Service", serviceSchema);
