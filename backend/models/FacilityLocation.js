const mongoose = require("mongoose");

const facilityLocationSchema = new mongoose.Schema(
  {
    facility: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: "Area", required: true },
    floor: { type: Number, default: 1 },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

facilityLocationSchema.index({ facility: 1, room: 1 }, { unique: true });

module.exports = mongoose.model("FacilityLocation", facilityLocationSchema);
