const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    billType: { type: String, enum: ["monthly", "penalty"], default: "monthly" },
    /** Liên kết vi phạm (hóa đơn phạt) */
    violation: { type: mongoose.Schema.Types.ObjectId, ref: "Violation", default: undefined },
    /** Chi tiết dòng phạt / bồi thường (hiển thị cho SV) */
    penaltyBreakdown: [
      {
        label: { type: String, default: "" },
        amount: { type: Number, default: 0 },
      },
    ],
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    roomFee: { type: Number, required: true, default: 0 },
    electricityFee: { type: Number, default: 0 },
    waterFee: { type: Number, default: 0 },
    otherFee: { type: Number, default: 0 },
    sharedCommonFee: { type: Number, default: 0 },
    personalServiceFee: { type: Number, default: 0 },
    occupants: { type: Number, default: 1, min: 1 },
    commonServiceBreakdown: [
      {
        service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", default: null },
        name: { type: String, default: "" },
        unit: { type: String, default: "" },
        totalAmount: { type: Number, default: 0 },
      },
    ],
    personalServiceBreakdown: [
      {
        service: { type: mongoose.Schema.Types.ObjectId, ref: "Service", default: null },
        name: { type: String, default: "" },
        unit: { type: String, default: "" },
        quantity: { type: Number, default: 1 },
        amount: { type: Number, default: 0 },
      },
    ],
    total: { type: Number, required: true },
    status: { type: String, enum: ["pending", "paid", "overdue"], default: "pending" },
    paidAt: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

billSchema.index(
  { contract: 1, month: 1, year: 1 },
  { unique: true, partialFilterExpression: { billType: "monthly" } }
);
billSchema.index(
  { violation: 1 },
  { unique: true, partialFilterExpression: { billType: "penalty", violation: { $type: "objectId" } } }
);

module.exports = mongoose.model("Bill", billSchema);
