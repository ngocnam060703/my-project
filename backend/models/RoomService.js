const mongoose = require("mongoose");

/**
 * Gán dịch vụ cho phòng (nhiều-nhiều): phòng A có điện, nước, wifi…
 */
const roomServiceSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    isActive: { type: Boolean, default: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

roomServiceSchema.index({ room: 1, service: 1 }, { unique: true, name: "room_service_unique" });

module.exports = mongoose.model("RoomService", roomServiceSchema);
