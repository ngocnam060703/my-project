const mongoose = require("mongoose");

const roomRatingSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

roomRatingSchema.index({ room: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("RoomRating", roomRatingSchema);
