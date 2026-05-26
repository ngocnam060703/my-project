/**
 * Đồng bộ contract.room / contract.bed với giường occupied thực tế (sau chuyển giường/phòng).
 */
const Contract = require("../models/Contract");
const Bed = require("../models/Bed");
const Registration = require("../models/Registration");
const Room = require("../models/Room");
const Application = require("../models/Application");

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

async function resolveContractDocument(contractOrId) {
  if (!contractOrId) return null;
  if (typeof contractOrId === "object" && contractOrId.status != null) {
    if (typeof contractOrId.save === "function") return contractOrId;
    if (contractOrId._id) return Contract.findById(contractOrId._id);
    return null;
  }
  return Contract.findById(contractOrId);
}

async function alignTransferContractRoomFromRegistration(contractOrId) {
  const contract = await resolveContractDocument(contractOrId);
  if (!contract || !isTransferContractPendingNewRoom(contract)) return contract;
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

  if (isKtxApplicationContract(contract)) {
    return alignKtxApplicationContractRoom(contract);
  }

  const { isTransferContractLike } = require("./contractPricing");
  if (
    isTransferContractLike(contract) &&
    String(contract.status) === "active" &&
    contract.registration
  ) {
    const reg = await Registration.findById(contract.registration).select("room").lean();
    const targetId = reg?.room ? String(reg.room) : "";
    if (targetId) {
      const bed = await findOccupiedBedForContract(contract);
      const bedRoomId = bed?.room ? String(bed.room) : "";
      if (!bed || bedRoomId === targetId) {
        let dirty = false;
        if (String(contract.room) !== targetId) {
          contract.room = reg.room;
          dirty = true;
        }
        if (bed && bedRoomId === targetId && String(contract.bed || "") !== String(bed._id)) {
          contract.bed = bed._id;
          dirty = true;
        }
        if (bed && bedRoomId !== targetId) {
          contract.bed = null;
          dirty = true;
        }
        if (dirty) await contract.save();
        return contract;
      }
    }
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
/**
 * Tìm phòng thực cho HĐ (ký / hiển thị): contract.room → đơn chuyển → đơn đăng ký.
 * Cập nhật contract.room nếu tìm được phòng hợp lệ.
 */
async function resolveContractRoomDocument(contractOrId) {
  const contract = await resolveContractDocument(contractOrId);
  if (!contract) return { contract: null, roomDoc: null };

  const tryRoomId = async (roomId) => {
    if (!roomId) return null;
    return Room.findById(roomId);
  };

  const entitledId = await resolveContractEntitledRoomId(contract);
  if (entitledId) {
    const entitledRoom = await tryRoomId(entitledId);
    if (entitledRoom) {
      let dirty = false;
      if (String(contract.room?._id || contract.room || "") !== entitledId) {
        contract.room = entitledId;
        dirty = true;
      }
      if (isKtxApplicationContract(contract) && contract.bed) {
        const bedDoc = await Bed.findById(contract.bed).select("room").lean();
        if (!bedDoc || String(bedDoc.room) !== entitledId) {
          contract.bed = null;
          dirty = true;
        }
      }
      if (dirty) await contract.save();
      return { contract, roomDoc: entitledRoom };
    }
  }

  let roomDoc = await tryRoomId(contract.room?._id || contract.room);
  if (roomDoc) return { contract, roomDoc };

  if (isTransferContractPendingNewRoom(contract) || contract.registration) {
    await alignTransferContractRoomFromRegistration(contract);
    roomDoc = await tryRoomId(contract.room);
    if (roomDoc) return { contract, roomDoc };

    const regId = contract.registration?._id || contract.registration;
    if (regId) {
      const reg = await Registration.findById(regId).select("room").lean();
      if (reg?.room) {
        roomDoc = await tryRoomId(reg.room);
        if (roomDoc) {
          contract.room = reg.room;
          await contract.save();
          return { contract, roomDoc };
        }
      }
    }
  }

  const appId = contract.application?._id || contract.application;
  if (appId) {
    const app = await Application.findById(appId).select("assignedRoom").lean();
    if (app?.assignedRoom) {
      roomDoc = await tryRoomId(app.assignedRoom);
      if (roomDoc) {
        contract.room = app.assignedRoom;
        contract.bed = null;
        await contract.save();
        return { contract, roomDoc };
      }
    }
  }

  return { contract, roomDoc: null };
}

/**
 * Phòng SV được phép ở theo HĐ (đơn chuyển / đơn KTX / contract.room) — dùng đếm occupancy, phân giường.
 */
async function resolveContractEntitledRoomId(contract) {
  if (!contract) return null;

  const { isTransferContractLike } = require("./contractPricing");
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
  if (onContract) return onContract;

  const { roomDoc } = await resolveContractRoomDocument(contract._id || contract);
  return roomDoc ? String(roomDoc._id) : null;
}

function isKtxApplicationContract(contract) {
  if (!contract?.application) return false;
  if (isTransferContractPendingNewRoom(contract)) return false;
  const { isTransferContractLike } = require("./contractPricing");
  return !(isTransferContractLike(contract) && contract.registration);
}

/** HĐ từ đơn KTX: giữ phòng admin phân; chỉ gắn giường nếu giường thuộc đúng phòng đó. */
async function alignKtxApplicationContractRoom(contract) {
  if (!isKtxApplicationContract(contract)) return contract;

  const entitledId = await resolveContractEntitledRoomId(contract);
  if (!entitledId) return contract;

  let dirty = false;
  if (String(contract.room?._id || contract.room || "") !== entitledId) {
    contract.room = entitledId;
    dirty = true;
  }

  const bed = await findOccupiedBedForContract(contract);
  if (bed && String(bed.room) === entitledId) {
    if (String(contract.bed || "") !== String(bed._id)) {
      contract.bed = bed._id;
      dirty = true;
    }
  } else if (contract.bed) {
    contract.bed = null;
    dirty = true;
  }

  if (dirty) await contract.save();
  return contract;
}

/** Ghi contract.room = phòng hiệu lực trên HĐ. */
async function alignContractRoomToEntitledRoom(contractOrId) {
  const contract = await resolveContractDocument(contractOrId);
  if (!contract) return null;

  const entitled = await resolveContractEntitledRoomId(contract);
  if (entitled && String(contract.room || "") !== entitled) {
    contract.room = entitled;
    await contract.save();
  }
  return entitled;
}

async function alignAndRefreshContractListRows(contractRows) {
  if (!Array.isArray(contractRows) || contractRows.length === 0) return contractRows;

  const syncable = contractRows.filter((c) => c && SYNCABLE_STATUSES.has(String(c.status)));
  if (!syncable.length) return contractRows;

  await Promise.all(syncable.map((c) => alignContractRoomWithOccupiedBed(c._id || c)));

  const ids = syncable.map((c) => c._id).filter(Boolean);
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
  alignKtxApplicationContractRoom,
  alignTransferContractRoomFromRegistration,
  isTransferContractPendingNewRoom,
  findOccupiedBedForContract,
  resolveContractRoomDocument,
  resolveContractEntitledRoomId,
  alignContractRoomToEntitledRoom,
  alignAndRefreshContractListRows,
};
