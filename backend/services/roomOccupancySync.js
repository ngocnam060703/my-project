const mongoose = require("mongoose");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
const Registration = require("../models/Registration");
const { isWithinStayPeriod } = require("./ktxMembership");
const { resolveContractEntitledRoomId } = require("./contractResidenceSync");

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** HĐ đang hiệu lực — SV đang ở (active + trong kỳ startDate–endDate). */
function contractIsEffectiveResident(c, now = new Date()) {
  if (String(c?.status || "") !== "active") return false;
  return isWithinStayPeriod(c, now);
}

/** HĐ còn giữ slot khi xếp phòng / duyệt đơn (chưa active nhưng đã chốt chỗ). */
function contractHoldsRoomSlot(c, now = new Date()) {
  const st = String(c?.status || "");
  if (st !== "active" && st !== "pending_payment") return false;
  if (!c?.endDate) return false;
  return toStartOfDay(c.endDate) >= toStartOfDay(now);
}

/**
 * Đếm SV giữ slot phòng theo phòng hiệu lực trên HĐ (đơn chuyển / KTX / contract.room).
 * Mỗi SV chỉ tính một phòng; đơn KTX cũ không cộng thêm sau khi đã có HĐ phòng mới.
 */
async function countContractOccupancyByRoom(roomIds, now = new Date()) {
  const ids = [...new Set((roomIds || []).filter((id) => id && mongoose.isValidObjectId(String(id))).map(String))];
  const userSets = new Map(ids.map((id) => [id, new Set()]));
  if (!ids.length) return new Map();

  const today = toStartOfDay(now);
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  const approvedApps = await Application.find({
    assignedRoom: { $in: objectIds },
    status: "approved",
  })
    .select("_id user assignedRoom")
    .lean();

  const appIds = approvedApps.map((a) => a._id);
  const userIdsFromApps = [
    ...new Set(approvedApps.map((a) => a.user).filter(Boolean).map((u) => String(u))),
  ];

  const transferRegs = await Registration.find({
    registrationType: "transfer",
    room: { $in: objectIds },
  })
    .select("_id")
    .lean();
  const regIds = transferRegs.map((r) => r._id);

  const orClause = [{ room: { $in: objectIds } }];
  if (appIds.length) orClause.push({ application: { $in: appIds } });
  if (userIdsFromApps.length) {
    orClause.push({ user: { $in: userIdsFromApps.map((u) => new mongoose.Types.ObjectId(u)) } });
  }
  if (regIds.length) orClause.push({ registration: { $in: regIds } });

  const contracts = await Contract.find({
    status: { $in: ["active", "pending_payment"] },
    endDate: { $gte: today },
    $or: orClause,
  })
    .select("room user startDate endDate status application registration")
    .lean();

  const usersPlaced = new Set();

  for (const c of contracts) {
    const st = String(c.status || "");
    if (st === "active") {
      if (!contractIsEffectiveResident(c, now)) continue;
    } else if (!contractHoldsRoomSlot(c, now)) {
      continue;
    }
    const entitled = await resolveContractEntitledRoomId(c);
    if (!entitled || !userSets.has(entitled)) continue;
    const uid = String(c.user || "");
    if (!uid || usersPlaced.has(uid)) continue;
    userSets.get(entitled).add(uid);
    usersPlaced.add(uid);
  }

  for (const a of approvedApps) {
    const uid = String(a.user || "");
    if (!uid || usersPlaced.has(uid)) continue;
    const k = String(a.assignedRoom || "");
    if (userSets.has(k)) {
      userSets.get(k).add(uid);
      usersPlaced.add(uid);
    }
  }

  const map = new Map();
  for (const [rid, set] of userSets) map.set(rid, set.size);
  return map;
}

/**
 * Cập nhật currentOccupancy + status phòng theo số HĐ thực tế (batch).
 */
async function syncRoomsOccupancyFromContracts(roomIds, now = new Date()) {
  const ids = [...new Set((roomIds || []).filter((id) => id && mongoose.isValidObjectId(String(id))).map(String))];
  if (!ids.length) return;

  const counts = await countContractOccupancyByRoom(ids, now);
  const rooms = await Room.find({ _id: { $in: ids } }).select("_id capacity status currentOccupancy");
  const ops = [];

  for (const room of rooms) {
    const occ = counts.get(String(room._id)) || 0;
    const cap = Number(room.capacity) || 0;
    let nextStatus = room.status;
    if (String(room.status) !== "maintenance") {
      nextStatus = cap > 0 && occ >= cap ? "full" : "available";
    }
    if (Number(room.currentOccupancy) !== occ || String(room.status) !== String(nextStatus)) {
      ops.push({
        updateOne: {
          filter: { _id: room._id },
          update: { $set: { currentOccupancy: occ, status: nextStatus } },
        },
      });
    }
  }
  if (ops.length) await Room.bulkWrite(ops);
}

/**
 * Đếm lại số SV đang giữ slot theo HĐ thực tế → cập nhật Room.currentOccupancy + status.
 */
async function recountRoomOccupancyForRoom(roomId) {
  if (!roomId) return null;
  const room = await Room.findById(roomId);
  if (!room) return null;

  await syncRoomsOccupancyFromContracts([room._id]);
  return Room.findById(roomId);
}

/** Đồng bộ occupancy nhiều phòng (sau chuyển giường/phòng, hủy HĐ…). */
async function syncOccupancyForRooms(roomIds) {
  const uniq = [...new Set((roomIds || []).filter(Boolean).map(String))];
  const results = [];
  for (const id of uniq) {
    results.push(await recountRoomOccupancyForRoom(id));
  }
  return results.filter(Boolean);
}

module.exports = {
  contractIsEffectiveResident,
  contractHoldsRoomSlot,
  countContractOccupancyByRoom,
  syncRoomsOccupancyFromContracts,
  recountRoomOccupancyForRoom,
  syncOccupancyForRooms,
};
