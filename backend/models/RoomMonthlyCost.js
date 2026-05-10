const mongoose = require("mongoose");

const roomMonthlyCostSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    electricityFee: { type: Number, default: 0, min: 0 },
    waterFee: { type: Number, default: 0, min: 0 },
    /** Wi‑Fi / DV phòng gói cố định — tổng theo phòng/tháng; hóa đơn chia ÷ capacity slot */
    wifiMonthlyFee: { type: Number, default: 0, min: 0 },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

roomMonthlyCostSchema.index({ room: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("RoomMonthlyCost", roomMonthlyCostSchema);
