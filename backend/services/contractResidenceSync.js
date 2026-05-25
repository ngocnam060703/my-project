/**
 * Đồng bộ contract.room / contract.bed với giường occupied thực tế (sau chuyển giường/phòng).
 */
const Contract = require("../models/Contract");
const Bed = require("../models/Bed");
const Registration = require("../models/Registration");

const SYNCABLE_STATUSES = new Set(["active", "pending_payment"]);

/** HĐ chuyển phòng chờ ký: phòng trên HĐ = phòng đích (đơn), không lấy từ giường đang ở phòng cũ. */
function isTransferContractPendingNewRoom(contract) {
  if (!contract) return false;
  const cn = String(contract.contractNumber || "");
  const transferLike = !!(contract.isTransferContract || cn.startsWith("HD-CP"));
  if (!transferLike) return false;
  if (String(contract.status || "") !== "pending_payment") return false;
  return !contract.signedAt && !contract.financialLockedAt;
}

async function alignTransferContractRoomFromRegistration(contract) {
  if (!isTransferContractPendingNewRoom(contract)) return contract;
  const regId = contract.registration?._id || contract.registration;
  if (!regId) return contract;
  const reg = await Registration.findById(regId).select("room").lean();
  if (!reg?.room) return contract;
  const targetRoomId = String(reg.room);
  const currentRoomId = String(contract.room?._id || contract.room || "");
  if (currentRoomId === targetRoomId && !contract.bed) return contract;
  contract.room = reg.room;
  contract.bed = null;
  await contract.save();
  return contract;
}

async function findOccupiedBedForContract(contract) {
  if (!contract?._id) return null;
  const userId = contract.user?._id || contract.user;
  const byContract = await Bed.findOne({
    currentContract: contract._id,
    status: "occupied",
  }).sort({ updatedAt: -1 });
  if (byContract) return byContract;

  if (!userId) return null;
  return Bed.findOne({ currentUser: userId, status: "occupied" }).sort({ updatedAt: -1 });
}

/**
 * Cập nhật HĐ nếu giường đang ở khác phòng ghi trên HĐ.
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function alignContractRoomWithOccupiedBed(contractOrId) {
  const contract =
    contractOrId && contractOrId.room !== undefined
      ? contractOrId
      : await Contract.findById(contractOrId);
  if (!contract || !SYNCABLE_STATUSES.has(String(contract.status))) return contract;

  if (isTransferContractPendingNewRoom(contract)) {
    return alignTransferContractRoomFromRegistration(contract);
  }

  const bed = await findOccupiedBedForContract(contract);
  if (!bed) return contract;

  const bedRoomId = String(bed.room);
  const contractRoomId = String(contract.room);
  let dirty = false;

  if (bedRoomId && bedRoomId !== contractRoomId) {
    contract.room = bed.room;
    dirty = true;
  }
  if (String(contract.bed || "") !== String(bed._id)) {
    contract.bed = bed._id;
    dirty = true;
  }
  if (dirty) await contract.save();
  return contract;
}

/**
 * Đồng bộ phòng/giường trên danh sách HĐ trả về API (admin / sinh viên).
 */
async function alignAndRefreshContractListRows(contractRows) {
  if (!Array.isArray(contractRows) || contractRows.length === 0) return contractRows;

  const targets = contractRows.filter(
    (c) => c && SYNCABLE_STATUSES.has(String(c.status)) && !isTransferContractPendingNewRoom(c)
  );
  const transferPending = contractRows.filter((c) => c && isTransferContractPendingNewRoom(c));
  if (!targets.length && !transferPending.length) return contractRows;

  await Promise.all([
    ...targets.map((c) => alignContractRoomWithOccupiedBed(c._id || c)),
    ...transferPending.map((c) => alignTransferContractRoomFromRegistration(c._id || c)),
  ]);

  const ids = [...targets, ...transferPending].map((c) => c._id).filter(Boolean);
  const refreshed = await Contract.find({ _id: { $in: ids } })
    .select("_id room bed")
    .populate({
      path: "room",
      select: "roomNumber floor area capacity maxCapacity price currentPrice currentOccupancy status",
      populate: { path: "area", select: "name genderPolicy" },
    })
    .populate("bed", "code status room equipmentStatus assignedAt checkInAt")
    .lean();

  const byId = new Map(refreshed.map((r) => [String(r._id), r]));
  return contractRows.map((c) => {
    const row = byId.get(String(c._id));
    if (!row) return c;
    return { ...c, room: row.room ?? c.room, bed: row.bed ?? c.bed };
  });
}

module.exports = {
  alignContractRoomWithOccupiedBed,
  alignTransferContractRoomFromRegistration,
  isTransferContractPendingNewRoom,
  findOccupiedBedForContract,
  alignAndRefreshContractListRows,
};
