const Room = require("../models/Room");
const User = require("../models/User");
const Registration = require("../models/Registration");
const Bill = require("../models/Bill");

exports.getStats = async (req, res) => {
  try {
    const totalRooms = await Room.countDocuments();
    const availableRooms = await Room.countDocuments({ $expr: { $lt: ["$currentOccupancy", "$capacity"] }, status: "available" });
    const fullRooms = await Room.countDocuments({ $expr: { $gte: ["$currentOccupancy", "$capacity"] } });
    const totalStudents = await User.countDocuments({ role: "user" });
    const pendingRegistrations = await Registration.countDocuments({ status: "pending" });
    const pendingBills = await Bill.countDocuments({ status: "pending" });
    const paidBillsThisMonth = await Bill.countDocuments({ status: "paid", paidAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } });

    const roomByArea = await Room.aggregate([
      { $lookup: { from: "areas", localField: "area", foreignField: "_id", as: "areaInfo" } },
      { $unwind: "$areaInfo" },
      { $group: { _id: "$areaInfo.name", total: { $sum: 1 }, available: { $sum: { $cond: [{ $lt: ["$currentOccupancy", "$capacity"] }, 1, 0] } } } },
    ]);

    const revenueByMonth = await Bill.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: { year: "$year", month: "$month" }, total: { $sum: "$total" } } },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 },
    ]);

    const occupancyRate = totalRooms > 0 ? Math.round(((totalRooms - availableRooms) / totalRooms) * 100) : 0;

    res.json({
      totalRooms,
      availableRooms,
      fullRooms,
      totalStudents,
      pendingRegistrations,
      pendingBills,
      paidBillsThisMonth,
      roomByArea,
      revenueByMonth,
      occupancyRate,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
