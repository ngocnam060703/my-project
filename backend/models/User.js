const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    /** Unique chỉ với bản ghi chưa xóa mềm — xem index phía dưới */
    email: { type: String, required: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    phone: { type: String, default: "" },
    studentId: { type: String, default: "" },
    /** Lớp hành chính, ví dụ: 11DHTH1 */
    className: { type: String, default: "" },
    /** Chuyên ngành */
    major: { type: String, default: "" },
    /** Khoa/nhóm ngành (tham chiếu từ danh mục ngành) */
    facultyGroup: { type: String, default: "" },
    /** Nam / Nữ */
    gender: { type: String, default: "" },
    /** Số CCCD / CMND */
    citizenId: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    address: { type: String, default: "" },
    /** Khóa (VD: K26) */
    faculty: { type: String, default: "" },
    /** Ngày nhập học */
    enrollmentDate: { type: Date, default: null },
    /** Giáo viên chủ nhiệm */
    homeroomTeacher: { type: String, default: "" },
    /** Quê quán */
    addressNative: { type: String, default: "" },
    /** Thường trú */
    addressPermanent: { type: String, default: "" },
    /** Dân tộc */
    ethnicity: { type: String, default: "" },
    /** Diện ưu tiên xét nội trú */
    priorityType: {
      type: String,
      enum: ["normal", "martyr_child", "invalid_child", "minority", "disabled"],
      default: "normal",
    },
    /** Link file minh chứng diện ưu tiên */
    priorityProofUrl: { type: String, default: null },
    /** Tạm trú */
    addressTemporary: { type: String, default: "" },
    /** Tạm vắng (ghi chú địa chỉ khi vắng) */
    addressAbsent: { type: String, default: "" },
    familyFatherName: { type: String, default: "" },
    familyFatherPhone: { type: String, default: "" },
    familyMotherName: { type: String, default: "" },
    familyMotherPhone: { type: String, default: "" },
    /** SĐT liên hệ khẩn (gia đình) */
    familyEmergencyPhone: { type: String, default: "" },
    role: { type: String, enum: ["admin", "manager", "user", "student"], default: "user" },
    /**
     * Vòng đời duyệt tài khoản sinh viên:
     * - pending: chờ admin duyệt
     * - approved: được đăng nhập
     * - rejected: bị từ chối, lưu lý do tại rejectionReason
     */
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectionReason: { type: String, default: "" },
    /** Chỉ tài khoản admin cấp cao — được phép tạo/cấp quyền admin */
    isSuperAdmin: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    /** Xóa mềm — không hiển thị trong danh sách, không đăng nhập */
    isDeleted: { type: Boolean, default: false, index: true },
    managedArea: { type: mongoose.Schema.Types.ObjectId, ref: "Area", default: null },
  },
  { timestamps: true }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: { $ne: true } },
    name: "email_unique_active",
  }
);

userSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: { $ne: true },
      studentId: { $exists: true, $type: "string", $ne: "" },
    },
    name: "student_id_unique_active",
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

/**
 * bcryptjs 3: compare ném lỗi nếu tham số không phải string → gây HTTP 500 khi đăng nhập.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  const hash = this.password;
  const cand =
    candidatePassword === null || candidatePassword === undefined
      ? ""
      : String(candidatePassword);
  if (typeof hash !== "string" || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(cand, hash);
  } catch {
    return false;
  }
};

module.exports = mongoose.model("User", userSchema);
