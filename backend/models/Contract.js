const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema(
  {
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", default: null },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    bed: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", default: null, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "upcoming",
        "active",
        "completed",
        "expired",
        "terminated",
        "transferred_settled",
        "terminated_due_to_transfer",
        "cancelled",
      ],
      default: "pending_payment",
    },
    contractNumber: { type: String, unique: true },
    terms: { type: String, default: "" },
    signedAt: { type: Date, default: null },
    studentSignStatus: {
      type: String,
      enum: ["pending", "student_signed"],
      default: "pending",
    },
    studentConfirmedAt: { type: Date, default: null },
    studentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    studentSignIp: { type: String, default: "" },
    studentSignUserAgent: { type: String, default: "" },
    consentAcceptedAt: { type: Date, default: null },
    consentTextVersion: { type: String, default: "v1-click-wrap-ktx" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    paymentConfirmedAt: { type: Date, default: null },
    paymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    adminReviewedAt: { type: Date, default: null },
    adminReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    signedPdfUrl: { type: String, default: "" },
    signedPdfUploadedAt: { type: Date, default: null },
    signedPdfUploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelReason: { type: String, default: "" },
    contractPrice: { type: Number, min: 0 },
    roomCurrentPriceSnapshot: { type: Number, min: 0 },
    roomCapacityAtSigning: { type: Number, min: 1 },
    priorityPolicyType: { type: String, default: "normal" },
    priorityDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    baseSlotPriceBeforeDiscount: { type: Number, min: 0 },
    monthlyRent: { type: Number, default: null },
    depositAmount: { type: Number, default: null },
    financialLockedAt: { type: Date, default: null },
    renewedFromContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
    isRenewalContract: { type: Boolean, default: false },
    renewalConsentAt: { type: Date, default: null },
    renewalConsentIp: { type: String, default: "" },
    renewalConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    renewalConsentUserAgent: { type: String, default: "" },
    renewalConsentTextVersion: { type: String, default: "" },
    transferredFromContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null },
    isTransferContract: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Mongoose 9+: middleware async — không gọi next(). */
contractSchema.pre("save", async function () {
  const { revertLockedPricingFieldsOnSave } = require("../services/contractPricing");
  await revertLockedPricingFieldsOnSave(this);
});

/** Mongoose 9+: query middleware async — không dùng tham số next. */
async function guardPricingOnQueryUpdate() {
  const { assertContractPricingUpdateAllowed, pricingFieldsInUpdate } = require("../services/contractPricing");
  const update = this.getUpdate();
  if (!pricingFieldsInUpdate(update)?.length) return;
  const doc = await this.model.findOne(this.getQuery()).lean();
  if (doc) assertContractPricingUpdateAllowed(doc, update);
}

contractSchema.pre("updateOne", guardPricingOnQueryUpdate);
contractSchema.pre("findOneAndUpdate", guardPricingOnQueryUpdate);

module.exports = mongoose.model("Contract", contractSchema);
