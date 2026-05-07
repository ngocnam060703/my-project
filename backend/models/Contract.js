const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema(
  {
    /** Có thể null khi admin tạo hợp đồng thủ công (không qua đơn đăng ký). */
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", default: null },
    /** Đơn xét duyệt (module Application) — tách biệt Registration */
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    /** Giường được xếp trong phòng (Bed) */
    bed: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending_payment", "active", "expired", "terminated"],
      default: "pending_payment",
    },
    contractNumber: { type: String, unique: true },
    terms: { type: String, default: "" },
    signedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paymentConfirmedAt: { type: Date, default: null },
    paymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Giá thuê / tháng (VNĐ) — tuỳ chọn; nếu null UI dùng giá phòng */
    monthlyRent: { type: Number, default: null },
    /** Tiền cọc (VNĐ) — tuỳ chọn */
    depositAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
