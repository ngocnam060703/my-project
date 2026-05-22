const User = require("../models/User");

const notDeleted = { isDeleted: { $ne: true } };

async function listPendingAccounts() {
  return User.find({
    ...notDeleted,
    role: "student",
    status: "pending",
  })
    .select("_id studentId fullName email phone status createdAt")
    .sort({ createdAt: -1 })
    .lean();
}

async function approveAccount({ userId, approverId }) {
  const target = await User.findOne({ _id: userId, ...notDeleted });
  if (!target) return { notFound: true };
  if (target.role !== "student") return { invalidRole: true };
  if (target.status !== "pending") return { invalidStatus: true, status: target.status };

  target.status = "approved";
  target.approvedAt = new Date();
  target.approvedBy = approverId;
  target.rejectionReason = "";
  target.isActive = true;
  await target.save();
  return { user: target };
}

async function rejectAccount({ userId, approverId, rejectionReason }) {
  const target = await User.findOne({ _id: userId, ...notDeleted });
  if (!target) return { notFound: true };
  if (target.role !== "student") return { invalidRole: true };
  if (target.status !== "pending") return { invalidStatus: true, status: target.status };

  target.status = "rejected";
  target.rejectionReason = String(rejectionReason || "").trim();
  target.approvedAt = null;
  target.approvedBy = approverId;
  await target.save();
  return { user: target };
}

module.exports = {
  listPendingAccounts,
  approveAccount,
  rejectAccount,
};
