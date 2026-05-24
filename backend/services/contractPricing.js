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

function roomCurrentPrice(roomDoc) {
  if (!roomDoc) return 0;
  const v = roomDoc.currentPrice != null ? roomDoc.currentPrice : roomDoc.price;
  return Math.max(0, Math.round(Number(v) || 0));
}

function roomMaxCapacity(roomDoc) {
  if (!roomDoc) return 1;
  const mc = roomDoc.maxCapacity != null ? Number(roomDoc.maxCapacity) : Number(roomDoc.capacity);
  return Math.max(1, Math.round(mc) || 1);
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
  const priorityDiscountPercent = discountPercentForPriority(priorityPolicyType);
  const contractPrice = Math.round((baseSlotPrice * (100 - priorityDiscountPercent)) / 100);

  return {
    contractPrice,
    roomCurrentPriceSnapshot: roomMonthly,
    roomCapacityAtSigning: capAtSigning,
    priorityPolicyType,
    priorityDiscountPercent,
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

/** HĐ đã có hiệu lực / đã ký — không được lấy giá/sức chứa từ phòng live. */
function isContractPricingFrozen(contractDoc) {
  if (!contractDoc) return false;
  if (contractDoc.financialLockedAt || contractDoc.signedAt) return true;
  if (contractDoc.studentSignStatus === "student_signed") return true;
  if (String(contractDoc.status || "") === "active" || String(contractDoc.status || "") === "upcoming") return true;
  if (contractDoc.contractPrice != null && Number(contractDoc.contractPrice) >= 0) return true;
  return false;
}

function hasPricingSnapshot(contractDoc) {
  return contractDoc?.contractPrice != null && Number(contractDoc.contractPrice) >= 0;
}

/**
 * Gán snapshot lên document Contract (chưa save).
 * @param {boolean} force — chỉ true khi tạo HĐ mới / gia hạn
 */
function applyPricingSnapshotToContract(contractDoc, { roomDoc, userDoc, force = false }) {
  if (!contractDoc || !roomDoc) return contractDoc;
  if (!force && hasPricingSnapshot(contractDoc)) return contractDoc;
  if (!force && isContractPricingFrozen(contractDoc)) return contractDoc;
  const pricing = buildContractPricingFields({ roomDoc, userDoc });
  Object.assign(contractDoc, pricing);
  return contractDoc;
}

/** Giá hiển thị cho UI/API — không bao giờ fallback phòng khi HĐ đã khóa. */
function resolveContractDisplayPricing(contractDoc, roomDoc = null) {
  const frozen = isContractPricingFrozen(contractDoc);
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

async function ensureContractPricingSnapshot(contractId) {
  const contract = await Contract.findById(contractId);
  if (!contract || hasPricingSnapshot(contract)) return contract;
  if (!isContractPricingFrozen(contract) && String(contract.status) !== "pending_payment") {
    return contract;
  }
  const [roomDoc, userDoc] = await Promise.all([
    Room.findById(contract.room).lean(),
    User.findById(contract.user).select("priorityType").lean(),
  ]);
  if (!roomDoc) return contract;
  applyPricingSnapshotToContract(contract, { roomDoc, userDoc, force: true });
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
  roomCurrentPrice,
  roomMaxCapacity,
  buildContractPricingFields,
  hasPricingSnapshot,
  effectiveContractPrice,
  effectiveCapacityAtSigning,
  contractFinancialsLocked,
  contractProtectedFromRoomPriceChange,
  isContractPricingFrozen,
  applyPricingSnapshotToContract,
  resolveContractDisplayPricing,
  ensureContractPricingSnapshot,
  assertNoManualPricingInBody,
  discountPercentForPriority,
};
