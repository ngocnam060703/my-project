const mongoose = require("mongoose");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const Room = require("../models/Room");

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
}

exports.getRoomCosts = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const now = new Date();
    const month = Number(req.query.month || now.getMonth() + 1);
    const year = Number(req.query.year || now.getFullYear());
    const costs = await RoomMonthlyCost.find({ month, year })
      .populate({ path: "room", select: "roomNumber area currentOccupancy", populate: { path: "area", select: "name" } })
      .sort({ createdAt: -1 });
    res.json(costs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.upsertRoomCost = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { roomId, month, year, electricityFee, waterFee, wifiMonthlyFee, note } = req.body;
    if (!mongoose.isValidObjectId(String(roomId || ""))) {
      return res.status(400).json({ message: "roomId không hợp lệ" });
    }
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }

    const doc = await RoomMonthlyCost.findOneAndUpdate(
      { room: roomId, month: m, year: y },
      {
        room: roomId,
        month: m,
        year: y,
        electricityFee: Math.max(0, Number(electricityFee || 0)),
        waterFee: Math.max(0, Number(waterFee || 0)),
        wifiMonthlyFee: Math.max(0, Number(wifiMonthlyFee ?? 0)),
        note: note ? String(note) : "",
        enteredBy: req.user._id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).populate({ path: "room", select: "roomNumber area currentOccupancy", populate: { path: "area", select: "name" } });

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
