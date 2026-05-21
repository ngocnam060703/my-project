require("dotenv").config();
const mongoose = require("mongoose");

const Registration = require("../models/Registration");
const Application = require("../models/Application");
const Contract = require("../models/Contract");
// Ensure mongoose has these models registered for populate()
require("../models/User");
const Room = require("../models/Room");
const Area = require("../models/Area");

function normalizeGender(g) {
  const s = String(g || "").toLowerCase();
  if (s === "male" || s.includes("nam")) return "male";
  if (s === "female" || s.includes("nữ") || s.includes("nu")) return "female";
  return "unknown";
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dormitory_db";
  await mongoose.connect(uri);

  const regs = await Registration.find({ registrationType: "dorm" })
    .populate("user", "gender fullName studentId")
    .lean();

  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let linked = 0;
  let deleted = 0;
  let updatedContracts = 0;

  for (const r of regs) {
    scanned += 1;

    const userId = String(r.user?._id || r.user || "");
    if (!mongoose.isValidObjectId(userId)) {
      skipped += 1;
      continue;
    }

    const regId = String(r._id);

    const genderSnapshot = normalizeGender(r.user?.gender);

    // Infer preferenceArea from room.area when possible (old flow already picked a room)
    let pref = null;
    if (r.room && mongoose.isValidObjectId(String(r.room))) {
      const roomDoc = await Room.findById(r.room).select("area").lean();
      if (roomDoc?.area && mongoose.isValidObjectId(String(roomDoc.area))) {
        const areaDoc = await Area.findById(roomDoc.area).select("_id").lean();
        pref = areaDoc?._id || null;
      }
    }

    // Link contract created from this registration (if any) and cut over to application
    const c = await Contract.findOne({ registration: r._id }).select("_id application registration").lean();
    const contractId = c?._id ? String(c._id) : "";

    // Try to find existing app by linked contract first (idempotent re-run)
    let app =
      (contractId && (await Application.findOne({ linkedContract: contractId }).select("_id"))) ||
      (await Application.findOne({
        user: userId,
        status: String(r.status || "pending"),
        assignedRoom: r.room || null,
        reviewedAt: r.reviewedAt || null,
        semester: String(r.semester || ""),
        schoolYear: String(r.schoolYear || ""),
      }).select("_id"));

    if (!app) {
      app = await Application.create({
        user: userId,
        genderSnapshot,
        preferenceArea: pref,
        semester: String(r.semester || ""),
        schoolYear: String(r.schoolYear || ""),
        startDate: r.startDate ? new Date(r.startDate) : new Date(),
        status: r.status || "pending",
        assignedRoom: r.room || null,
        note: String(r.rejectionReason || r.note || "").trim(),
        reviewedBy: r.reviewedBy || null,
        reviewedAt: r.reviewedAt || null,
        linkedContract: contractId || null,
      });
      created += 1;
    } else {
      skipped += 1;
    }

    if (contractId) {
      // Cutover: move contract link from registration -> application, and null out registration
      const upd = await Contract.updateOne(
        { _id: contractId },
        { $set: { application: app._id, registration: null } }
      );
      if (upd.modifiedCount) updatedContracts += 1;
      linked += 1;
    }

    // Delete old dorm registration to fully cut over
    const del = await Registration.deleteOne({ _id: regId });
    if (del.deletedCount) deleted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned,
        created,
        skipped,
        linkedContracts: linked,
        updatedContracts,
        deletedDormRegistrations: deleted,
        note: "Dorm registrations were deleted; transfer registrations are untouched.",
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

