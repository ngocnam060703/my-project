const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const {
  assertStudentCanRequestExtension,
  getOpenExtensionPeriod,
  getExtensionPolicy,
  evaluateContractExtensionEligibility,
  EXTEND_REQUEST_STATUS,
} = require("./contractExtensionPolicy");
const { buildStudentRenewalContext, buildRenewalPreview, confirmStudentRenewal } = require("./contractRenewalService");

function addCalendarMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

async function notifyAdminsNewExtendRequest({ studentName, contractNumber, months, requestId }) {
  const io = getIO();
  const admins = await User.find({ $or: [{ role: "admin" }, { role: "manager" }] }).select("_id");
  if (!admins.length) return;
  const title = "Yêu cầu gia hạn hợp đồng";
  const message = `${studentName || "Sinh viên"} xin gia hạn HĐ ${contractNumber || ""} thêm ${months} tháng.`;
  const link = "/admin/contracts?tab=extend";
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: "contract_renewal",
      link,
    }))
  );
  const payload = {
    requestId: String(requestId),
    studentName,
    contractNumber,
    months,
    title,
    message,
    link,
  };
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), ...payload });
  }
  io.emit("contract:extend-request:new", payload);
}

async function notifyStudentExtendResult({ userId, title, message }) {
  const io = getIO();
  await Notification.create({
    user: userId,
    title,
    message,
    type: "contract_renewal",
    link: "/student/my-contracts",
  });
  io.emit("notification:new", { userId: String(userId), title, message, link: "/student/my-contracts" });
}

async function buildStudentExtensionContext(userId, activeContract) {
  const policy = await getExtensionPolicy();
  const renewalCtx = await buildStudentRenewalContext(userId, activeContract);
  let hasPendingExtendRequest = false;
  if (activeContract?._id) {
    hasPendingExtendRequest = !!(await ContractExtendRequest.exists({
      contract: activeContract._id,
      status: EXTEND_REQUEST_STATUS.PENDING,
    }));
  }
  const eligibility = evaluateContractExtensionEligibility(activeContract, {
    hasPendingRequest: hasPendingExtendRequest,
    policy,
  });
  const periodInfo = renewalCtx.extensionPeriod?.isOpen
    ? renewalCtx.extensionPeriod
    : policy.extensionPeriod;
  return {
    extensionEnabled: policy.globallyEnabled || Boolean(periodInfo?.isOpen),
    extensionPeriod: periodInfo,
    eligibilityDays: policy.eligibilityDays,
    canRequestExtension: renewalCtx.canRenewContract,
    extensionBlockReason: renewalCtx.renewalBlockReason || eligibility.reason,
    hasPendingExtendRequest,
    daysUntilContractEnd: renewalCtx.daysUntilContractEnd ?? eligibility.daysUntilEnd,
    canRenewContract: renewalCtx.canRenewContract,
    renewalBlockReason: renewalCtx.renewalBlockReason,
    renewalMode: renewalCtx.renewalMode,
    batchExtensionMonths: renewalCtx.batchExtensionMonths,
    renewalWindowDays: renewalCtx.renewalWindowDays,
    pendingRenewalContract: renewalCtx.pendingRenewalContract,
  };
}

async function createStudentExtendRequest({ contractId, userId, userFullName, months }) {
  const gate = await assertStudentCanRequestExtension();
  if (!gate.ok) {
    const err = new Error(gate.message);
    err.statusCode = 400;
    throw err;
  }
  const contract = await Contract.findById(contractId);
  if (!contract) {
    const err = new Error("Không tìm thấy hợp đồng");
    err.statusCode = 404;
    throw err;
  }
  if (String(contract.user) !== String(userId)) {
    const err = new Error("Không có quyền với hợp đồng này");
    err.statusCode = 403;
    throw err;
  }
  const pending = await ContractExtendRequest.findOne({
    contract: contract._id,
    status: EXTEND_REQUEST_STATUS.PENDING,
  });
  const eligibility = evaluateContractExtensionEligibility(contract, {
    hasPendingRequest: !!pending,
    policy: gate.policy,
  });
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || "Không đủ điều kiện gia hạn");
    err.statusCode = 400;
    throw err;
  }
  const openPeriod = await getOpenExtensionPeriod();
  const doc = await ContractExtendRequest.create({
    contract: contract._id,
    user: userId,
    months,
    status: EXTEND_REQUEST_STATUS.PENDING,
    snapshotEndDate: contract.endDate,
    extensionPeriod: openPeriod?._id || null,
  });
  await notifyAdminsNewExtendRequest({
    studentName: userFullName,
    contractNumber: contract.contractNumber,
    months,
    requestId: doc._id,
  });
  await Notification.create({
    user: userId,
    title: "Đã gửi yêu cầu gia hạn",
    message: `Yêu cầu gia hạn HĐ ${contract.contractNumber} thêm ${months} tháng đang chờ duyệt.`,
    type: "contract_renewal",
    link: "/student/my-contracts",
  });
  return ContractExtendRequest.findById(doc._id).populate("contract", "contractNumber").lean();
}

