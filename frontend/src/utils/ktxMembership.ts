import type { Contract } from "../types";

/** Hợp đồng đang cư trú / có hiệu lực để hiển thị UI (khớp logic backend). */
export function pickResidenceContract(contracts: Contract[]): Contract | null {
  if (!contracts.length) return null;
  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);

  const inStay = (c: Contract) => {
    const end = c.endDate ? new Date(c.endDate).getTime() : 0;
    const start = c.startDate ? new Date(c.startDate).getTime() : 0;
    if (end < startToday.getTime()) return false;
    if (start > endToday.getTime()) return false;
    return true;
  };

  const score = (c: Contract) => {
    if (c.status === "active" && inStay(c)) return 300;
    if (c.status === "upcoming" && inStay(c)) return 200;
    if (c.status === "pending_payment" && inStay(c)) return 100;
    if (c.status === "active") return 50;
    if (c.status === "upcoming") return 40;
    return 0;
  };

  let best: Contract | null = null;
  let bestScore = 0;
  for (const c of contracts) {
    const s = score(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Chỉ HĐ active trong thời hạn mới được chuyển phòng. */
export function canRequestRoomTransfer(contracts: Contract[]): boolean {
  const c = pickResidenceContract(contracts);
  return c?.status === "active";
}
