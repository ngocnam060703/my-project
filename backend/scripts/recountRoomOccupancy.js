require("dotenv").config();
const mongoose = require("mongoose");

const Room = require("../models/Room");
const Contract = require("../models/Contract");

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function holdsSlot(c) {
  const st = String(c.status || "");
  if (st !== "active" && st !== "pending_payment") return false;
  if (!c.endDate) return false;
  return toStartOfDay(c.endDate) >= toStartOfDay(new Date());
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dormitory_db";
  await mongoose.connect(uri);

  const rooms = await Room.find({}).select("_id capacity currentOccupancy status").lean();
  const contracts = await Contract.find({ status: { $in: ["active", "pending_payment"] } })
    .select("room status endDate")
    .lean();

  const countByRoom = new Map();
  for (const c of contracts) {
    if (!holdsSlot(c)) continue;
    const rid = String(c.room || "");
    if (!rid) continue;
    countByRoom.set(rid, (countByRoom.get(rid) || 0) + 1);
  }

  let updated = 0;
  let unchanged = 0;
  let overCapacity = 0;

  for (const r of rooms) {
    const rid = String(r._id);
    const nextOcc = countByRoom.get(rid) || 0;
    const cap = Number(r.capacity) || 0;
    if (cap > 0 && nextOcc > cap) overCapacity += 1;

    const nextStatus = r.status === "maintenance" ? "maintenance" : nextOcc >= cap && cap > 0 ? "full" : "available";
    const curOcc = Number(r.currentOccupancy) || 0;
    const curStatus = String(r.status || "available");
    if (curOcc === nextOcc && curStatus === nextStatus) {
      unchanged += 1;
      continue;
    }
    await Room.updateOne({ _id: r._id }, { $set: { currentOccupancy: nextOcc, status: nextStatus } });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        roomsTotal: rooms.length,
        updated,
        unchanged,
        roomsOverCapacityAccordingToContracts: overCapacity,
        note: "Recounted Room.currentOccupancy from active/pending_payment contracts (endDate >= today).",
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

