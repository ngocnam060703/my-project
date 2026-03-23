const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

exports.getAll = async (req, res) => {
  try {
    const { status, user, month, year, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    const bills = await Bill.find(filter)
      .populate("user", "fullName email phone")
      .populate("room")
      .populate("room.area", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ year: -1, month: -1 });
    const total = await Bill.countDocuments(filter);
    res.json({ bills, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyBills = async (req, res) => {
  try {
    const bills = await Bill.find({ user: req.user._id })
      .populate("room")
      .populate("room.area", "name")
      .sort({ year: -1, month: -1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { contract, month, year, roomFee, electricityFee, waterFee, otherFee, dueDate } = req.body;
    const total = (roomFee || 0) + (electricityFee || 0) + (waterFee || 0) + (otherFee || 0);
    const contractDoc = await Contract.findById(contract).populate("user room");
    if (!contractDoc) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const existing = await Bill.findOne({ contract, month, year });
    if (existing) return res.status(400).json({ message: "Hóa đơn tháng này đã tồn tại" });
    const bill = await Bill.create({
      contract,
      user: contractDoc.user._id,
      room: contractDoc.room._id,
      month,
      year,
      roomFee: roomFee || contractDoc.room.price,
      electricityFee: electricityFee || 0,
      waterFee: waterFee || 0,
      otherFee: otherFee || 0,
      total,
      dueDate: dueDate ? new Date(dueDate) : new Date(year, month - 1, 15),
    });
    const io = getIO();
    io.emit("bill:new", { userId: contractDoc.user._id.toString(), message: "Bạn có hóa đơn mới" });
    await Notification.create({
      user: contractDoc.user._id,
      title: "Hóa đơn mới",
      message: `Bạn có hóa đơn tháng ${month}/${year}, tổng ${total.toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
      type: "bill_reminder",
      link: "/student/my-bills",
    });
    res.status(201).json(await bill.populate(["user", "room", "room.area"]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markPaid = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    const isAdmin = req.user.role === "admin" || req.user.role === "manager";
    if (!isAdmin && bill.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền thanh toán hóa đơn này" });
    }
    bill.status = "paid";
    bill.paidAt = new Date();
    await bill.save();
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
