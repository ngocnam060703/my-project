const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: "Area", required: true },
    capacity: { type: Number, required: true, min: 1 },
    currentOccupancy: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 0 },
    floor: { type: Number, default: 1 },
    amenities: [{ type: String }],
    status: { type: String, enum: ["available", "full", "maintenance"], default: "available" },
    description: { type: String, default: "" },
    roomType: { type: String, default: "" },
    roomLeader: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

roomSchema.index({ area: 1, roomNumber: 1 }, { unique: true });
roomSchema.virtual("isFull").get(function () {
  return this.currentOccupancy >= this.capacity;
});
/** Giá theo đầu người (tổng giá / sức chứa) */
roomSchema.virtual("pricePerPerson").get(function () {
  const cap = Number(this.capacity) || 0;
  if (cap <= 0) return 0;
  return Math.round(Number(this.price) / cap);
});

roomSchema.set("toJSON", { virtuals: true });
roomSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Room", roomSchema);
