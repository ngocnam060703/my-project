const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const BedHistory = require("../models/BedHistory");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const { recountRoomOccupancyForRoom } = require("./roomOccupancySync");

async function decrementRoomOccupancy(roomId) {
  if (!roomId) return;
  await recountRoomOccupancyForRoom(roomId);
}

/**
 * Giải phóng một giường đang có người/HĐ — ghi BedHistory checked_out.
 */
async function clearOccupiedBedDocument(bed, performedBy, note) {
  if (!bed) return { ok: false };
  const userId = bed.currentUser;
  const contractId = bed.currentContract;
  const fromCode = bed.code;
  const fromStatus = bed.status;

  bed.status = "available";
  bed.currentUser = null;
  bed.currentContract = null;
  bed.checkInAt = null;
  bed.assignedAt = null;
  await bed.save();

  if (contractId) {
    await Contract.updateOne({ _id: contractId }, { $set: { bed: null } });
  }

  await BedHistory.create({
    bed: bed._id,
    room: bed.room,
    user: userId || null,
    contract: contractId || null,
    action: "checked_out",
    fromBedCode: fromCode,
    fromStatus,
    toStatus: "available",
    note: note || "",
    performedBy: performedBy || null,
  });
  return { ok: true };
}

async function releaseBedForContractId(contractId, performedBy, note) {
  if (!mongoose.isValidObjectId(contractId)) return { released: false };
  const cid = String(contractId);
  const bed = await Bed.findOne({ currentContract: cid });
  if (!bed) {
    await Contract.updateOne({ _id: cid }, { $set: { bed: null } });
    return { released: false };
  }
  await clearOccupiedBedDocument(bed, performedBy, note);
  return { released: true };
}

/**
 * Hợp đồng active nhưng đã quá endDate → expired + nhả giường + giảm occupancy phòng.
 */
async function syncExpiredActiveContracts(limit = 80) {
  const now = new Date();
  const list = await Contract.find({
    status: "active",
    endDate: { $lt: now },
  })
    .limit(limit)
    .lean();

  let count = 0;
  for (const c of list) {
    const hasRenewalSuccessor = await Contract.exists({
      renewedFromContract: c._id,
      status: { $in: ["upcoming", "active", "pending_payment"] },
    });
    if (hasRenewalSuccessor) {
      await Contract.updateOne({ _id: c._id, status: "active" }, { $set: { status: "completed" } });
      count += 1;
      continue;
    }
    await releaseBedForContractId(c._id, null, "Tự động: hết hạn hợp đồng");
    await Contract.updateOne({ _id: c._id }, { $set: { status: "expired", bed: null } });
    await recountRoomOccupancyForRoom(c.room);
    count += 1;
  }
  return count;
}

async function countTakenSlots(roomId) {
  return Bed.countDocuments({
    room: roomId,
    status: { $in: ["occupied", "reserved"] },
  });
}

module.exports = {
  decrementRoomOccupancy,
  clearOccupiedBedDocument,
  releaseBedForContractId,
  syncExpiredActiveContracts,
  countTakenSlots,
};
