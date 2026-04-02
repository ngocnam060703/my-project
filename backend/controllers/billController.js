const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const Service = require("../models/Service");
const ServiceRegistration = require("../models/ServiceRegistration");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const Room = require("../models/Room");
const { getIO } = require("../socket");

async function buildPersonalFeeForUser({ userId, month, year }) {
  const personalServices = await Service.find({ type: "personal", isActive: true });
  if (!personalServices.length) return { total: 0, breakdown: [] };

  const serviceIds = personalServices.map((s) => s._id);
  const exactRegs = await ServiceRegistration.find({
    user: userId,
    month,
    year,
    service: { $in: serviceIds },
  }).populate("service");

  const exactByService = new Map();
  for (const r of exactRegs) {
    exactByService.set(String(r.service?._id || r.service), r);
  }

  const breakdown = [];
  let total = 0;
  for (const svc of personalServices) {
    const sid = String(svc._id);
    let reg = exactByService.get(sid);

    // Dịch vụ theo tháng: nếu chưa có bản ghi tháng này, lấy đăng ký gần nhất trước đó.
    if (!reg && svc.unit === "monthly") {
      reg = await ServiceRegistration.findOne({
        user: userId,
        service: svc._id,
        $or: [{ year: { $lt: year } }, { year, month: { $lte: month } }],
      })
        .sort({ year: -1, month: -1 })
        .populate("service");
    }

    if (!reg) continue;
    let amount = 0;
    let quantity = Number(reg.quantity || 1);
    if (svc.unit === "monthly") {
      amount = reg.enabled ? Number(svc.price || 0) : 0;
      quantity = 1;
    } else {
      amount = Number(svc.price || 0) * Math.max(0, quantity);
    }
    if (amount <= 0) continue;
    total += amount;
    breakdown.push({
      service: svc._id,
      name: svc.name,
      unit: svc.unit,
      quantity,
      amount,
    });
  }

  return { total, breakdown };
}

