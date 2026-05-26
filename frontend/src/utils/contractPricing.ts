import type { Contract, Room } from "../types";

export interface ContractDisplayPricing {
  pricingFrozen?: boolean;
  contractPrice?: number;
  roomMonthlySnapshot?: number;
  roomCapacityAtSigning?: number;
  baseSlotPriceBeforeDiscount?: number;
  priorityDiscountPercent?: number;
}

/** HĐ chờ SV ký — giá/slot lấy theo phòng hiện tại. */
export function isPendingContractAwaitingSign(c: Contract): boolean {
  if (c.status !== "pending_payment") return false;
  if (c.financialLockedAt || c.signedAt || c.studentSignStatus === "student_signed") return false;
  return true;
}

/** HĐ đã có hiệu lực / đã ký — không lấy giá live từ phòng. */
export function isContractPricingFrozen(c: Contract): boolean {
  if (c.displayPricing?.pricingFrozen) return true;
  if (c.financialLockedAt) return true;
  if (c.signedAt || c.studentSignStatus === "student_signed") return true;
  if (c.status === "active" || c.status === "upcoming") return true;
  if (isPendingContractAwaitingSign(c)) return false;
  return false;
}

function displayFromApi(c: Contract): ContractDisplayPricing | null {
  return (c as Contract & { displayPricing?: ContractDisplayPricing }).displayPricing ?? null;
}

/** Giá phòng/tháng — khớp trang Quản lý phòng (ưu tiên `price` rồi `currentPrice`). */
export function roomManagementMonthly(room?: Room | null): number {
  if (!room) return 0;
  return Math.round(Number(room.price ?? room.currentPrice ?? 0));
}

/** Giá 1 slot = giá phòng ÷ sức chứa. */
export function roomManagementSlotPrice(room?: Room | null): number {
  const monthly = roomManagementMonthly(room);
  const slots = Math.max(1, Math.round(Number(room?.capacity ?? room?.maxCapacity ?? 1)));
  return slots >= 1 ? Math.round(monthly / slots) : 0;
}

/** Giá cả phòng — HĐ chờ ký: live từ phòng; HĐ đã ký: snapshot trên HĐ. */
export function contractRoomMonthlySnapshot(c: Contract, room?: Room | null): number {
  const d = displayFromApi(c);
  if (!isContractPricingFrozen(c) && room) {
    const live = roomManagementMonthly(room);
    if (live > 0) return live;
  }
  if (d?.roomMonthlySnapshot != null && Number(d.roomMonthlySnapshot) > 0) {
    return Math.round(Number(d.roomMonthlySnapshot));
  }
  if (c.roomCurrentPriceSnapshot != null && Number(c.roomCurrentPriceSnapshot) > 0) {
    return Math.round(Number(c.roomCurrentPriceSnapshot));
  }
  return roomManagementMonthly(room);
}

export function capacityAtSigning(c: Contract, room?: Room | null): number {
  if (!isContractPricingFrozen(c) && room) {
    const cap = Math.max(1, Math.round(Number(room.capacity ?? room.maxCapacity ?? 1)));
    if (cap >= 1) return cap;
  }
  const d = displayFromApi(c);
  if (d?.roomCapacityAtSigning != null && Number(d.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(d.roomCapacityAtSigning));
  }
  if (c.roomCapacityAtSigning != null && Number(c.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(c.roomCapacityAtSigning));
  }
  const cap = Number(room?.maxCapacity ?? room?.capacity ?? 0);
  return Number.isFinite(cap) && cap >= 1 ? cap : 1;
}

/** Giá 01 slot/tháng trên HĐ = tổng phòng ÷ số chỗ (không ưu đãi). */
export function contractSlotPriceMonthly(c: Contract, room?: Room | null): number {
  const d = displayFromApi(c);
  if (d?.roomMonthlySnapshot != null && d?.roomCapacityAtSigning != null) {
    const full = Number(d.roomMonthlySnapshot);
    const cap = Number(d.roomCapacityAtSigning);
    if (full > 0 && cap >= 1) return Math.round(full / cap);
  }
  const full = contractRoomMonthlySnapshot(c, room);
  const slots = capacityAtSigning(c, room);
  return slots >= 1 && full > 0 ? Math.round(full / slots) : 0;
}

export function roomFeePerSlot(c: Contract, room?: Room | null): number {
  return contractSlotPriceMonthly(c, room);
}

export const CONTRACT_CONSENT_LABEL =
  "Tôi đã đọc rõ, hiểu và cam kết tuân thủ đầy đủ các điều khoản hợp đồng và nội quy KTX.";
