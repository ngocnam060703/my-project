const mongoose = require("mongoose");

/**
 * Khai báo hư hỏng / sự cố phòng (điện, nước, thiết bị, khác).
 * Tách khỏi DamageReport (trưởng phòng + thiết bị CSVC) để mọi sinh viên có hợp đồng đều gửi được.
 */
const maintenanceReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    /** electricity | water | equipment | other */
    incidentType: {
      type: String,
      enum: ["electricity", "water", "equipment", "other"],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 8000 },
    /** URL hoặc data URL (base64) — giới hạn độ dài nên validate ở controller */
    images: [{ type: String }],
    status: {
      type: String,
      enum: ["pending", "processing", "resolved"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "", trim: true, maxlength: 4000 },
  },
  { timestamps: true }
);

maintenanceReportSchema.index({ user: 1, createdAt: -1 });
maintenanceReportSchema.index({ room: 1, status: 1 });

module.exports = mongoose.model("MaintenanceReport", maintenanceReportSchema);
