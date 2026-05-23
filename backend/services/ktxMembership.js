/**
 * Xác định thành viên KTX / HĐ đang ở — thống nhất dashboard, chuyển phòng, dịch vụ.
 */
const Contract = require("../models/Contract");
const { runContractLifecycleJobs } = require("./contractRenewalLifecycle");

const RESIDENCE_STATUSES = new Set(["active", "pending_payment", "upcoming"]);
const FULL_MEMBER_STATUSES = new Set(["active"]);

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isWithinStayPeriod(contract, at = new Date()) {
  if (!contract?.endDate) return false;
  const start = contract.startDate ? new Date(contract.startDate) : null;
  const end = new Date(contract.endDate);
  if (end < startOfDay(at)) return false;
  if (start && start > endOfDay(at)) return false;
  return true;
}

/**
 * HĐ đủ điều kiện cư trú / thành viên (ưu tiên active > upcoming gia hạn > pending_payment).
 */
async function findResidenceContract(userId, { syncLifecycle = true } = {}) {
  if (!userId) return null;
  if (syncLifecycle) {
    try {
      await runContractLifecycleJobs();
    } catch {
      /* không chặn luồng chính */
    }
  }

  const now = endOfDay(new Date());
  const list = await Contract.find({
    user: userId,
    status: { $in: [...RESIDENCE_STATUSES] },
    endDate: { $gte: startOfDay(new Date()) },
  })
    .sort({ createdAt: -1 })
    .lean();

  const score = (c) => {
    if (c.status === "active" && isWithinStayPeriod(c)) return 300;
    if (c.status === "upcoming" && c.isRenewalContract && isWithinStayPeriod(c)) return 200;
    if (c.status === "pending_payment" && isWithinStayPeriod(c)) return 100;
    if (c.status === "active") return 50;
    if (c.status === "upcoming" && c.isRenewalContract) return 40;
    return 0;
  };

  let best = null;
  let bestScore = 0;
  for (const c of list) {
    const s = score(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}

async function isKtxMember(userId, options) {
  const c = await findResidenceContract(userId, options);
  if (!c) return false;
  if (c.status === "active" && isWithinStayPeriod(c)) return true;
  if (c.status === "upcoming" && c.isRenewalContract && isWithinStayPeriod(c)) return true;
  return false;
}

/** Cho phép gửi đơn chuyển phòng — cần HĐ active thực sự đang ở. */
async function canRequestRoomTransfer(userId) {
  const c = await findResidenceContract(userId);
  return !!(c && c.status === "active" && isWithinStayPeriod(c));
}

function mapDashboardStudentStatus(contract) {
  if (!contract) return "not_registered";
  if (contract.status === "active" && isWithinStayPeriod(contract)) return "member";
  if (contract.status === "upcoming" && contract.isRenewalContract) return "member";
  if (contract.status === "pending_payment") return "approved_waiting_payment";
  return "not_registered";
}

const MEMBER_LABEL = {
  member: "Thành viên KTX",
  approved_waiting_payment: "Chưa là thành viên — chờ ký hợp đồng & thanh toán",
  pending: "Chưa là thành viên — đơn nội trú chờ duyệt",
  not_registered: "Chưa là thành viên KTX",
};

module.exports = {
  findResidenceContract,
  isKtxMember,
  canRequestRoomTransfer,
  mapDashboardStudentStatus,
  isWithinStayPeriod,
  MEMBER_LABEL,
  RESIDENCE_STATUSES,
};
