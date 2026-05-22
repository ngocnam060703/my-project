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
    priceSnapshot: { type: Number, required: true, min: 0 },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
    /** recorded = đã nhập chỉ số */
    serviceStatus: {
      type: String,
      enum: ["recorded", "pending"],
      default: "recorded",
    },
    /** open = chưa chốt HĐ | closed = đã chốt kỳ */
    billingStatus: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    /** none | unpaid | paid | overdue */
    paymentStatus: {
      type: String,
      enum: ["none", "unpaid", "paid", "overdue"],
      default: "none",
    },
    appliedToBilling: { type: Boolean, default: false },
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "Bill", default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

serviceUsageSchema.index({ room: 1, service: 1, month: 1, year: 1 }, { unique: true, name: "service_usage_room_period" });
serviceUsageSchema.index({ room: 1, month: 1, year: 1 });

module.exports = mongoose.model("ServiceUsage", serviceUsageSchema);
