const RoomRating = require("../models/RoomRating");
const Contract = require("../models/Contract");

exports.getByRoom = async (req, res) => {
  try {
    const ratings = await RoomRating.find({ room: req.params.roomId })
      .populate("user", "fullName")
      .sort({ createdAt: -1 });
    const avg = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : 0;
    res.json({ ratings, average: Math.round(avg * 10) / 10 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const roomId = req.params.roomId || req.body.room;
    const { rating, comment } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!roomId) {
      return res.status(400).json({ message: "Thiếu roomId để đánh giá phòng." });
    }

    const hasActiveContract = await Contract.exists({
      user: userId,
      room: roomId,
      status: "active",
    });
    if (!hasActiveContract) {
      return res.status(403).json({
        message: "Bạn chỉ có thể đánh giá phòng mình đang lưu trú.",
      });
    }

    const existing = await RoomRating.findOne({ room: roomId, user: userId });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment || existing.comment;
      await existing.save();
      return res.json(existing);
    }
    const r = await RoomRating.create({ room: roomId, user: userId, rating, comment });
    res.status(201).json(await r.populate("user", "fullName"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = exports.createReview;
