/**
 * Một lần: gán contractPrice cho HĐ cũ chưa có snapshot.
 * node scripts/backfillContractPricing.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const { buildContractPricingFields } = require("../services/contractPricing");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ktx_fdorm");
  const rows = await Contract.find({
    $or: [{ contractPrice: { $exists: false } }, { contractPrice: null }],
  });
  let n = 0;
  for (const c of rows) {
    if (c.contractPrice != null && c.roomCapacityAtSigning != null) continue;
    const [roomDoc, userDoc] = await Promise.all([
      Room.findById(c.room).lean(),
      User.findById(c.user).select("priorityType").lean(),
    ]);
    if (!roomDoc) continue;
    const pricing = buildContractPricingFields({ roomDoc, userDoc });
    const patch = { ...pricing };
    if (c.signedAt || c.status === "active") {
      patch.financialLockedAt = c.financialLockedAt || c.signedAt || c.paymentConfirmedAt || new Date();
    }
    await Contract.updateOne({ _id: c._id }, { $set: patch });
    n += 1;
  }
  console.log(`Updated ${n} contracts`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
