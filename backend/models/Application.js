const mongoose = require("mongoose");

/**
 * Đơn đăng ký KTX (luồng xét duyệt): phân phòng chỉ khi admin APPROVE.
 * Khác với Registration (một số luồng cũ gán phòng ngay lúc gửi đơn).
 */
const applicationSchema = new mongoose.Schema(
  {
    /** Sinh viên (User role user) */
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /**
     * Snapshot giới tính tại thời điểm gửi (đã chuẩn hóa male/female/unknown).
     * Dùng để xét phòng đúng policy khu dù sau này user đổi hồ sơ.
     */
    genderSnapshot: { type: String, enum: ["male", "female", "unknown"], default: "unknown" },
    /** Nguyện vọng khu (Area) — ưu tiên khi còn chỗ */
    preferenceArea: { type: mongoose.Schema.Types.ObjectId, ref: "Area", default: null },
    semester: { type: String, required: true },
    schoolYear: { type: String, required: true },
    startDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    /** Phòng được phân sau khi duyệt */
    assignedRoom: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    /** Ghi chú / lý do từ chối (theo nghiệp vụ) */
    note: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    /** Hợp đồng sinh ra sau khi duyệt (thanh toán hoàn tất quy trình) */
    linkedContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
  },
  { timestamps: true }
);

/** Một sinh viên chỉ một đơn pending */
applicationSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: "pending" }, name: "application_one_pending_per_user" }
);

module.exports = mongoose.model("Application", applicationSchema);
