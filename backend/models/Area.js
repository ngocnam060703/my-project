const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** Phân khu theo giới tính — dùng cho tự phân phòng */
    genderPolicy: { type: String, enum: ["male", "female", "mixed"], default: "mixed" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Area", areaSchema);