/** Ghi điện/nước đã dùng khi lập HĐ vào RoomMonthlyCost để màn phòng & sinh hàng loạt luôn khớp. */
async function syncRoomMonthlyUtilityCost({ roomId, month, year, electricityFee, waterFee, userId }) {
  const m = Number(month);
  const y = Number(year);
  const elec = Math.max(0, Number(electricityFee || 0));
  const water = Math.max(0, Number(waterFee || 0));
  await RoomMonthlyCost.findOneAndUpdate(
    { room: roomId, month: m, year: y },
    {
      $set: {
        electricityFee: elec,
        waterFee: water,
        enteredBy: userId,
      },
      $setOnInsert: {
        room: roomId,
        month: m,
        year: y,
        note: "",
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, month, year, billType, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (billType === "monthly" || billType === "penalty") filter.billType = billType;
    const bills = await Bill.find(filter)
      .populate("user", "fullName email phone")
      .populate("room")
      .populate("room.area", "name")
      .populate("violation", "ruleName description fineAmount compensationAmount createdAt")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ year: -1, month: -1, createdAt: -1 });
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
      .populate("violation", "ruleName description fineAmount compensationAmount createdAt")
      .sort({ year: -1, month: -1, createdAt: -1 });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { contract, roomId, month, year, electricityFee, waterFee, otherFee, dueDate } = req.body;
    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    const due = dueDate ? new Date(dueDate) : new Date(y, m - 1, 15);

    // Luồng mới: tạo hóa đơn theo phòng (khuyến nghị dùng trên UI admin)
    if (roomId) {
      if (!mongoose.isValidObjectId(String(roomId))) {
        return res.status(400).json({ message: "roomId không hợp lệ" });
      }
      const room = await Room.findById(roomId);
      if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

      const contracts = await Contract.find({
        room: roomId,
        status: { $in: ["active", "pending_payment"] },
      })
        .populate("user", "fullName email")
        .populate("room", "price roomNumber area");
      if (!contracts.length) {
        return res.status(400).json({ message: "Phòng chưa có sinh viên có hợp đồng hiệu lực" });
      }

      const occupants = Math.max(1, contracts.length);
      const roomCost = await RoomMonthlyCost.findOne({ room: roomId, month: m, year: y });
      const roomFeeTotal = Number(room.price || 0);
      const electricityTotal = electricityFee != null ? Number(electricityFee) : Number(roomCost?.electricityFee || 0);
      const waterTotal = waterFee != null ? Number(waterFee) : Number(roomCost?.waterFee || 0);
      const fixedOther = Math.max(0, Number(otherFee || 0));

      const commonServices = await Service.find({ type: "common", isActive: true });
      const commonBreakdown = [];
      let commonTotal = 0;
      for (const s of commonServices) {
        if (String(s.name || "").toLowerCase().includes("tiền phòng")) continue;
        const amt = Number(s.price || 0);
        commonTotal += amt;
        commonBreakdown.push({ service: s._id, name: s.name, unit: s.unit, totalAmount: amt });
      }

      await syncRoomMonthlyUtilityCost({
        roomId,
        month: m,
        year: y,
        electricityFee: electricityTotal,
        waterFee: waterTotal,
        userId: req.user._id,
      });

      const io = getIO();
      let created = 0;
      let skipped = 0;
      const createdBills = [];
      for (const c of contracts) {
        const exists = await Bill.findOne({ contract: c._id, month: m, year: y });
        if (exists) {
          skipped += 1;
          continue;
        }
        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month: m, year: y });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;

        const sharedTotal = roomFeeTotal + electricityTotal + waterTotal + commonTotal + fixedOther;
        const sharedPerStudent = sharedTotal / occupants;
        const total = sharedPerStudent + personalTotal;

        const bill = await Bill.create({
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month: m,
          year: y,
          roomFee: roomFeeTotal / occupants,
          electricityFee: electricityTotal / occupants,
          waterFee: waterTotal / occupants,
          otherFee: fixedOther / occupants,
          sharedCommonFee: commonTotal / occupants,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total,
          dueDate: due,
          status: "pending",
          note: `Công thức: (Phòng + Điện + Nước + Dịch vụ chung) / ${occupants} + dịch vụ cá nhân`,
        });
        created += 1;
        createdBills.push(bill);

        io.emit("bill:new", { userId: String(c.user._id), message: "Bạn có hóa đơn mới" });
        await Notification.create({
          user: c.user._id,
          title: "Hóa đơn mới",
          message: `Bạn có hóa đơn tháng ${m}/${y}, tổng ${Math.round(total).toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
          type: "bill_reminder",
          link: "/student/my-bills",
        });
      }
      return res.status(201).json({ created, skipped, bills: createdBills });
    }

    // Luồng cũ: tạo cho 1 hợp đồng
    const total = Number(req.body?.roomFee || 0) + Number(electricityFee || 0) + Number(waterFee || 0) + Number(otherFee || 0);
    const contractDoc = await Contract.findById(contract).populate("user room");
    if (!contractDoc) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const existing = await Bill.findOne({ contract, month: m, year: y });
    if (existing) return res.status(400).json({ message: "Hóa đơn tháng này đã tồn tại" });
    const bill = await Bill.create({
      contract,
      user: contractDoc.user._id,
      room: contractDoc.room._id,
      month: m,
      year: y,
      roomFee: Number(req.body?.roomFee || contractDoc.room.price || 0),
      electricityFee: Number(electricityFee || 0),
      waterFee: Number(waterFee || 0),
      otherFee: Number(otherFee || 0),
      total,
      dueDate: due,
    });
    await syncRoomMonthlyUtilityCost({
      roomId: contractDoc.room._id,
      month: m,
      year: y,
      electricityFee: Number(electricityFee || 0),
      waterFee: Number(waterFee || 0),
      userId: req.user._id,
    });
    const io = getIO();
    io.emit("bill:new", { userId: String(contractDoc.user._id), message: "Bạn có hóa đơn mới" });
    await Notification.create({
      user: contractDoc.user._id,
      title: "Hóa đơn mới",
      message: `Bạn có hóa đơn tháng ${m}/${y}, tổng ${total.toLocaleString("vi-VN")}đ. Vui lòng thanh toán đúng hạn.`,
      type: "bill_reminder",
      link: "/student/my-bills",
    });
    res.status(201).json(await bill.populate(["user", "room", "room.area"]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateByMonth = async (req, res) => {
  try {
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : new Date(year, month - 1, 15);
    if (!(month >= 1 && month <= 12) || year < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }

    const contracts = await Contract.find({ status: { $in: ["active", "pending_payment"] } })
      .populate("room", "price roomNumber area")
      .populate("user", "fullName email");
    if (!contracts.length) return res.json({ created: 0, skipped: 0, message: "Không có hợp đồng đang hiệu lực" });

    const commonServices = await Service.find({ type: "common", isActive: true });
    const roomCosts = await RoomMonthlyCost.find({ month, year });
    const roomCostMap = new Map(roomCosts.map((c) => [String(c.room), c]));

    const byRoom = new Map();
    for (const c of contracts) {
      const k = String(c.room?._id || c.room);
      if (!byRoom.has(k)) byRoom.set(k, []);
      byRoom.get(k).push(c);
    }

    let created = 0;
    let skipped = 0;
    const io = getIO();

    for (const list of byRoom.values()) {
      const room = list[0].room;
      const occupants = Math.max(1, list.length);
      const roomCost = roomCostMap.get(String(room._id));
      const roomFeeTotal = Number(room?.price || 0);
      const electricityTotal = Number(roomCost?.electricityFee || 0);
      const waterTotal = Number(roomCost?.waterFee || 0);

      const commonBreakdown = [];
      let commonTotal = 0;
      for (const s of commonServices) {
        if (String(s.name || "").toLowerCase().includes("tiền phòng")) continue;
        const amt = Number(s.price || 0);
        commonTotal += amt;
        commonBreakdown.push({
          service: s._id,
          name: s.name,
          unit: s.unit,
          totalAmount: amt,
        });
      }

      const sharedTotal = roomFeeTotal + electricityTotal + waterTotal + commonTotal;
      const sharedPerStudent = sharedTotal / occupants;

      for (const c of list) {
        const exists = await Bill.findOne({ contract: c._id, month, year });
        if (exists) {
          skipped += 1;
          continue;
        }

        const personal = await buildPersonalFeeForUser({ userId: c.user._id, month, year });
        const personalBreakdown = personal.breakdown;
        const personalTotal = personal.total;

        const total = sharedPerStudent + personalTotal;
        const bill = await Bill.create({
          contract: c._id,
          user: c.user._id,
          room: room._id,
          month,
          year,
          roomFee: roomFeeTotal / occupants,
          electricityFee: electricityTotal / occupants,
          waterFee: waterTotal / occupants,
          otherFee: 0,
          sharedCommonFee: commonTotal / occupants,
          personalServiceFee: personalTotal,
          occupants,
          commonServiceBreakdown: commonBreakdown,
          personalServiceBreakdown: personalBreakdown,
          total,
          dueDate,
          status: "pending",
          note: `Công thức: (Phòng + Điện + Nước + Dịch vụ chung) / ${occupants} + dịch vụ cá nhân`,
        });
        created += 1;

        io.emit("bill:new", {
          userId: String(c.user._id),
          message: `Bạn có hóa đơn tháng ${month}/${year}`,
        });
        await Notification.create({
          user: c.user._id,
          title: "Hóa đơn mới",
          message: `Bạn có hóa đơn tháng ${month}/${year}, tổng ${Math.round(total).toLocaleString("vi-VN")}đ.`,
          type: "bill_reminder",
          link: "/student/my-bills",
        });
      }
    }

    res.json({ created, skipped });
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
