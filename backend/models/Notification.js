const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "registration_approved",
        "registration_rejected",
        "bill_reminder",
        "contract_renewal",
        "payment_confirmed",
        "contract_signed",
        "contract_pending_admin_confirm",
        "contract_active",
        "discipline_warning",
        "discipline_admin",
        "discipline_expel",
        "discipline_resolved",
        "general",
      ],
      default: "general",
    },
    link: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
