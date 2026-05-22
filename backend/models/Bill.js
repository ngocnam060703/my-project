const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    billType: { type: String, enum: ["monthly", "penalty", "damage_reimbursement"], default: "monthly" },
    /** Liên kết vi phạm (hóa đơn phạt kỷ luật) */
    violation: { type: mongoose.Schema.Types.ObjectId, ref: "Violation", default: undefined },
    /** Liên kết khai báo hư hỏng (hóa đơn bồi thường hư hỏng) */
    maintenanceReport: { type: mongoose.Schema.Types.ObjectId, ref: "MaintenanceReport", default: undefined },
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
        planType: { type: String, enum: ["per_use", "monthly_package"], default: "per_use" },
        includedUses: { type: Number, default: 0 },
        usedCount: { type: Number, default: 0 },
        overageCount: { type: Number, default: 0 },
        unitPrice: { type: Number, default: 0 },
      },
    ],
    total: { type: Number, required: true },
    /**
     * unpaid: chưa thanh toán (chuẩn mới) | pending: tương đương unpaid (dữ liệu cũ)
     * paid | overdue
     */
    status: { type: String, enum: ["unpaid", "pending", "paid", "overdue"], default: "unpaid" },
    /** Lịch sử thanh toán / điều chỉnh (hiển thị chi tiết hóa đơn) */
    paymentHistory: [
      {
        at: { type: Date, default: Date.now },
        action: { type: String, enum: ["paid", "created", "adjusted"], default: "paid" },
        method: { type: String, default: "" },
        reference: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String, default: "" },
      },
    ],
    paidAt: { type: Date, default: null },
    /** Mã hóa đơn hiển thị / tra cứu tại quầy */
    billCode: { type: String, default: "", trim: true },
    /** Người thực hiện ghi nhận thanh toán (admin thu quầy hoặc chính SV khi VNPay) */
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    /** manual: xác nhận tay / offline | online: cổng thanh toán (demo) | counter: thu tại quầy */
    paymentMethod: { type: String, enum: ["manual", "online", "counter"], default: undefined },
    paymentReference: { type: String, default: "" },
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
billSchema.index(
  { maintenanceReport: 1 },
  { unique: true, partialFilterExpression: { billType: "damage_reimbursement", maintenanceReport: { $type: "objectId" } } }
);
billSchema.index({ billCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Bill", billSchema);
