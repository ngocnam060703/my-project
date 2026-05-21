const mongoose = require("mongoose");

const laundryUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    year: { type: Number, required: true, min: 2000, index: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    usedAt: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

laundryUsageSchema.index({ user: 1, service: 1, month: 1, year: 1 });

module.exports = mongoose.model("LaundryUsage", laundryUsageSchema);
