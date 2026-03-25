const mongoose = require("mongoose");

const violationRuleSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    severity: { type: String, enum: ["light", "medium", "heavy"], required: true },
    points: { type: Number, default: 0, min: 0 },
    fineMin: { type: Number, default: 0, min: 0 },
    fineMax: { type: Number, default: 0, min: 0 },
    compensationRequired: { type: Boolean, default: false },
    compensationNote: { type: String, default: "" },
    handlingAction: { type: String, default: "" },
    canImmediateExpulsion: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ViolationRule", violationRuleSchema);
