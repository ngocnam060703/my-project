require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");

require("../models/Room");
require("../models/User");
require("../models/Contract");
require("../models/Bed");

const Room = require("../models/Room");
const Bed = require("../models/Bed");

function buildCodes(capacity) {
  const cap = Math.max(1, Number(capacity || 1));
  const codes = [];
  const rows = ["A", "B", "C", "D", "E", "F"];
  let idx = 0;
  while (codes.length < cap) {
    const r = rows[Math.floor(idx / 10)] || "A";
    const n = (idx % 10) + 1;
    codes.push(`${r}${n}`);
    idx += 1;
  }
  return codes;
}

async function main() {
  await connectDB();
  const rooms = await Room.find({}).select("_id roomNumber capacity").lean();
  let created = 0;
  let skipped = 0;
  for (const room of rooms) {
    const existCount = await Bed.countDocuments({ room: room._id });
    if (existCount > 0) {
      skipped += 1;
      continue;
    }
    const codes = buildCodes(room.capacity);
    await Bed.insertMany(codes.map((code) => ({ room: room._id, code, status: "available" })));
    created += codes.length;
  }
  console.log(`Done. Rooms=${rooms.length} skipped=${skipped} bedsCreated=${created}`);
  await mongoose.connection.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