async function listExtendRequests({ status = "pending", search = "" }) {
  const filter = {};
  if (status && status !== "all") filter.status = status;

  const q = String(search || "").trim();
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const [users, contracts] = await Promise.all([
      User.find({ $or: [{ fullName: regex }, { studentId: regex }, { email: regex }] }).select("_id"),
      Contract.find({ contractNumber: regex }).select("_id"),
    ]);
    const userIds = users.map((u) => u._id);
    const contractIds = contracts.map((c) => c._id);
    if (!userIds.length && !contractIds.length) {
      return [];
    }
    filter.$or = [];
    if (userIds.length) filter.$or.push({ user: { $in: userIds } });
    if (contractIds.length) filter.$or.push({ contract: { $in: contractIds } });
  }

  return ContractExtendRequest.find(filter)
    .populate("user", "fullName email studentId")
    .populate("contract", "contractNumber status startDate endDate signedAt signedPdfUrl")
    .populate("reviewedBy", "fullName")
    .populate("extensionPeriod", "name startDate endDate")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
}

async function approveExtendRequest({ requestId, reviewerId }) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const reqDoc = await ContractExtendRequest.findById(requestId).session(session);
    if (!reqDoc || reqDoc.status !== EXTEND_REQUEST_STATUS.PENDING) {
      const err = new Error("Không tìm thấy yêu cầu hoặc đã xử lý");
      err.statusCode = 404;
      throw err;
    }
    const contract = await Contract.findById(reqDoc.contract).session(session);
    if (!contract) {
      const err = new Error("Hợp đồng không tồn tại");
      err.statusCode = 400;
      throw err;
    }
    if (contract.status !== "active") {
      const err = new Error("Hợp đồng không còn active, không thể gia hạn");
      err.statusCode = 400;
      throw err;
    }
    const newEnd = addCalendarMonths(contract.endDate, reqDoc.months);
    contract.endDate = newEnd;
    await contract.save({ session });
    reqDoc.status = EXTEND_REQUEST_STATUS.APPROVED;
    reqDoc.appliedEndDate = newEnd;
    reqDoc.reviewedBy = reviewerId;
    reqDoc.reviewedAt = new Date();
    reqDoc.note = "";
    await reqDoc.save({ session });
    await session.commitTransaction();

    const io = getIO();
    io.emit("contract:extended", {
      userId: String(contract.user),
      message: `Yêu cầu gia hạn ${reqDoc.months} tháng đã được duyệt. Ngày kết thúc mới: ${newEnd.toLocaleDateString("vi-VN")}`,
    });
    await notifyStudentExtendResult({
      userId: contract.user,
      title: "Gia hạn hợp đồng được duyệt",
      message: `Hợp đồng ${contract.contractNumber} đã được gia hạn thêm ${reqDoc.months} tháng.`,
    });

    const out = await ContractExtendRequest.findById(reqDoc._id)
      .populate("contract", "contractNumber endDate")
      .lean();
    return { request: out, contract };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

async function rejectExtendRequest({ requestId, reviewerId, note }) {
  const reqDoc = await ContractExtendRequest.findById(requestId);
  if (!reqDoc || reqDoc.status !== EXTEND_REQUEST_STATUS.PENDING) {
    const err = new Error("Không tìm thấy yêu cầu hoặc đã xử lý");
    err.statusCode = 404;
    throw err;
  }
  reqDoc.status = EXTEND_REQUEST_STATUS.REJECTED;
  reqDoc.note = note;
  reqDoc.reviewedBy = reviewerId;
  reqDoc.reviewedAt = new Date();
  await reqDoc.save();

  const contract = await Contract.findById(reqDoc.contract).select("user contractNumber").lean();
  if (contract?.user) {
    await notifyStudentExtendResult({
      userId: contract.user,
      title: "Yêu cầu gia hạn bị từ chối",
      message: `Hợp đồng ${contract.contractNumber}: ${note}`,
    });
  }
  return ContractExtendRequest.findById(reqDoc._id)
    .populate("contract", "contractNumber")
    .populate("reviewedBy", "fullName")
    .lean();
}

module.exports = {
  createStudentExtendRequest,
  listExtendRequests,
  approveExtendRequest,
  rejectExtendRequest,
  buildStudentExtensionContext,
  notifyAdminsNewExtendRequest,
  buildRenewalPreview,
  confirmStudentRenewal,
};
