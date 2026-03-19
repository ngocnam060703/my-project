const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    roomFee: { type: Number, required: true, default: 0 },
    electricityFee: { type: Number, default: 0 },
    waterFee: { type: Number, default: 0 },
    otherFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { type: String, enum: ["pending", "paid", "overdue"], default: "pending" },
    paidAt: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

billSchema.index({ contract: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("Bill", billSchema);
