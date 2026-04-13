const mongoose = require("mongoose");

/**
 * Chỉ số / tiêu thụ theo tháng (điện, nước…).
 * usage = newIndex - oldIndex; amount = usage * priceSnapshot
 */
const serviceUsageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    oldIndex: { type: Number, required: true, min: 0 },
    newIndex: { type: Number, required: true, min: 0 },
    usage: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    /** Giá tại thời điểm nhập (đồng / kWh hoặc đồng / m³) */
    priceSnapshot: { type: Number, required: true, min: 0 },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
    /** Đã đẩy vào RoomMonthlyCost / hóa đơn (mở rộng sau) */
    appliedToBilling: { type: Boolean, default: false },
  },
  { timestamps: true }
);

serviceUsageSchema.index({ room: 1, service: 1, month: 1, year: 1 }, { unique: true, name: "service_usage_room_period" });

module.exports = mongoose.model("ServiceUsage", serviceUsageSchema);
