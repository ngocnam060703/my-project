/**
 * Gia hạn hợp đồng — sinh viên tự xác nhận, tạo HĐ mới (không sửa HĐ cũ, không nhả giường).
 *
 * Điều kiện hiển thị (ưu tiên đợt):
 * 1. Đợt gia hạn Admin đang mở → mọi HĐ active đều được gia hạn (bỏ qua 30 ngày).
 * 2. Không có đợt → chỉ khi còn ≤ 30 ngày đến hạn.
 *
 * Thời hạn HĐ mới:
 * - startDate = ngày kế tiếp sau endDate HĐ cũ.
 * - Đợt: endDate = endDate cũ + đúng 6 tháng.
 * - Cá nhân: endDate = endDate cũ + số tháng = thời hạn HĐ hiện tại.
 */
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { buildContractPricingFields } = require("./contractPricing");
const { getClientIp } = require("../utils/clientIp");
const {
  isContractExtensionGloballyEnabled,
  getOpenExtensionPeriod,
  toPeriodInfo,
} = require("./contractExtensionPolicy");

const RENEWAL_WINDOW_DAYS = 30;
const BATCH_EXTENSION_MONTHS = 6;
const CONSENT_TEXT_VERSION = "v1-renewal-click-wrap-ktx";

function addCalendarMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months));
  return d;
}

