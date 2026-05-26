const Bed = require("../models/Bed");
const BedHistory = require("../models/BedHistory");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const { countTakenSlots } = require("./bedOccupancy");

/**
 * Mã giường: "A101-01", "A101-02", … (số thứ tự zero-pad theo capacity).
 */
function buildBedCodesForRoom(roomNumber, capacity) {
  const raw = String(roomNumber || "").trim().replace(/\s+/g, "");
  const base = raw || "PHONG";
  const cap = Math.max(1, Number(capacity || 1));
  const width = Math.max(2, String(cap).length);
  const codes = [];
  for (let i = 1; i <= cap; i += 1) {
    codes.push(`${base}-${String(i).padStart(width, "0")}`);
  }
  return codes;
}

/**
 * Tạo bản ghi Bed theo capacity nếu phòng chưa có giường.
 * @param {string} roomId
 * @param {number} capacity
 * @param {string} [roomNumberHint] — nếu có thì không cần query Room
 */
async function ensureBedsForRoom(roomId, capacity, roomNumberHint) {
  const existing = await Bed.find({ room: roomId }).select("_id").lean();
  if (existing.length > 0) return;
  const cap = Math.max(1, Number(capacity || 1));
  let roomNumber = roomNumberHint != null ? String(roomNumberHint).trim() : "";
  if (!roomNumber) {
    const r = await Room.findById(roomId).select("roomNumber").lean();
    roomNumber = (r && r.roomNumber) ? String(r.roomNumber).trim() : "";
  }
  const codes = buildBedCodesForRoom(roomNumber, cap);
  await Bed.insertMany(codes.map((code) => ({ room: roomId, code, status: "available" })));
}

/**
 * Gán giường trống đầu tiên cho hợp đồng (active / pending_payment).
 * @returns {{ ok: boolean, already?: boolean, bed?: object, message?: string }}
 */
async function detachBedFromContract(contract, bedDoc, performedBy, note) {
  if (!bedDoc || !contract) return;
  if (String(bedDoc.currentContract || "") === String(contract._id)) {
    bedDoc.status = "available";
    bedDoc.currentUser = null;
    bedDoc.currentContract = null;
    bedDoc.assignedAt = null;
    bedDoc.checkInAt = null;
    await bedDoc.save();
    await BedHistory.create({
      bed: bedDoc._id,
      room: bedDoc.room,
      user: contract.user,
      contract: contract._id,
      action: "checked_out",
      fromBedCode: bedDoc.code,
      toStatus: "available",
      note: note || "Gỡ giường — phòng HĐ đã đổi",
      performedBy: performedBy || null,
    });
  }
  contract.bed = null;
  await contract.save();
}

async function tryAutoAssignBed(contractId, performedBy) {
  const contract = await Contract.findById(contractId);
  if (!contract) return { ok: false, message: "Không tìm thấy hợp đồng" };
  if (!contract.user) return { ok: false, message: "Hợp đồng thiếu sinh viên" };
  if (!["active", "pending_payment"].includes(String(contract.status))) {
    return { ok: false, message: "Chỉ gán giường khi hợp đồng active hoặc pending_payment" };
  }

  const { resolveContractEntitledRoomId, alignContractRoomToEntitledRoom } = require("./violationResidentsService");
  const entitledRoomId = await resolveContractEntitledRoomId(contract);
  if (!entitledRoomId) return { ok: false, message: "Hợp đồng chưa có phòng hiệu lực" };
  await alignContractRoomToEntitledRoom(contract);

  if (contract.bed) {
    const existing = await Bed.findById(contract.bed);
    if (existing && String(existing.room) === String(contract.room)) {
      if (
        String(existing.status) === "occupied" &&
        String(existing.currentContract || "") === String(contract._id)
      ) {
        if (!existing.assignedAt) {
          existing.assignedAt = new Date();
          existing.checkInAt = null;
          await existing.save();
        }
        return { ok: true, already: true, bed: existing.toObject ? existing.toObject() : existing };
      }
    }
    if (existing) {
      await detachBedFromContract(contract, existing, performedBy, "Gỡ giường không thuộc phòng HĐ");
    } else {
      contract.bed = null;
      await contract.save();
    }
  }

  const room = await Room.findById(contract.room).select("capacity roomNumber").lean();
  if (!room) return { ok: false, message: "Không tìm thấy phòng" };

  await ensureBedsForRoom(contract.room, room.capacity, room.roomNumber);

  const taken = await countTakenSlots(contract.room);
  const cap = Math.max(1, Number(room.capacity || 1));
  if (taken >= cap) {
    return { ok: false, message: "Phòng đã đủ slot (occupied/reserved), không còn chỗ phân giường" };
  }

  const bed = await Bed.findOne({
    room: contract.room,
    status: "available",
    currentUser: null,
    currentContract: null,
  }).sort({ code: 1 });

  if (!bed) {
    return { ok: false, message: "Không còn giường available để phân (kiểm tra bảo trì/khóa)" };
  }

  bed.status = "occupied";
  bed.currentUser = contract.user;
  bed.currentContract = contract._id;
  bed.assignedAt = new Date();
  bed.checkInAt = null;
  await bed.save();

  contract.bed = bed._id;
  await contract.save();

  await BedHistory.create({
    bed: bed._id,
    room: bed.room,
    user: contract.user,
    contract: contract._id,
    action: "assigned",
    toBedCode: bed.code,
    toStatus: "occupied",
    performedBy: performedBy || null,
  });

  return { ok: true, bed: bed.toObject ? bed.toObject() : bed };
}

module.exports = { ensureBedsForRoom, tryAutoAssignBed, buildBedCodesForRoom };
