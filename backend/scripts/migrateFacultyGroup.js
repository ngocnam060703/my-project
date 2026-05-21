/* eslint-disable no-console */
/**
 * Migrate User.facultyGroup (Khoa/nhóm ngành) từ danh mục ngành.
 *
 * Quy ước hiện tại:
 * - Major.name   = Khoa/nhóm ngành
 * - Major.faculty = Ngành
 * - User.major    = Ngành
 * - User.facultyGroup = Khoa/nhóm ngành (mới)
 *
 * Idempotent: chỉ update khi facultyGroup đang trống.
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Major = require("../models/Major");

function norm(s) {
  return String(s || "").trim();
}

async function main() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    "mongodb://127.0.0.1:27017/ktx";

  console.log(`[migrateFacultyGroup] Connecting to ${mongoUri}`);
  await mongoose.connect(mongoUri);

  const majors = await Major.find({}).select("name faculty").lean();
  const byMajorName = new Map(); // key: Ngành (Major.faculty) -> Khoa/nhóm ngành (Major.name)
  const byGroupName = new Map(); // key: Khoa/nhóm ngành (Major.name) -> itself
  for (const m of majors) {
    const group = norm(m.name);
    const major = norm(m.faculty);
    if (group) byGroupName.set(group, group);
    if (major && group && !byMajorName.has(major)) byMajorName.set(major, group);
  }

  const filter = {
    role: "user",
    isDeleted: { $ne: true },
    $or: [{ facultyGroup: { $exists: false } }, { facultyGroup: "" }, { facultyGroup: null }],
  };

  const cursor = User.find(filter).select("_id major facultyGroup").cursor();

  let scanned = 0;
  let updated = 0;
  let skippedNoMajor = 0;
  let skippedNoMatch = 0;

  for await (const u of cursor) {
    scanned += 1;
    const m = norm(u.major);
    if (!m) {
      skippedNoMajor += 1;
      continue;
    }

    // First: match theo Major.faculty (Ngành)
    let group = byMajorName.get(m) || "";
    // Fallback: nếu dữ liệu cũ ghi nhầm major = groupName
    if (!group) group = byGroupName.get(m) || "";

    if (!group) {
      skippedNoMatch += 1;
      continue;
    }

    const res = await User.updateOne(
      {
        _id: u._id,
        $or: [{ facultyGroup: { $exists: false } }, { facultyGroup: "" }, { facultyGroup: null }],
      },
      { $set: { facultyGroup: group } }
    );
    if (res.modifiedCount > 0) updated += 1;
  }

  console.log(
    `[migrateFacultyGroup] Done. scanned=${scanned} updated=${updated} skippedNoMajor=${skippedNoMajor} skippedNoMatch=${skippedNoMatch}`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrateFacultyGroup] ERROR", err);
  process.exitCode = 1;
});