/** Ngày kế tiếp sau ngày kết thúc HĐ cũ (00:00). VD hết 31/05 → bắt đầu 01/06. */
function startDateAfterContractEnd(endDate) {
  const d = new Date(endDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

function daysUntilContractEnd(contract, now = new Date()) {
  if (!contract?.endDate) return null;
  const end = new Date(contract.endDate);
  end.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

/** Số tháng thời hạn HĐ hiện tại (dùng cho gia hạn cá nhân). */
function inferContractDurationMonths(contract) {
  if (!contract?.startDate || !contract?.endDate) return 12;
  const s = new Date(contract.startDate);
  const e = new Date(contract.endDate);
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return Math.max(1, months);
}

async function getRenewalPolicyContext(now = new Date()) {
  const globallyEnabled = await isContractExtensionGloballyEnabled();
  /** Đợt mở do Admin — luôn đọc DB, không phụ thuộc cờ toàn cục (SV vẫn cần cờ hoặc đợt để gia hạn). */
  const openPeriod = await getOpenExtensionPeriod(now);
  return {
    globallyEnabled,
    batchMode: Boolean(openPeriod),
    extensionPeriod: openPeriod,
    extensionPeriodInfo: toPeriodInfo(openPeriod),
  };
}

/**
 * Xác định số tháng gia hạn và chế độ.
 * @param {number|null} monthsOverride — chỉ dùng khi không ở đợt (tùy chọn từ client).
 */
function resolveRenewalTerm(sourceContract, policyCtx, monthsOverride) {
  if (policyCtx.batchMode) {
    return {
      renewalMode: "batch",
      months: BATCH_EXTENSION_MONTHS,
      fixedTerm: true,
      extensionPeriodId: policyCtx.extensionPeriod?._id || null,
    };
  }
  const months =
    Number.isFinite(monthsOverride) && monthsOverride >= 1 && monthsOverride <= 36
      ? Math.round(monthsOverride)
      : inferContractDurationMonths(sourceContract);
  return {
    renewalMode: "individual",
    months,
    fixedTerm: false,
    extensionPeriodId: null,
  };
}

function computeRenewalDates(sourceContract, term) {
  const oldEnd = new Date(sourceContract.endDate);
  const newStart = startDateAfterContractEnd(oldEnd);
  const newEnd = addCalendarMonths(oldEnd, term.months);
  return { oldEnd, newStart, newEnd };
}

async function findPendingRenewalContract(sourceContractId) {
  return Contract.findOne({
    renewedFromContract: sourceContractId,
    status: { $in: ["upcoming", "pending_payment"] },
  }).lean();
}

/**
 * @param {object} contract — HĐ active
 * @param {object} policyCtx — từ getRenewalPolicyContext
 */
async function evaluateRenewalEligibility(contract, policyCtx, { now = new Date() } = {}) {
  if (!policyCtx?.globallyEnabled && !policyCtx?.batchMode) {
    return { eligible: false, reason: "Chức năng gia hạn hợp đồng đang tắt", daysUntilEnd: null, renewalMode: null };
  }
  if (!contract) {
    return { eligible: false, reason: "Chưa có hợp đồng đang hiệu lực", daysUntilEnd: null, renewalMode: null };
  }
  if (contract.status !== "active") {
    return { eligible: false, reason: "Chỉ hợp đồng đang hoạt động mới được gia hạn", daysUntilEnd: null, renewalMode: null };
  }

  const daysUntilEnd = daysUntilContractEnd(contract, now);
  if (daysUntilEnd == null) {
    return { eligible: false, reason: "Hợp đồng thiếu ngày kết thúc", daysUntilEnd: null, renewalMode: null };
  }
  if (daysUntilEnd < 0) {
    return { eligible: false, reason: "Hợp đồng đã hết hạn — liên hệ Ban quản lý", daysUntilEnd, renewalMode: null };
  }

  const pendingRenewal = await findPendingRenewalContract(contract._id);
  if (pendingRenewal) {
    return {
      eligible: false,
      reason: `Đã có hợp đồng gia hạn chờ xử lý (${pendingRenewal.contractNumber || pendingRenewal._id})`,
      daysUntilEnd,
      renewalMode: null,
    };
  }

  if (policyCtx.batchMode) {
    return {
      eligible: true,
      reason: null,
      daysUntilEnd,
      renewalMode: "batch",
    };
  }

  if (daysUntilEnd > RENEWAL_WINDOW_DAYS) {
    return {
      eligible: false,
      reason: `Còn ${daysUntilEnd} ngày đến hạn — chỉ gia hạn khi còn tối đa ${RENEWAL_WINDOW_DAYS} ngày (hoặc trong đợt gia hạn do BQL mở)`,
      daysUntilEnd,
      renewalMode: "individual",
    };
  }

  return { eligible: true, reason: null, daysUntilEnd, renewalMode: "individual" };
}

async function buildRenewalPreview(sourceContract, monthsOverride) {
  const policyCtx = await getRenewalPolicyContext();
  const eligibility = await evaluateRenewalEligibility(sourceContract, policyCtx);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || "Không đủ điều kiện gia hạn");
    err.statusCode = 400;
    throw err;
  }

  const term = resolveRenewalTerm(sourceContract, policyCtx, monthsOverride);
  const { newStart, newEnd } = computeRenewalDates(sourceContract, term);

  const roomId = sourceContract.room?._id || sourceContract.room;
  const roomDoc = await Room.findById(roomId).lean();
  if (!roomDoc) {
    const err = new Error("Không tìm thấy phòng");
    err.statusCode = 404;
    throw err;
  }
  const userDoc = await User.findById(sourceContract.user).select("priorityType fullName studentId").lean();
  const pricing = buildContractPricingFields({ roomDoc, userDoc });

  return {
    renewalMode: term.renewalMode,
    fixedTerm: term.fixedTerm,
    batchExtensionMonths: BATCH_EXTENSION_MONTHS,
    extensionPeriod: policyCtx.extensionPeriodInfo,
    sourceContract: {
      _id: sourceContract._id,
      contractNumber: sourceContract.contractNumber,
      endDate: sourceContract.endDate,
      contractPrice: sourceContract.contractPrice ?? sourceContract.monthlyRent,
      roomCapacityAtSigning: sourceContract.roomCapacityAtSigning,
    },
    newContractPreview: {
      startDate: newStart,
      endDate: newEnd,
      months: term.months,
      room: {
        _id: roomDoc._id,
        roomNumber: roomDoc.roomNumber,
        area: roomDoc.area,
        currentPrice: pricing.roomCurrentPriceSnapshot,
        maxCapacity: pricing.roomCapacityAtSigning,
      },
      ...pricing,
    },
    consentText: "Tôi đã đọc rõ, hiểu và cam kết tuân thủ đầy đủ các điều khoản hợp đồng và nội quy KTX.",
    consentTextVersion: CONSENT_TEXT_VERSION,
  };
}

async function confirmStudentRenewal({ sourceContractId, userId, userFullName, months, consentAccepted, req }) {
  if (consentAccepted !== true && consentAccepted !== "true") {
    const err = new Error("Bạn phải xác nhận đã đọc và đồng ý điều khoản hợp đồng và nội quy KTX");
    err.statusCode = 400;
    throw err;
  }

  const oldContract = await Contract.findById(sourceContractId);
  if (!oldContract) {
    const err = new Error("Không tìm thấy hợp đồng");
    err.statusCode = 404;
    throw err;
  }
  if (String(oldContract.user) !== String(userId)) {
    const err = new Error("Không có quyền gia hạn hợp đồng này");
    err.statusCode = 403;
    throw err;
  }

  const policyCtx = await getRenewalPolicyContext();
  const eligibility = await evaluateRenewalEligibility(oldContract, policyCtx);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || "Không đủ điều kiện gia hạn");
    err.statusCode = 400;
    throw err;
  }

  const term = resolveRenewalTerm(oldContract, policyCtx, months);
  const { newStart, newEnd } = computeRenewalDates(oldContract, term);

  const roomDoc = await Room.findById(oldContract.room);
  if (!roomDoc) {
    const err = new Error("Không tìm thấy phòng");
    err.statusCode = 404;
    throw err;
  }
  const userDoc = await User.findById(userId).select("priorityType").lean();
  const pricing = buildContractPricingFields({ roomDoc, userDoc });
  const now = new Date();

  const newContract = await Contract.create({
    user: userId,
    room: oldContract.room,
    bed: oldContract.bed || null,
    application: oldContract.application || null,
    registration: oldContract.registration || null,
    startDate: newStart,
    endDate: newEnd,
    status: "upcoming",
    contractNumber: `HD-GH${Date.now()}`,
    renewedFromContract: oldContract._id,
    isRenewalContract: true,
    studentSignStatus: "pending",
    renewalConsentAt: now,
    renewalConsentIp: getClientIp(req),
    renewalConfirmedBy: userId,
    renewalConsentUserAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    renewalConsentTextVersion: CONSENT_TEXT_VERSION,
    ...pricing,
  });

  await ContractExtendRequest.create({
    contract: oldContract._id,
    user: userId,
    months: term.months,
    status: "approved",
    snapshotEndDate: oldContract.endDate,
    appliedEndDate: newEnd,
    newContract: newContract._id,
    extensionPeriod: term.extensionPeriodId,
    note:
      term.renewalMode === "batch"
        ? `Gia hạn trong đợt "${policyCtx.extensionPeriod?.name || ""}" — +${BATCH_EXTENSION_MONTHS} tháng, HĐ mới`
        : "Sinh viên xác nhận gia hạn — tạo hợp đồng mới (không sửa HĐ cũ)",
    reviewedAt: now,
  });

  const io = getIO();
  const admins = await User.find({ $or: [{ role: "admin" }, { role: "manager" }] }).select("_id");
  if (admins.length) {
    const title = "Sinh viên xác nhận gia hạn hợp đồng";
    const message = `${userFullName || "Sinh viên"} gia hạn HĐ ${oldContract.contractNumber} → ${newContract.contractNumber} (sắp hiệu lực từ ${newStart.toLocaleDateString("vi-VN")}).`;
    await Notification.insertMany(
      admins.map((a) => ({
        user: a._id,
        title,
        message,
        type: "contract_renewal",
        link: `/admin/contracts?openContract=${newContract._id}`,
      }))
    );
    for (const a of admins) {
      io.emit("notification:new", { userId: String(a._id), title, message });
    }
  }

  await Notification.create({
    user: userId,
    title: "Đã tạo hợp đồng gia hạn",
    message: `Hợp đồng mới ${newContract.contractNumber} đã được tạo (trạng thái sắp hiệu lực). Có hiệu lực từ ${newStart.toLocaleDateString("vi-VN")}. HĐ hiện tại vẫn active đến hết hạn.`,
    type: "contract_renewal",
    link: "/student/my-contracts",
  });

  io.emit("contract:renewal-created", {
    userId: String(userId),
    newContractId: String(newContract._id),
    sourceContractId: String(oldContract._id),
  });

  const populated = await Contract.findById(newContract._id)
    .populate({
      path: "room",
      select: "roomNumber floor area capacity maxCapacity currentPrice price currentOccupancy",
      populate: { path: "area", select: "name" },
    })
    .lean();

  return {
    sourceContract: oldContract,
    newContract: populated,
    renewalMode: term.renewalMode,
    months: term.months,
  };
}

