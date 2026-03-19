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

exports.create = async (req, res) => {
  try {
    const { room, rating, comment } = req.body;
    const hasContract = await Contract.findOne({ user: req.user._id, room, status: "active" });
    if (!hasContract) return res.status(403).json({ message: "Chỉ sinh viên đang ở phòng mới được đánh giá" });
    const existing = await RoomRating.findOne({ room, user: req.user._id });
    if (existing) {
      existing.rating = rating;
      existing.comment = comment || existing.comment;
      await existing.save();
      return res.json(existing);
    }
    const r = await RoomRating.create({ room, user: req.user._id, rating, comment });
    res.status(201).json(await r.populate("user", "fullName"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
