import type { Violation } from "../types";

/** Tiền phạt ghi nhận lúc tạo vi phạm */
export function violationRecordedFine(v: Violation): number {
  return Math.max(0, Number(v.fineAmount) || 0);
}

/** Bồi thường ghi nhận lúc tạo */
export function violationRecordedCompensation(v: Violation): number {
  return Math.max(0, Number(v.compensationAmount) || 0);
}

/** Tổng phạt + bồi thường lúc ghi nhận */
export function violationRecordedTotal(v: Violation): number {
  return violationRecordedFine(v) + violationRecordedCompensation(v);
}

/** Hiển thị cột «Phạt»: ưu tiên quyết định xử lý nếu đã resolved + fine */
export function violationFineDisplay(v: Violation): number {
  if (v.status === "resolved" && v.resolution?.actionType === "fine") {
    return Math.max(0, Number(v.resolution.penaltyAmount ?? v.fineAmount) || 0);
  }
  return violationRecordedFine(v);
}
