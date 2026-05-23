import type { Contract, Room } from "../types";

export interface ContractDisplayPricing {
  pricingFrozen?: boolean;
  contractPrice?: number;
  roomMonthlySnapshot?: number;
  roomCapacityAtSigning?: number;
  baseSlotPriceBeforeDiscount?: number;
  priorityDiscountPercent?: number;
}

/** HĐ đã có hiệu lực / đã ký — không lấy giá live từ phòng. */
export function isContractPricingFrozen(c: Contract): boolean {
  if (c.displayPricing?.pricingFrozen) return true;
  if (c.financialLockedAt) return true;
  if (c.signedAt || c.studentSignStatus === "student_signed") return true;
  if (c.status === "active") return true;
  if (c.contractPrice != null && Number(c.contractPrice) >= 0) return true;
  return false;
}

function displayFromApi(c: Contract): ContractDisplayPricing | null {
  return (c as Contract & { displayPricing?: ContractDisplayPricing }).displayPricing ?? null;
}

/** Giá 1 slot/tháng đóng băng trên HĐ. */
export function effectiveContractPrice(c: Contract): number {
  const d = displayFromApi(c);
  if (d?.contractPrice != null && Number(d.contractPrice) >= 0) return Math.round(Number(d.contractPrice));
  if (c.contractPrice != null && Number(c.contractPrice) >= 0) return Math.round(Number(c.contractPrice));
  if (c.monthlyRent != null && Number(c.monthlyRent) > 0) return Math.round(Number(c.monthlyRent));
  return 0;
}

/** Giá cả phòng snapshot trên HĐ — không fallback room khi đã khóa. */
export function contractRoomMonthlySnapshot(c: Contract, room?: Room | null): number {
  const d = displayFromApi(c);
  if (d?.roomMonthlySnapshot != null && Number(d.roomMonthlySnapshot) > 0) {
    return Math.round(Number(d.roomMonthlySnapshot));
  }
  if (c.roomCurrentPriceSnapshot != null && Number(c.roomCurrentPriceSnapshot) > 0) {
    return Math.round(Number(c.roomCurrentPriceSnapshot));
  }
  if (isContractPricingFrozen(c)) {
    const slot = effectiveContractPrice(c);
    const cap = capacityAtSigning(c, null);
    if (slot > 0 && cap >= 1) return Math.round(slot * cap);
    return 0;
  }
  return Math.round(Number(room?.currentPrice ?? room?.price ?? 0));
}

export function capacityAtSigning(c: Contract, room?: Room | null): number {
  const d = displayFromApi(c);
  if (d?.roomCapacityAtSigning != null && Number(d.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(d.roomCapacityAtSigning));
  }
  if (c.roomCapacityAtSigning != null && Number(c.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(c.roomCapacityAtSigning));
  }
  if (isContractPricingFrozen(c)) return 1;
  const cap = Number(room?.maxCapacity ?? room?.capacity ?? 0);
  return Number.isFinite(cap) && cap >= 1 ? cap : 1;
}

export function roomFeePerSlot(c: Contract, room?: Room | null): number {
  const frozen = effectiveContractPrice(c);
  if (frozen > 0) return frozen;
  if (isContractPricingFrozen(c)) return 0;
  const full = contractRoomMonthlySnapshot(c, room) || Math.round(Number(room?.currentPrice ?? room?.price ?? 0));
  const slots = capacityAtSigning(c, room);
  return slots >= 1 ? Math.round(full / slots) : 0;
}

export const CONTRACT_CONSENT_LABEL =
  "Tôi đã đọc rõ, hiểu và cam kết tuân thủ đầy đủ các điều khoản hợp đồng và nội quy KTX.";
