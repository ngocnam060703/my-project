const mongoose = require("mongoose");

const damageReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    device: { type: String, required: true },
    description: { type: String, required: true },
    images: [{ type: String }],
    status: { type: String, enum: ["pending", "processing", "resolved"], default: "pending" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DamageReport", damageReportSchema);
