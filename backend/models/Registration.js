const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    registrationType: { type: String, enum: ["dorm", "transfer"], default: "dorm" },
    fromRoom: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    currentContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
    semester: { type: String, required: true },
    schoolYear: { type: String, required: true },
    startDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    note: { type: String, default: "" },
    /** Lý do chuyển phòng do sinh viên điền (ghi vào cancelReason HĐ cũ nếu có) */
    transferReason: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    /** Chuyển phòng: awaiting_confirmation → completed sau khi SV xác nhận */
    transferPhase: {
      type: String,
      enum: ["awaiting_confirmation", "completed"],
      default: null,
    },
    financialSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    newContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
    studentConfirmedAt: { type: Date, default: null },
    transferExecutedAt: { type: Date, default: null },
    studentConfirmIp: { type: String, default: "" },
    studentConfirmUserAgent: { type: String, default: "" },
    /** SV xác nhận hủy HĐ gia hạn upcoming khi gửi đơn chuyển phòng */
    upcomingCancellationAcknowledgedAt: { type: Date, default: null },
    cancelledUpcomingContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Registration", registrationSchema);
