/**
 * Chuyển giao HĐ gia hạn — tránh 2 HĐ active cùng lúc.
 * Khi today >= startDate của HĐ upcoming (gia hạn):
 *   - HĐ cũ (renewedFrom) active → completed (không nhả giường)
 *   - HĐ mới upcoming → active
 */
const Contract = require("../models/Contract");
const { getIO } = require("../socket");
const Notification = require("../models/Notification");

function startOfToday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @returns {Promise<{ handovers: number }>}
 */
async function processRenewalHandovers(now = new Date()) {
  const today = startOfToday(now);
  const dueList = await Contract.find({
    status: "upcoming",
    isRenewalContract: true,
    startDate: { $lte: today },
  })
    .select("_id user renewedFromContract contractNumber startDate")
    .lean();

  let handovers = 0;
  const io = getIO();

  for (const upcoming of dueList) {
    const oldId = upcoming.renewedFromContract;
    if (oldId) {
      await Contract.updateOne({ _id: oldId, status: "active" }, { $set: { status: "completed" } });
    }
    const updated = await Contract.findOneAndUpdate(
      { _id: upcoming._id, status: "upcoming" },
      {
        $set: {
          status: "active",
          paymentConfirmedAt: now,
        },
      },
      { new: true }
    );
    if (!updated) continue;
    handovers += 1;

    await Notification.create({
      user: upcoming.user,
      title: "Hợp đồng gia hạn có hiệu lực",
      message: `Hợp đồng ${upcoming.contractNumber || ""} đã bắt đầu có hiệu lực từ ${new Date(upcoming.startDate).toLocaleDateString("vi-VN")}.`,
      type: "contract_renewal",
      link: "/student/my-contracts",
    }).catch(() => {});

    io.emit("contract:renewal-activated", {
      userId: String(upcoming.user),
      newContractId: String(upcoming._id),
      sourceContractId: oldId ? String(oldId) : null,
    });
  }

  return { handovers };
}

/** HĐ active đã hết hạn nhưng đã có HĐ gia hạn kế tiếp — chuyển completed thay vì expired (giữ giường). */
async function completeSupersededActiveContracts(limit = 80) {
  const now = new Date();
  const stale = await Contract.find({
    status: "active",
    endDate: { $lt: now },
  })
    .limit(limit)
    .lean();

  let count = 0;
  for (const c of stale) {
    const hasSuccessor = await Contract.exists({
      renewedFromContract: c._id,
      status: { $in: ["upcoming", "active", "pending_payment"] },
    });
    if (!hasSuccessor) continue;
    await Contract.updateOne({ _id: c._id, status: "active" }, { $set: { status: "completed" } });
    count += 1;
  }
  return count;
}

async function runContractLifecycleJobs() {
  await processRenewalHandovers();
  await completeSupersededActiveContracts();
}

module.exports = {
  startOfToday,
  processRenewalHandovers,
  completeSupersededActiveContracts,
  runContractLifecycleJobs,
};
