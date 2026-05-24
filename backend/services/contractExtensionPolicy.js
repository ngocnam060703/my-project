const ContractExtensionSetting = require("../models/ContractExtensionSetting");
const ContractExtensionPeriod = require("../models/ContractExtensionPeriod");

const SETTING_KEY = "contract_extension";

/** HĐ còn ≤ N ngày mới được gửi yêu cầu gia hạn (đồng bộ ops dashboard 30 ngày + buffer) */
const EXTENSION_ELIGIBILITY_DAYS = 60;

const EXTEND_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

async function autoCloseExpiredExtensionPeriods(now = new Date()) {
  await ContractExtensionPeriod.updateMany(
    { isActive: true, endDate: { $lt: now } },
    { $set: { isActive: false } }
  );
}

async function isContractExtensionGloballyEnabled() {
  const doc = await ContractExtensionSetting.findOne({ key: SETTING_KEY });
  return doc?.enable_contract_extension !== false;
}

async function getOpenExtensionPeriod(now = new Date()) {
  await autoCloseExpiredExtensionPeriods(now);
  return ContractExtensionPeriod.findOne({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).lean();
}

function toPeriodInfo(period) {
  if (!period) {
    return { isOpen: false, id: null, name: null, startDate: null, endDate: null };
  }
  return {
    isOpen: true,
    id: String(period._id),
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
  };
}

function daysUntilContractEnd(contract, now = new Date()) {
  if (!contract?.endDate) return null;
  const end = new Date(contract.endDate);
  end.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

/** SV được gửi yêu cầu gia hạn khi: bật toàn cục + đợt mở + HĐ active + sắp hết hạn + chưa có pending. */
function evaluateContractExtensionEligibility(
  contract,
  { hasPendingRequest = false, policy, now = new Date() } = {}
) {
  if (!policy?.globallyEnabled) {
    return { eligible: false, reason: "Chức năng gia hạn hợp đồng hiện đang tắt trên hệ thống", daysUntilEnd: null };
  }
  if (!policy?.extensionPeriod?.isOpen) {
    return {
      eligible: false,
      reason: "Hiện chưa trong đợt gia hạn. Vui lòng chờ Ban quản lý mở đợt hoặc theo dõi thông báo.",
      daysUntilEnd: null,
    };
  }
  if (!contract) {
    return { eligible: false, reason: "Chưa có hợp đồng đang hiệu lực", daysUntilEnd: null };
  }
  if (contract.status !== "active") {
    return { eligible: false, reason: "Chỉ hợp đồng đang hiệu lực mới được gửi yêu cầu gia hạn", daysUntilEnd: null };
  }
  if (hasPendingRequest) {
    return { eligible: false, reason: "Đã có yêu cầu gia hạn đang chờ duyệt", daysUntilEnd: daysUntilContractEnd(contract, now) };
  }
  const daysUntilEnd = daysUntilContractEnd(contract, now);
  if (daysUntilEnd == null) {
    return { eligible: false, reason: "Hợp đồng thiếu ngày kết thúc", daysUntilEnd: null };
  }
  if (daysUntilEnd < 0) {
    return { eligible: false, reason: "Hợp đồng đã hết hạn — liên hệ Ban quản lý", daysUntilEnd };
  }
  if (daysUntilEnd > EXTENSION_ELIGIBILITY_DAYS) {
    return {
      eligible: false,
      reason: `Hợp đồng còn ${daysUntilEnd} ngày — chỉ gửi yêu cầu khi còn tối đa ${EXTENSION_ELIGIBILITY_DAYS} ngày trước hạn`,
      daysUntilEnd,
    };
  }
  return { eligible: true, reason: null, daysUntilEnd };
}

async function getExtensionPolicy(now = new Date()) {
  const globallyEnabled = await isContractExtensionGloballyEnabled();
  const period = globallyEnabled ? await getOpenExtensionPeriod(now) : null;
  const periodInfo = toPeriodInfo(period);
  return {
    globallyEnabled,
    extensionPeriod: periodInfo,
    canRequestExtension: globallyEnabled && periodInfo.isOpen,
    eligibilityDays: EXTENSION_ELIGIBILITY_DAYS,
  };
}

async function assertStudentCanRequestExtension(now = new Date()) {
  const policy = await getExtensionPolicy(now);
  if (!policy.globallyEnabled) {
    return { ok: false, message: "Chức năng gia hạn hợp đồng hiện đang tắt trên hệ thống", policy };
  }
  if (!policy.extensionPeriod.isOpen) {
    return {
      ok: false,
      message: "Hiện chưa trong đợt gia hạn. Vui lòng chờ Ban quản lý mở đợt hoặc theo dõi thông báo.",
      policy,
    };
  }
  return { ok: true, policy };
}

module.exports = {
  SETTING_KEY,
  EXTENSION_ELIGIBILITY_DAYS,
  EXTEND_REQUEST_STATUS,
  autoCloseExpiredExtensionPeriods,
  isContractExtensionGloballyEnabled,
  getOpenExtensionPeriod,
  toPeriodInfo,
  getExtensionPolicy,
  assertStudentCanRequestExtension,
  daysUntilContractEnd,
  evaluateContractExtensionEligibility,
};
