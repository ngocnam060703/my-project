const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema(
  {
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "terminated"], default: "active" },
    contractNumber: { type: String, unique: true },
    terms: { type: String, default: "" },
    signedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
