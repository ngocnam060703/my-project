require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.example") });
const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Application = require("../models/Application");
const Bed = require("../models/Bed");
const {
  resolveContractLivingRoomId,
  resolveContractEntitledRoomId,
} = require("../services/violationResidentsService");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ktx");
  const c = await Contract.findOne({ contractNumber: "HD-A1779781063203" }).lean();
  if (!c) {
    console.log("no contract");
    return;
  }
  console.log("contract", { room: String(c.room), app: String(c.application || "none"), user: String(c.user) });
  const bed = await Bed.findOne({
    status: "occupied",
    $or: [{ currentContract: c._id }, { currentUser: c.user }],
  }).lean();
  console.log("occupied bed", bed ? { room: String(bed.room), code: bed.code } : null);
  if (c.application) {
    const app = await Application.findById(c.application).lean();
    console.log("linked app", app ? { status: app.status, assigned: String(app.assignedRoom) } : null);
  }
  const apps = await Application.find({ user: c.user, status: "approved" }).lean();
  console.log("approved apps", apps.map((a) => ({ id: String(a._id), assigned: String(a.assignedRoom) })));
  console.log("living", await resolveContractLivingRoomId(c));
  console.log("entitled", await resolveContractEntitledRoomId(c));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
