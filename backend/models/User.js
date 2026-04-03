const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    phone: { type: String, default: "" },
    studentId: { type: String, default: "" },
    /** Lớp hành chính, ví dụ: 11DHTH1 */
    className: { type: String, default: "" },
    /** Chuyên ngành */
    major: { type: String, default: "" },
    /** Nam / Nữ */
    gender: { type: String, default: "" },
    /** Số CCCD / CMND */
    citizenId: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    address: { type: String, default: "" },
    /** Khoa */
    faculty: { type: String, default: "" },
    /** Ngày nhập học */
    enrollmentDate: { type: Date, default: null },
    /** Giáo viên chủ nhiệm */
    homeroomTeacher: { type: String, default: "" },
    /** Quê quán */
    addressNative: { type: String, default: "" },
    /** Thường trú */
    addressPermanent: { type: String, default: "" },
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
    role: { type: String, enum: ["admin", "manager", "user"], default: "user" },
    /** Chỉ tài khoản admin cấp cao — được phép tạo/cấp quyền admin */
    isSuperAdmin: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    managedArea: { type: mongoose.Schema.Types.ObjectId, ref: "Area", default: null },
  },
  { timestamps: true }
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
