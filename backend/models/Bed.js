const mongoose = require("mongoose");

const bedSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    /** Mã giường trong phòng: {số phòng}-01, {số phòng}-02, … */
    code: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["available", "occupied", "reserved", "maintenance", "locked"],
      default: "available",
      index: true,
    },
    currentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    currentContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null, index: true },
    /** Thời điểm phân giường (gắn HĐ) — khác check-in thực tế */
    assignedAt: { type: Date, default: null },
    checkInAt: { type: Date, default: null },
    /** Tình trạng thiết bị tại giường (v1: text đơn giản) */
    equipmentStatus: { type: String, default: "good", trim: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

bedSchema.index({ room: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Bed", bedSchema);

