const Room = require("../models/Room");
const Contract = require("../models/Contract");

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Hợp đồng còn chiếm slot phòng (đếm vào currentOccupancy). */
function contractHoldsRoomSlot(c, now = new Date()) {
  const st = String(c?.status || "");
  if (st !== "active" && st !== "pending_payment") return false;
  if (!c?.endDate) return false;
  return toStartOfDay(c.endDate) >= toStartOfDay(now);
}

/**
 * Đếm lại số SV đang giữ slot theo HĐ thực tế → cập nhật Room.currentOccupancy + status.
 */
async function recountRoomOccupancyForRoom(roomId) {
  if (!roomId) return null;
  const room = await Room.findById(roomId);
  if (!room) return null;

  const contracts = await Contract.find({
    room: room._id,
    status: { $in: ["active", "pending_payment"] },
  })
    .select("status endDate")
    .lean();

  const now = new Date();
  const nextOcc = contracts.filter((c) => contractHoldsRoomSlot(c, now)).length;
  const cap = Number(room.capacity) || 0;

  if (String(room.status) !== "maintenance") {
    room.status = cap > 0 && nextOcc >= cap ? "full" : "available";
  }
  room.currentOccupancy = nextOcc;
  await room.save();
  return room;
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
  contractHoldsRoomSlot,
  recountRoomOccupancyForRoom,
  syncOccupancyForRooms,
};
