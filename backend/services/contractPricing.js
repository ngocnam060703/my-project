/**
 * Snapshot pricing & grandfathering — giá/sức chứa đóng băng trên Contract.
 * - HĐ mới: snapshot currentPrice + maxCapacity từ Room.
 * - HĐ active: không đổi khi admin sửa phòng.
 * - Gia hạn (renew): HĐ mới lấy giá phòng hiện tại.
 */

const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");

const PRIORITY_DISCOUNT_PERCENT = {
  normal: 0,
  martyr_child: 50,
  invalid_child: 30,
  minority: 15,
  disabled: 25,
};

const DEFAULT_DEPOSIT_VND = 100000;

/** Trường giá snapshot — không được ghi đè khi HĐ đã khóa. */
const CONTRACT_PRICING_FIELD_KEYS = [
  "contractPrice",
  "monthlyRent",
  "depositAmount",
  "roomCurrentPriceSnapshot",
  "roomCapacityAtSigning",
  "priorityPolicyType",
  "priorityDiscountPercent",
  "baseSlotPriceBeforeDiscount",
];

/** Khớp trang Quản lý phòng: ưu tiên `price` rồi `currentPrice`. */
function roomCurrentPrice(roomDoc) {
  if (!roomDoc) return 0;
  const v = roomDoc.price != null ? roomDoc.price : roomDoc.currentPrice;
  return Math.max(0, Math.round(Number(v) || 0));
}

function roomMaxCapacity(roomDoc) {
  if (!roomDoc) return 1;
  const cap = roomDoc.capacity != null ? Number(roomDoc.capacity) : Number(roomDoc.maxCapacity);
  return Math.max(1, Math.round(cap) || 1);
}

function discountPercentForPriority(priorityType) {
  const key = String(priorityType || "normal").trim() || "normal";
  return PRIORITY_DISCOUNT_PERCENT[key] ?? 0;
}

/**
 * @param {{ roomDoc: object, userDoc?: { priorityType?: string } | null, isRenewal?: boolean }} params
 */
function buildContractPricingFields({ roomDoc, userDoc }) {
  const roomMonthly = roomCurrentPrice(roomDoc);
  const capAtSigning = roomMaxCapacity(roomDoc);
  const baseSlotPrice = Math.round(roomMonthly / capAtSigning);
  const priorityPolicyType = String(userDoc?.priorityType || "normal").trim() || "normal";
  /** Không áp dụng giảm giá ưu đãi — giá slot = giá phòng ÷ sức chứa. */
  const contractPrice = baseSlotPrice;

  return {
    contractPrice,
    roomCurrentPriceSnapshot: roomMonthly,
    roomCapacityAtSigning: capAtSigning,
    priorityPolicyType,
    priorityDiscountPercent: 0,
    baseSlotPriceBeforeDiscount: baseSlotPrice,
    monthlyRent: contractPrice,
    depositAmount: DEFAULT_DEPOSIT_VND,
  };
}

function effectiveContractPrice(contractDoc) {
  if (!contractDoc) return 0;
  if (contractDoc.contractPrice != null && Number(contractDoc.contractPrice) >= 0) {
    return Math.round(Number(contractDoc.contractPrice));
  }
  if (contractDoc.monthlyRent != null && Number(contractDoc.monthlyRent) > 0) {
    return Math.round(Number(contractDoc.monthlyRent));
  }
  return 0;
}

function effectiveCapacityAtSigning(contractDoc, roomDoc = null) {
  if (contractDoc?.roomCapacityAtSigning != null && Number(contractDoc.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(contractDoc.roomCapacityAtSigning));
  }
  if (isContractPricingFrozen(contractDoc)) {
    return 1;
  }
  return roomMaxCapacity(roomDoc);
}

function contractFinancialsLocked(contractDoc) {
  return !!(contractDoc?.signedAt || contractDoc?.studentSignStatus === "student_signed");
}

/** HĐ đang active/pending — không được cập nhật giá từ phòng */
function contractProtectedFromRoomPriceChange(contractDoc) {
  const st = String(contractDoc?.status || "");
  return st === "active" || st === "pending_payment" || st === "upcoming";
}

/** HĐ chuyển phòng chờ ký: đã snapshot lúc tạo nhưng chưa khóa — cập nhật lại khi SV ký. */
function isTransferContractAwaitingSign(contractDoc) {
  if (!contractDoc?.isTransferContract) return false;
  if (String(contractDoc.status || "") !== "pending_payment") return false;
  return !contractDoc.signedAt && !contractDoc.financialLockedAt;
}

/** HĐ chờ ký (pending_payment) — được cập nhật snapshot theo giá phòng hiện tại. */
function isPendingContractAwaitingSign(contractDoc) {
  if (!contractDoc) return false;
  if (isTransferContractAwaitingSign(contractDoc)) return true;
  if (String(contractDoc.status || "") !== "pending_payment") return false;
  if (contractDoc.financialLockedAt || contractDoc.signedAt) return false;
  if (contractDoc.studentSignStatus === "student_signed") return false;
  return true;
}

