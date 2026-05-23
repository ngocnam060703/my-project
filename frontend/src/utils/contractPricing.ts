import type { Contract, Room } from "../types";

/** Giá đóng băng trên HĐ — không dùng room.price khi đã có contractPrice. */
export function effectiveContractPrice(c: Contract): number {
  if (c.contractPrice != null && Number(c.contractPrice) >= 0) return Math.round(Number(c.contractPrice));
  if (c.monthlyRent != null && Number(c.monthlyRent) > 0) return Math.round(Number(c.monthlyRent));
  return 0;
}

/** Giá cả phòng snapshot trên HĐ (nếu có); không fallback room.price khi đã ký. */
export function contractRoomMonthlySnapshot(c: Contract, room?: Room | null): number {
  if (c.roomCurrentPriceSnapshot != null && Number(c.roomCurrentPriceSnapshot) > 0) {
    return Math.round(Number(c.roomCurrentPriceSnapshot));
  }
  if (c.signedAt || c.studentSignStatus === "student_signed") return 0;
  return Math.round(Number(room?.currentPrice ?? room?.price ?? 0));
}

export function capacityAtSigning(c: Contract, room?: Room | null): number {
  if (c.roomCapacityAtSigning != null && Number(c.roomCapacityAtSigning) >= 1) {
    return Math.round(Number(c.roomCapacityAtSigning));
  }
  const cap = Number(room?.maxCapacity ?? room?.capacity ?? 0);
  return Number.isFinite(cap) && cap >= 1 ? cap : 1;
}

export function roomFeePerSlot(c: Contract, room?: Room | null): number {
  const frozen = effectiveContractPrice(c);
  if (frozen > 0) return frozen;
  const full = contractRoomMonthlySnapshot(c, room) || Math.round(Number(room?.currentPrice ?? room?.price ?? 0));
  const slots = capacityAtSigning(c, room);
  return Math.round(full / slots);
}

export const CONTRACT_CONSENT_LABEL =
  "Tôi đã đọc rõ, hiểu và cam kết tuân thủ đầy đủ các điều khoản hợp đồng và nội quy KTX.";
