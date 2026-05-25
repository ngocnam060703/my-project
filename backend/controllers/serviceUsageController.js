const mongoose = require("mongoose");
const ServiceUsage = require("../models/ServiceUsage");
const Service = require("../models/Service");
const Room = require("../models/Room");
const RoomMonthlyCost = require("../models/RoomMonthlyCost");
const { validateAndComputeVariableUsage } = require("../services/serviceUsageCalculator");
const {
  isMeterPeriodClosed,
  getRoomPeriodBillingSummary,
  enrichServiceUsageRows,
} = require("../services/meterBillingService");
const { loadMeterServicesAssignedToRoom } = require("../services/roomUtilityBilling");

const ERR_MSG = {
  NEW_INDEX_LT_OLD: "Chỉ số mới phải lớn hơn hoặc bằng chỉ số cũ trong cùng kỳ.",
  OLD_INDEX_LT_PREVIOUS_MONTH_CLOSE: "Chỉ số cũ không được nhỏ hơn chỉ số kết tháng trước (đồng hồ không lùi).",
  INVALID_INDEX: "Chỉ số không hợp lệ.",
  INVALID_PRICE: "Đơn giá dịch vụ không hợp lệ.",
  PERIOD_CLOSED: "Kỳ điện nước này đã được chốt hóa đơn — không thể chỉnh sửa chỉ số.",
};

async function recalcRoomMonthlyUtilityFees(roomId, month, year, userId) {
  const m = Number(month);
  const y = Number(year);
  const meters = await loadMeterServicesAssignedToRoom(roomId);
  const usages = await ServiceUsage.find({ room: roomId, month: m, year: y })
    .populate("service", "measureUnit")
    .lean();
  let electricityTotal = 0;
  let waterTotal = 0;
  for (const u of usages) {
    const mu = u.service?.measureUnit;
    const sid = String(u.service?._id || u.service || "");
    if (mu === "kwh" && meters.electricity && String(meters.electricity._id) === sid) {
      electricityTotal += Number(u.amount) || 0;
    }
    if (mu === "m3" && meters.water && String(meters.water._id) === sid) {
      waterTotal += Number(u.amount) || 0;
    }
  }
  await RoomMonthlyCost.findOneAndUpdate(
    { room: roomId, month: m, year: y },
    {
      $set: {
        electricityFee: electricityTotal,
        waterFee: waterTotal,
        enteredBy: userId,
        note: "Tổng từ chỉ số dịch vụ (điện/nước)",
      },
      $setOnInsert: { room: roomId, month: m, year: y },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

exports.periodStatus = async (req, res) => {
  try {
    const { room, month, year } = req.query;
    if (!mongoose.isValidObjectId(String(room))) {
      return res.status(400).json({ message: "room không hợp lệ" });
    }
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    const summary = await getRoomPeriodBillingSummary(room, m, y);
    const usageCount = await ServiceUsage.countDocuments({ room, month: m, year: y });
    res.json({ ...summary, usageCount });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { room, service, month, year, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (room && mongoose.isValidObjectId(String(room))) filter.room = room;
    if (service && mongoose.isValidObjectId(String(service))) filter.service = service;
    if (month != null && month !== "") filter.month = parseInt(month, 10);
    if (year != null && year !== "") filter.year = parseInt(year, 10);

    const lim = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const p = Math.max(1, parseInt(page, 10));
    const rows = await ServiceUsage.find(filter)
      .populate("room", "roomNumber")
      .populate("service", "name measureUnit tariffType price")
      .populate("bill", "billCode status")
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip((p - 1) * lim)
      .limit(lim)
      .lean();

    const items = await enrichServiceUsageRows(rows);
    const total = await ServiceUsage.countDocuments(filter);
    res.json({ items, total, page: p, limit: lim });
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

    if (await isMeterPeriodClosed(room, m, y)) {
      return res.status(409).json({ message: ERR_MSG.PERIOD_CLOSED });
    }

    const [svc, rm] = await Promise.all([Service.findById(service), Room.findById(room)]);
    if (!svc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    if (!rm) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (svc.measureUnit !== "kwh" && svc.measureUnit !== "m3") {
      return res.status(400).json({ message: "Dịch vụ phải có measureUnit là kwh hoặc m3 (điện/nước)" });
    }
    if (!svc.isActive) return res.status(400).json({ message: "Dịch vụ đang tắt" });
    if (svc.tariffType !== "variable") {
      svc.tariffType = "variable";
      await svc.save();
    }

    const dup = await ServiceUsage.findOne({ room, service, month: m, year: y });
    if (dup) {
      return res.status(400).json({
        message: dup.billingStatus === "closed" || dup.appliedToBilling
          ? ERR_MSG.PERIOD_CLOSED
          : "Kỳ này đã có chỉ số cho phòng + dịch vụ",
      });
    }

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
      serviceStatus: "recorded",
      billingStatus: "open",
      paymentStatus: "none",
    });

    await recalcRoomMonthlyUtilityFees(room, m, y, req.user._id);

    const out = await ServiceUsage.findById(doc._id)
      .populate("room", "roomNumber area")
      .populate("service", "name measureUnit price")
      .lean();
    const [enriched] = await enrichServiceUsageRows([out]);
    res.status(201).json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
