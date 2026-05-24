const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: "Area", required: true },
    maxCapacity: { type: Number, min: 1 },
    capacity: { type: Number, required: true, min: 1 },
    currentOccupancy: { type: Number, default: 0 },
    currentPrice: { type: Number, min: 0 },
    price: { type: Number, min: 0 },
    floor: { type: Number, default: 1 },
    amenities: [{ type: String }],
    status: { type: String, enum: ["available", "full", "maintenance"], default: "available" },
    description: { type: String, default: "" },
    roomType: { type: String, default: "" },
    roomLeader: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/** Mongoose 9+: middleware không dùng callback `next`. */
roomSchema.pre("validate", function syncRoomFields() {
  const cp = this.currentPrice != null ? Number(this.currentPrice) : null;
  const p = this.price != null ? Number(this.price) : null;
  if (cp != null && !Number.isNaN(cp)) {
    this.currentPrice = cp;
    if (p == null || Number.isNaN(p)) this.price = cp;
  } else if (p != null && !Number.isNaN(p)) {
    this.price = p;
    this.currentPrice = p;
  }
  const mc = this.maxCapacity != null ? Number(this.maxCapacity) : null;
  const cap = this.capacity != null ? Number(this.capacity) : null;
  if (mc != null && !Number.isNaN(mc) && mc >= 1) {
    this.maxCapacity = mc;
    this.capacity = mc;
  } else if (cap != null && !Number.isNaN(cap) && cap >= 1) {
    this.capacity = cap;
    this.maxCapacity = cap;
  }
  if (this.currentPrice == null && this.price == null) {
    throw new Error("Giá phòng (currentPrice) là bắt buộc");
  }
});

roomSchema.index({ area: 1, roomNumber: 1 }, { unique: true });
roomSchema.virtual("isFull").get(function () {
  const cap = Number(this.maxCapacity ?? this.capacity) || 0;
  return this.currentOccupancy >= cap;
});
roomSchema.virtual("pricePerPerson").get(function () {
  const cap = Number(this.maxCapacity ?? this.capacity) || 0;
  if (cap <= 0) return 0;
  const monthly = this.currentPrice != null ? this.currentPrice : this.price;
  return Math.round(Number(monthly) / cap);
});

roomSchema.set("toJSON", { virtuals: true });
roomSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Room", roomSchema);