/** HĐ đã có hiệu lực / đã ký — không được lấy giá/sức chứa từ phòng live. */
function isContractPricingFrozen(contractDoc) {
  if (!contractDoc) return false;
  if (contractDoc.financialLockedAt || contractDoc.signedAt) return true;
  if (contractDoc.studentSignStatus === "student_signed") return true;
  const st = String(contractDoc.status || "");
  if (st === "active" || st === "upcoming") return true;
  if (isTransferContractAwaitingSign(contractDoc)) return false;
  if (isPendingContractAwaitingSign(contractDoc)) return false;
  return false;
}

/** HĐ chuyển phòng mới (admin duyệt): giá phòng + slot theo phòng đích. */
function buildTransferContractPricingOnCreate({ roomDoc, userDoc }) {
  return buildContractPricingFields({ roomDoc, userDoc });
}

/** HĐ chuyển phòng khi SV ký: snapshot phòng đích rồi khóa giá/slot. */
function lockTransferContractPricingOnSign(contractDoc, { roomDoc, userDoc, lockedAt = new Date() }) {
  if (!contractDoc || !roomDoc) return contractDoc;
  if (contractDoc.financialLockedAt && contractDoc.signedAt) return contractDoc;
  Object.assign(contractDoc, buildContractPricingFields({ roomDoc, userDoc }));
  contractDoc.financialLockedAt = lockedAt;
  return contractDoc;
}

function hasPricingSnapshot(contractDoc) {
  return contractDoc?.contractPrice != null && Number(contractDoc.contractPrice) >= 0;
}

/**
 * Gán snapshot lên document Contract (chưa save).
 * Chỉ cho HĐ pending_payment chưa có giá — bỏ qua `force` nếu HĐ đã khóa.
 */
function applyPricingSnapshotToContract(contractDoc, { roomDoc, userDoc }, { force = false } = {}) {
  if (!contractDoc || !roomDoc) return contractDoc;
  if (isContractPricingFrozen(contractDoc)) return contractDoc;
  const pendingAwaiting = isPendingContractAwaitingSign(contractDoc);
  if (!pendingAwaiting && !force) {
    if (hasPricingSnapshot(contractDoc)) return contractDoc;
    if (String(contractDoc.status || "") !== "pending_payment") return contractDoc;
  }
  if (contractDoc.signedAt || contractDoc.financialLockedAt) return contractDoc;
  const pricing = buildContractPricingFields({ roomDoc, userDoc });
  Object.assign(contractDoc, pricing);
  return contractDoc;
}

/** Cập nhật giá/slot trên HĐ chờ ký theo giá phòng hiện tại (không đụng HĐ đã ký). */
async function refreshPendingContractsInRoom(roomId) {
  if (!roomId) return { updated: 0 };
  const roomDoc = await Room.findById(roomId).lean();
  if (!roomDoc) return { updated: 0 };
  const contracts = await Contract.find({
    room: roomId,
    status: "pending_payment",
    signedAt: null,
    financialLockedAt: null,
    studentSignStatus: { $ne: "student_signed" },
  }).select("_id user");
  let updated = 0;
  for (const row of contracts) {
    const userDoc = await User.findById(row.user).select("priorityType").lean();
    const doc = await Contract.findById(row._id);
    if (!doc || isContractPricingFrozen(doc)) continue;
    applyPricingSnapshotToContract(doc, { roomDoc, userDoc }, { force: true });
    await doc.save();
    updated += 1;
  }
  return { updated };
}

function pricingFieldsInUpdate(update) {
  if (!update || typeof update !== "object") return [];
  const set = update.$set && typeof update.$set === "object" ? update.$set : update;
  return CONTRACT_PRICING_FIELD_KEYS.filter((k) => set[k] !== undefined);
}

function assertContractPricingUpdateAllowed(contractDoc, update) {
  const keys = pricingFieldsInUpdate(update);
  if (!keys.length || !contractDoc) return;
  if (!isContractPricingFrozen(contractDoc)) return;
  const err = new Error(
    "Hợp đồng đã khóa giá — không được thay đổi tiền phòng/slot/sức chứa trên bản ghi HĐ",
  );
  err.statusCode = 409;
  throw err;
}

/** Hoàn nguyên field giá nếu document đã khóa (pre-save). */
async function revertLockedPricingFieldsOnSave(contractDoc) {
  if (!contractDoc || contractDoc.isNew) return;
  const modified = CONTRACT_PRICING_FIELD_KEYS.filter((f) => contractDoc.isModified(f));
  if (!modified.length) return;
  if (!isContractPricingFrozen(contractDoc)) return;
  const prev = await Contract.findById(contractDoc._id)
    .select(CONTRACT_PRICING_FIELD_KEYS.join(" "))
    .lean();
  if (!prev) return;
  for (const f of modified) {
    contractDoc.set(f, prev[f]);
  }
}

