const mongoose = require("mongoose");

const facilitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    category: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["active", "broken", "repairing"],
      default: "active",
    },
    quantityTotal: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Facility", facilitySchema);
