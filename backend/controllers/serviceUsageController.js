const mongoose = require("mongoose");
const ServiceUsage = require("../models/ServiceUsage");
const Service = require("../models/Service");
const Room = require("../models/Room");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const { validateAndComputeVariableUsage } = require("../services/serviceUsageCalculator");

const ERR_MSG = {
  NEW_INDEX_LT_OLD: "Chỉ số mới phải lớn hơn hoặc bằng chỉ số cũ trong cùng kỳ.",
  OLD_INDEX_LT_PREVIOUS_MONTH_CLOSE: "Chỉ số cũ không được nhỏ hơn chỉ số kết tháng trước (đồng hồ không lùi).",
  INVALID_INDEX: "Chỉ số không hợp lệ.",
  INVALID_PRICE: "Đơn giá dịch vụ không hợp lệ.",
};

/** Đồng bộ tiền điện/nước vào RoomMonthlyCost để hóa đơn tháng dùng chung nguồn. */
async function syncRoomMonthlyUtility({ roomId, month, year, measureUnit, amount, userId }) {
  const m = Number(month);
  const y = Number(year);
  const amt = Math.max(0, Number(amount) || 0);
  const field = measureUnit === "kwh" ? "electricityFee" : measureUnit === "m3" ? "waterFee" : null;
  if (!field) return;
  await RoomMonthlyCost.findOneAndUpdate(
    { room: roomId, month: m, year: y },
    {
      $set: {
        [field]: amt,
        enteredBy: userId,
        note: `Từ chỉ số dịch vụ (${measureUnit})`,
      },
      $setOnInsert: { room: roomId, month: m, year: y },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

exports.list = async (req, res) => {
  try {
    const { room, service, month, year, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (room && mongoose.isValidObjectId(String(room))) filter.room = room;
    if (service && mongoose.isValidObjectId(String(service))) filter.service = service;
    if (month != null && month !== "") filter.month = parseInt(month, 10);
    if (year != null && year !== "") filter.year = parseInt(year, 10);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const p = Math.max(1, parseInt(page, 10));
    const rows = await ServiceUsage.find(filter)
      .populate("room", "roomNumber")
      .populate("service", "name measureUnit tariffType price")
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip((p - 1) * lim)
      .limit(lim)
      .lean();
    const total = await ServiceUsage.countDocuments(filter);
    res.json({ items: rows, total, page: p, limit: lim });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { room, service, month, year, oldIndex, newIndex, note } = req.body;
    if (!mongoose.isValidObjectId(String(room)) || !mongoose.isValidObjectId(String(service))) {
      return res.status(400).json({ message: "room và service không hợp lệ" });
    }
    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) return res.status(400).json({ message: "Tháng/năm không hợp lệ" });

    const [svc, rm] = await Promise.all([Service.findById(service), Room.findById(room)]);
    if (!svc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    if (!rm) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (svc.tariffType !== "variable") {
      return res.status(400).json({ message: "Chỉ nhập chỉ số cho dịch vụ loại variable (theo chỉ số)" });
    }
    if (svc.measureUnit !== "kwh" && svc.measureUnit !== "m3") {
      return res.status(400).json({ message: "Dịch vụ phải có measureUnit là kwh hoặc m3" });
    }
    if (!svc.isActive) return res.status(400).json({ message: "Dịch vụ đang tắt" });

    const dup = await ServiceUsage.findOne({ room, service, month: m, year: y });
    if (dup) return res.status(400).json({ message: "Kỳ này đã có chỉ số cho phòng + dịch vụ" });

    let usage;
    let amount;
    try {
      const r = await validateAndComputeVariableUsage({
        roomId: room,
        serviceId: service,
        month: m,
        year: y,
        oldIndex,
        newIndex,
        pricePerUnit: svc.price,
      });
      usage = r.usage;
      amount = r.amount;
    } catch (err) {
      const code = err?.message;
      return res.status(400).json({ message: ERR_MSG[code] || code || "Dữ liệu chỉ số không hợp lệ" });
    }

    const doc = await ServiceUsage.create({
      room,
      service,
      month: m,
      year: y,
      oldIndex: Number(oldIndex),
      newIndex: Number(newIndex),
      usage,
      amount,
      priceSnapshot: Number(svc.price),
      enteredBy: req.user._id,
      note: note != null ? String(note) : "",
    });

    await syncRoomMonthlyUtility({
      roomId: room,
      month: m,
      year: y,
      measureUnit: svc.measureUnit,
      amount,
      userId: req.user._id,
    });

    const out = await ServiceUsage.findById(doc._id)
      .populate("room", "roomNumber area")
      .populate("service", "name measureUnit price");
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
