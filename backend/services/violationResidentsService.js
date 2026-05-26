/**
 * Sinh viên đang ở phòng theo HĐ active hiệu lực — trang vi phạm kỷ luật.
 * Ưu tiên giường occupied / phòng đích đơn chuyển phòng, không sync nhầm về phòng cũ.
 */
const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
const Registration = require("../models/Registration");
const { contractIsEffectiveResident } = require("./roomOccupancySync");
const { isTransferContractLike } = require("./contractPricing");

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Phòng hiệu lực trên HĐ: giường occupied → đơn chuyển phòng → đơn KTX approved → contract.room.
 */
async function resolveContractLivingRoomId(contract) {
  if (!contract) return null;
  const contractId = contract._id;
  const userId = contract.user?._id || contract.user;

  const bed = await Bed.findOne({
    status: "occupied",
    $or: [
      ...(contractId ? [{ currentContract: contractId }] : []),
      ...(userId ? [{ currentUser: userId }] : []),
    ],
  })
    .sort({ updatedAt: -1 })
    .select("room")
    .lean();
  if (bed?.room) return String(bed.room);

  if (isTransferContractLike(contract) && contract.registration) {
    const reg = await Registration.findById(contract.registration).select("room").lean();
    if (reg?.room) return String(reg.room);
  }

  const appId = contract.application?._id || contract.application;
  if (appId) {
    const app = await Application.findById(appId).select("assignedRoom status").lean();
    if (app?.assignedRoom && String(app.status) === "approved") {
      return String(app.assignedRoom);
    }
  }

  const onContract = String(contract.room?._id || contract.room || "");
  return onContract || null;
}

const {
  resolveContractEntitledRoomId,
  alignContractRoomToEntitledRoom,
} = require("./contractResidenceSync");

/**
 * HĐ active hiệu lực của SV đang ở phòng roomId.
 */
async function findEffectiveResidenceInRoom(userId, roomId) {
  const today = startOfDay(new Date());
  const contracts = await Contract.find({
    user: userId,
    status: "active",
    endDate: { $gte: today },
  })
    .sort({ createdAt: -1 })
    .lean();

  const roomKey = String(roomId);
  for (const c of contracts) {
    if (!contractIsEffectiveResident(c)) continue;
    const living = await resolveContractLivingRoomId(c);
    if (living === roomKey) return c;
  }
  return null;
}

async function activeLivingRoomForUser(userId, today) {
  const active = await Contract.findOne({
    user: userId,
    status: "active",
    endDate: { $gte: today },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!active || !contractIsEffectiveResident(active)) return null;
  return resolveContractLivingRoomId(active);
}

function pushResident(residents, seen, c, user) {
  const uid = String(user._id || user);
  if (seen.has(uid)) return;
  seen.add(uid);
  residents.push({
    contractId: c._id,
    contractNumber: c.contractNumber,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    user,
  });
}

/**
 * Danh sách SV trong phòng — HĐ active hiệu lực, phòng ghi trên HĐ (contract.room).
 */
async function listResidentsForViolationByRoom(roomId) {
  if (!mongoose.isValidObjectId(String(roomId || ""))) return [];

  const { listActiveEffectiveResidentsByContractRoom } = require("./roomResidentsListService");
  const rows = await listActiveEffectiveResidentsByContractRoom([roomId], {
    userSelect: "fullName studentId email phone gender",
  });

  return rows.map((r) => ({
    contractId: r.contractId,
    contractNumber: r.contractNumber,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    user: r.user,
  }));
}

module.exports = {
  listResidentsForViolationByRoom,
  findEffectiveResidenceInRoom,
  resolveContractLivingRoomId,
  resolveContractEntitledRoomId,
  alignContractRoomToEntitledRoom,
};
