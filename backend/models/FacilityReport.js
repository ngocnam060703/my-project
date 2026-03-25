const mongoose = require("mongoose");

const facilityReportSchema = new mongoose.Schema(
  {
    facility: { type: mongoose.Schema.Types.ObjectId, ref: "Facility", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "fixing", "done"],
      default: "pending",
    },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FacilityReport", facilityReportSchema);
