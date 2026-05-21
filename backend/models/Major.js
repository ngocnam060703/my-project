const mongoose = require("mongoose");

const majorSchema = new mongoose.Schema(
  {
    /** Mã ngành tham chiếu KTX (VD: CNTT, KT) */
    code: { type: String, default: "", trim: true, uppercase: true },
    /** Tên ngành đầy đủ — khớp chuỗi user.major trên hồ sơ SV */
    name: { type: String, required: true, trim: true, index: true },
    /** Khóa / ghi chú nhóm (tuỳ chọn), tương thích dữ liệu cũ `faculty` */
    faculty: { type: String, default: "", trim: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

majorSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $gt: "" } } });
majorSchema.index({ name: 1, faculty: 1 });

module.exports = mongoose.model("Major", majorSchema);

