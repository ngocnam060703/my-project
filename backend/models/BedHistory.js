const mongoose = require("mongoose");

const bedHistorySchema = new mongoose.Schema(
  {
    bed: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", default: null, index: true },
    action: {
      type: String,
      enum: ["assigned", "transferred_in", "transferred_out", "checked_out", "status_changed", "note_updated"],
      required: true,
      index: true,
    },
    fromBedCode: { type: String, default: "" },
    toBedCode: { type: String, default: "" },
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, default: "" },
    note: { type: String, default: "" },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

bedHistorySchema.index({ bed: 1, createdAt: -1 });

module.exports = mongoose.model("BedHistory", bedHistorySchema);

