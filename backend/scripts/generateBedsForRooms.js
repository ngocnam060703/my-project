require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/database");

require("../models/Room");
require("../models/User");
require("../models/Contract");
require("../models/Bed");

const Room = require("../models/Room");
const Bed = require("../models/Bed");

const { buildBedCodesForRoom } = require("../services/bedAllocation");

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
    const codes = buildBedCodesForRoom(room.roomNumber, room.capacity);
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

