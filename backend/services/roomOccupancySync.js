const mongoose = require("mongoose");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const { isWithinStayPeriod } = require("./ktxMembership");

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

/** Đếm SV đang ở phòng theo HĐ active đang hiệu lực. */
async function countContractOccupancyByRoom(roomIds, now = new Date()) {
  const ids = [...new Set((roomIds || []).filter((id) => id && mongoose.isValidObjectId(String(id))).map(String))];
  const map = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return map;

  const today = toStartOfDay(now);
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const contracts = await Contract.find({
    room: { $in: objectIds },
    status: "active",
    endDate: { $gte: today },
  })
    .select("room startDate endDate status")
    .lean();

  for (const c of contracts) {
    if (!contractIsEffectiveResident(c, now)) continue;
    const k = String(c.room);
    map.set(k, (map.get(k) || 0) + 1);
  }
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
