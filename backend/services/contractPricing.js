/**
 * Snapshot pricing & grandfathering — giá/sức chứa đóng băng trên Contract.
 * - HĐ mới: snapshot currentPrice + maxCapacity từ Room.
 * - HĐ active: không đổi khi admin sửa phòng.
 * - Gia hạn (renew): HĐ mới lấy giá phòng hiện tại.
 */

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
  if (contractDoc?.signedAt || contractDoc?.studentSignStatus === "student_signed") {
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
  return st === "active" || st === "pending_payment";
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
  effectiveContractPrice,
  effectiveCapacityAtSigning,
  contractFinancialsLocked,
  contractProtectedFromRoomPriceChange,
  assertNoManualPricingInBody,
  discountPercentForPriority,
};
