require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.example") });
const mongoose = require("mongoose");
const Area = require("../models/Area");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
require("../models/User");
const { contractIsEffectiveResident } = require("../services/roomOccupancySync");
const { listContractResidentsForZone } = require("../services/roomResidentsListService");

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ktx";
  await mongoose.connect(uri);
  const area = await Area.findOne({ name: /Khu A/i }).lean();
  if (!area) {
    console.log("No Khu A");
    await mongoose.disconnect();
    return;
  }
  const rooms = await Room.find({ area: area._id }).lean();
  const roomIds = rooms.map((r) => r._id);
  console.log("area", area.name, "rooms", rooms.map((r) => `${r.roomNumber} occ=${r.currentOccupancy}`));

  const contracts = await Contract.find({ room: { $in: roomIds } })
    .populate("user", "fullName studentId")
    .lean();
  const now = new Date();
  for (const c of contracts) {
    console.log({
      num: c.contractNumber,
      st: c.status,
      user: c.user?.fullName,
      start: c.startDate,
      end: c.endDate,
      effective: contractIsEffectiveResident(c, now),
      room: String(c.room),
    });
  }

  const apps = await Application.find({ assignedRoom: { $in: roomIds }, status: "approved" })
    .populate("user", "fullName")
    .lean();
  console.log(
    "approved apps in zone",
    apps.map((a) => ({ user: a.user?.fullName, room: String(a.assignedRoom) }))
  );

  for (const a of apps) {
    const c = await Contract.findOne({ user: a.user, status: "active" }).lean();
    console.log("active contract for app user", {
      user: a.user?.fullName,
      contract: c?.contractNumber,
      contractRoom: c ? String(c.room) : null,
      appRoom: String(a.assignedRoom),
    });
  }

  const activeAll = await Contract.find({ status: "active" }).populate("user", "fullName").limit(10).lean();
  console.log(
    "all active sample",
    activeAll.map((c) => ({ u: c.user?.fullName, room: String(c.room), num: c.contractNumber }))
  );

  const list = await listContractResidentsForZone(area._id);
  console.log("listContractResidentsForZone count", list.length, list.map((r) => r.user?.fullName));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
