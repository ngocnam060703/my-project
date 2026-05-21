const mongoose = require("mongoose");

const serviceRegistrationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    quantity: { type: Number, default: 1, min: 0 },
    /** hybrid: per_use | monthly_package */
    planType: { type: String, enum: ["per_use", "monthly_package"], default: "per_use" },
    /** Snapshot để giữ đúng đơn giá/quota tại thời điểm đăng ký gói tháng. */
    packagePriceSnapshot: { type: Number, default: 0, min: 0 },
    includedUsesSnapshot: { type: Number, default: 0, min: 0 },
    overageUnitPriceSnapshot: { type: Number, default: 0, min: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceRegistrationSchema.index({ user: 1, service: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("ServiceRegistration", serviceRegistrationSchema);