/** Giá hiển thị cho UI/API — HĐ chờ ký lấy giá live từ quản lý phòng; HĐ đã ký chỉ dùng snapshot. */
function resolveContractDisplayPricing(contractDoc, roomDoc = null) {
  const frozen = isContractPricingFrozen(contractDoc);

  if (!frozen && roomDoc && isPendingContractAwaitingSign(contractDoc)) {
    const userDoc = { priorityType: contractDoc?.priorityPolicyType || "normal" };
    const live = buildContractPricingFields({ roomDoc, userDoc });
    const cap = live.roomCapacityAtSigning;
    const full = live.roomCurrentPriceSnapshot;
    const slot = cap >= 1 && full > 0 ? Math.round(full / cap) : live.contractPrice;
    return {
      pricingFrozen: false,
      contractPrice: slot,
      roomMonthlySnapshot: full,
      roomCapacityAtSigning: cap,
      baseSlotPriceBeforeDiscount: slot,
      priorityDiscountPercent: 0,
    };
  }

  const slotPrice = effectiveContractPrice(contractDoc);
  const capacity = effectiveCapacityAtSigning(contractDoc, frozen ? null : roomDoc);
  let roomMonthly = 0;
  if (contractDoc?.roomCurrentPriceSnapshot != null && Number(contractDoc.roomCurrentPriceSnapshot) > 0) {
    roomMonthly = Math.round(Number(contractDoc.roomCurrentPriceSnapshot));
  } else if (!frozen && roomDoc) {
    roomMonthly = roomCurrentPrice(roomDoc);
  } else if (slotPrice > 0 && capacity >= 1) {
    roomMonthly = Math.round(slotPrice * capacity);
  }
  return {
    pricingFrozen: frozen,
    contractPrice: slotPrice,
    roomMonthlySnapshot: roomMonthly,
    roomCapacityAtSigning: capacity,
    baseSlotPriceBeforeDiscount:
      contractDoc?.baseSlotPriceBeforeDiscount != null
        ? Math.round(Number(contractDoc.baseSlotPriceBeforeDiscount))
        : capacity >= 1
          ? Math.round(roomMonthly / capacity)
          : 0,
    priorityDiscountPercent: Number(contractDoc?.priorityDiscountPercent || 0),
  };
}

async function ensureContractPricingSnapshot(contractId, { force = false } = {}) {
  const contract = await Contract.findById(contractId);
  if (!contract) return contract;
  /** Đã ký / active / upcoming — không bao giờ ghi đè giá từ phòng live. */
  if (isContractPricingFrozen(contract)) return contract;
  if (!force && hasPricingSnapshot(contract) && !isPendingContractAwaitingSign(contract)) return contract;
  if (String(contract.status) !== "pending_payment" && !force) {
    return contract;
  }
  const [roomDoc, userDoc] = await Promise.all([
    Room.findById(contract.room).lean(),
    User.findById(contract.user).select("priorityType").lean(),
  ]);
  if (!roomDoc) return contract;
  applyPricingSnapshotToContract(contract, { roomDoc, userDoc }, { force: isPendingContractAwaitingSign(contract) });
  if (!contract.financialLockedAt && (contract.signedAt || contract.status === "active")) {
    contract.financialLockedAt = contract.signedAt || contract.paymentConfirmedAt || new Date();
  }
  await contract.save();
  return contract;
}

function assertNoManualPricingInBody(body) {
  const forbidden = [
    "contractPrice",
    "monthlyRent",
    "depositAmount",
    "roomCurrentPriceSnapshot",
    "roomCapacityAtSigning",
    "priorityDiscountPercent",
  ];
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && String(body[key]).trim() !== "") {
      const err = new Error(`Không được gửi trường "${key}" — hệ thống tự snapshot từ cấu hình phòng`);
      err.statusCode = 400;
      throw err;
    }
  }
}

module.exports = {
  PRIORITY_DISCOUNT_PERCENT,
  DEFAULT_DEPOSIT_VND,
  CONTRACT_PRICING_FIELD_KEYS,
  roomCurrentPrice,
  roomMaxCapacity,
  buildContractPricingFields,
  buildTransferContractPricingOnCreate,
  lockTransferContractPricingOnSign,
  isTransferContractAwaitingSign,
  isPendingContractAwaitingSign,
  hasPricingSnapshot,
  effectiveContractPrice,
  effectiveCapacityAtSigning,
  contractFinancialsLocked,
  contractProtectedFromRoomPriceChange,
  isContractPricingFrozen,
  applyPricingSnapshotToContract,
  refreshPendingContractsInRoom,
  resolveContractDisplayPricing,
  ensureContractPricingSnapshot,
  assertNoManualPricingInBody,
  assertContractPricingUpdateAllowed,
  pricingFieldsInUpdate,
  revertLockedPricingFieldsOnSave,
  discountPercentForPriority,
};
