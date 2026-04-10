const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema(
  {
    /** Unique chỉ bản ghi chưa xóa mềm — index phía dưới */
    name: { type: String, required: true },
    description: { type: String, default: "" },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Phân khu theo giới tính — dùng cho tự phân phòng */
    genderPolicy: { type: String, enum: ["male", "female", "mixed"], default: "mixed" },
    isActive: { type: Boolean, default: true },
    /** Quy hoạch: tổng số phòng dự kiến của khu (kế hoạch KTX) */
    plannedTotalRooms: { type: Number, default: null },
    /** Quy hoạch: sức chứa tối đa sinh viên của khu */
    plannedCapacity: { type: Number, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

areaSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: { $ne: true } },
    name: "area_name_unique_active",
  }
);

module.exports = mongoose.model("Area", areaSchema);
