const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema(
  {
    /** Có thể null khi admin tạo hợp đồng thủ công (không qua đơn đăng ký). */
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