async function buildStudentRenewalContext(_userId, activeContract) {
  const policyCtx = await getRenewalPolicyContext();
  const eligibility = await evaluateRenewalEligibility(activeContract, policyCtx);
  const pendingRenewal = activeContract?._id ? await findPendingRenewalContract(activeContract._id) : null;
  return {
    canRenewContract: eligibility.eligible,
    renewalBlockReason: eligibility.reason,
    renewalMode: eligibility.renewalMode || (policyCtx.batchMode ? "batch" : "individual"),
    batchExtensionMonths: BATCH_EXTENSION_MONTHS,
    extensionPeriod: policyCtx.extensionPeriodInfo,
    extensionPeriodEndDate: policyCtx.extensionPeriod?.endDate || null,
    daysUntilContractEnd: eligibility.daysUntilEnd,
    renewalWindowDays: RENEWAL_WINDOW_DAYS,
    pendingRenewalContract: pendingRenewal,
  };
}

module.exports = {
  RENEWAL_WINDOW_DAYS,
  BATCH_EXTENSION_MONTHS,
  CONSENT_TEXT_VERSION,
  daysUntilContractEnd,
  inferContractDurationMonths,
  evaluateRenewalEligibility,
  buildRenewalPreview,
  confirmStudentRenewal,
  buildStudentRenewalContext,
  startDateAfterContractEnd,
  getRenewalPolicyContext,
  resolveRenewalTerm,
  computeRenewalDates,
};
