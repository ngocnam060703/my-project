const Service = require("../models/Service");
const RoomService = require("../models/RoomService");
const ServiceRegistration = require("../models/ServiceRegistration");

/** DV đồng hồ (kWh/m³) đã gán cho phòng qua RoomService. */
async function loadMeterServicesAssignedToRoom(roomId) {
  if (!roomId) return { electricity: null, water: null };
  const links = await RoomService.find({ room: roomId, isActive: { $ne: false } }).select("service").lean();
  const serviceIds = links.map((l) => l.service).filter(Boolean);
  if (!serviceIds.length) return { electricity: null, water: null };
  const services = await Service.find({
    _id: { $in: serviceIds },
    isActive: true,
    measureUnit: { $in: ["kwh", "m3"] },
  }).lean();
  return {
    electricity: services.find((s) => s.measureUnit === "kwh") || null,
    water: services.find((s) => s.measureUnit === "m3") || null,
  };
}

/** Chỉ lấy tổng điện/nước khi phòng đã gán DV tương ứng. */
function applyRoomMeterAssignment(meters, electricityRaw, waterRawIn) {
  const elecRaw = Number(electricityRaw || 0);
  const waterAmt = Number(waterRawIn || 0);
  return {
    electricityTotal: meters.electricity && elecRaw > 0 ? Math.round(elecRaw) : 0,
    waterTotal: meters.water && waterAmt > 0 ? Math.round(waterAmt) : 0,
  };
}

/**
 * Chia tiền điện/nước: chỉ SV đã đăng ký (enabled) dịch vụ đồng hồ trong kỳ mới bị tính.
 * @returns {(contract: object) => { electShare: number, waterShare: number }}
 */
async function buildUtilityShareResolver(contracts, { electricityTotal, waterTotal, meters, month, year }) {
  const userIds = contracts.map((c) => c.user._id || c.user);
  const shares = new Map();
  for (const c of contracts) {
    shares.set(String(c.user._id || c.user), { electShare: 0, waterShare: 0 });
  }

  async function applyForService(serviceDoc, utilityTotal, field) {
    if (!serviceDoc || utilityTotal <= 0) return;
    const regs = await ServiceRegistration.find({
      user: { $in: userIds },
      service: serviceDoc._id,
      month: Number(month),
      year: Number(year),
      enabled: true,
    })
      .select("user")
      .lean();
    if (!regs.length) return;
    const share = utilityTotal / regs.length;
    for (const r of regs) {
      const uid = String(r.user);
      const row = shares.get(uid) || { electShare: 0, waterShare: 0 };
      row[field] = share;
      shares.set(uid, row);
    }
  }

  await applyForService(meters.electricity, electricityTotal, "electShare");
  await applyForService(meters.water, waterTotal, "waterShare");

  return (contract) => {
    const uid = String(contract.user._id || contract.user);
    return shares.get(uid) || { electShare: 0, waterShare: 0 };
  };
}

module.exports = {
  loadMeterServicesAssignedToRoom,
  applyRoomMeterAssignment,
  buildUtilityShareResolver,
};
