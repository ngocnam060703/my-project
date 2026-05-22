const mongoose = require("mongoose");

const contractExtensionPeriodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContractExtensionPeriod", contractExtensionPeriodSchema);
