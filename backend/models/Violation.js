const mongoose = require("mongoose");

const resolutionSchema = new mongoose.Schema(
  {
    actionType: { type: String, enum: ["warning", "fine", "expulsion"], required: true },
    penaltyAmount: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "" },
    resolvedAt: { type: Date, required: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false }
);

const violationSchema = new mongoose.Schema(
  {
    rule: { type: mongoose.Schema.Types.ObjectId, ref: "ViolationRule", required: true },
    /** Sinh viên vi phạm (bỏ trống nếu chia cả phòng) */
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    semester: { type: String, required: true, trim: true },
    schoolYear: { type: String, required: true, trim: true },
    /** Snapshot từ rule lúc ghi nhận */
    ruleName: { type: String, default: "" },
    severity: { type: String, enum: ["light", "medium", "heavy"], required: true },
    points: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    compensationAmount: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    /** Ảnh minh chứng: URL hoặc chuỗi base64 (data URL) */
    images: [{ type: String }],
    splitToRoom: { type: Boolean, default: false },
    /** Không cộng điểm cá nhân (ví dụ không xác định người — chia phòng) */
    noIndividualPoints: { type: Boolean, default: false },
    immediateExpulsion: { type: Boolean, default: false },
    batchId: { type: mongoose.Schema.Types.ObjectId, default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    /** pending: chờ xử lý chính thức | resolved: đã có quyết định kỷ luật */
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
    /** Một vi phạm chỉ một lần xử lý (khi resolved) */
    resolution: { type: resolutionSchema, default: undefined },
  },
  { timestamps: true }
);

violationSchema.index({ user: 1, schoolYear: 1, semester: 1 });
violationSchema.index({ room: 1, createdAt: -1 });
violationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Violation", violationSchema);
