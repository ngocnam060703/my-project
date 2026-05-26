const mongoose = require("mongoose");

/**
 * Khai báo hư hỏng / sự cố phòng (điện, nước, thiết bị, khác).
 * Tách khỏi Violation (vi phạm kỷ luật) và DamageReport (CSVC/trưởng phòng).
 */
const maintenanceReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    /** @deprecated — dữ liệu cũ; báo cáo mới dùng damagedItemLabel */
    incidentType: {
      type: String,
      enum: ["electricity", "water", "equipment", "other", ""],
      default: "",
    },
    /** CSVC / vật tư hỏng trong phòng */
    facility: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", default: null },
    facilityLocation: { type: mongoose.Schema.Types.ObjectId, ref: "FacilityLocation", default: null },
    damagedItemLabel: { type: String, default: "", trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 8000 },
    images: [{ type: String }],
    status: {
      type: String,
      enum: ["pending", "processing", "resolved", "cancelled"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "", trim: true, maxlength: 4000 },
    requestCode: { type: String, default: "", trim: true },
    /** Mức độ — admin xác nhận khi xử lý */
    severity: {
      type: String,
      enum: ["light", "medium", "heavy", ""],
      default: "",
    },
    /** Nguyên nhân — admin xác nhận: tự nhiên / do sinh viên */
    damageCause: {
      type: String,
      enum: ["natural_wear", "student_caused", ""],
      default: "",
    },
    /** maintenance = yêu cầu bảo trì | compensation = bồi thường hư hỏng */
    resolutionType: {
      type: String,
      enum: ["maintenance", "compensation", ""],
      default: "",
    },
    compensationAmount: { type: Number, default: 0, min: 0 },
    /** Trạng thái tiến độ bảo trì (TH1) */
    maintenanceStatus: {
      type: String,
      enum: ["none", "scheduled", "in_progress", "completed", ""],
      default: "",
    },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    processedAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

maintenanceReportSchema.index({ user: 1, createdAt: -1 });
maintenanceReportSchema.index({ room: 1, status: 1 });
maintenanceReportSchema.index({ requestCode: 1 }, { unique: true, sparse: true });
maintenanceReportSchema.index({ createdAt: -1 });

function buildRequestCode(doc) {
  const d = doc.createdAt ? new Date(doc.createdAt) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const suffix = String(doc._id || "").slice(-6).toUpperCase();
  return `YC-${y}${m}-${suffix}`;
}

/** Mongoose 9+: middleware không dùng callback `next`. */
maintenanceReportSchema.pre("save", function assignRequestCode() {
  if (!this.requestCode && this._id) {
    this.requestCode = buildRequestCode(this);
  }
});

module.exports = mongoose.model("MaintenanceReport", maintenanceReportSchema);
