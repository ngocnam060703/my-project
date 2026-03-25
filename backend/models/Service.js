const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["common", "personal"], required: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ["monthly", "once"], required: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Service", serviceSchema);
