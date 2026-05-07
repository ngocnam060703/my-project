const mongoose = require("mongoose");

const majorSchema = new mongoose.Schema(
  {
    /** Tên ngành (duy nhất theo faculty nếu có) */
    name: { type: String, required: true, trim: true, index: true },
    /** Khoa (tuỳ chọn). Nếu dùng, có thể lọc dropdown theo khoa */
    faculty: { type: String, default: "", trim: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

majorSchema.index({ name: 1, faculty: 1 }, { unique: true });

module.exports = mongoose.model("Major", majorSchema);

