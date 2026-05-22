/** Nhãn loại hóa đơn — tách phạt kỷ luật / bồi thường HH / tháng */
export type BillTypeKey = "monthly" | "penalty" | "damage_reimbursement" | string | undefined;

export function billTypeLabel(billType?: BillTypeKey): string {
  if (billType === "penalty") return "Phạt vi phạm";
  if (billType === "damage_reimbursement") return "Bồi thường hư hỏng";
  return "Hóa đơn tháng";
}

export function billTypeTagColor(billType?: BillTypeKey): string {
  if (billType === "penalty") return "red";
  if (billType === "damage_reimbursement") return "volcano";
  return "blue";
}

export function billTypeShort(billType?: BillTypeKey): string {
  if (billType === "penalty") return "Phạt VP";
  if (billType === "damage_reimbursement") return "BT HH";
  return "Tháng";
}

export function billDetailTitle(billType?: BillTypeKey, month?: number, year?: number): string {
  if (billType === "penalty") return "phạt vi phạm";
  if (billType === "damage_reimbursement") return "bồi thường hư hỏng";
  return `${month}/${year}`;
}

export function isSpecialBill(billType?: BillTypeKey): boolean {
  return billType === "penalty" || billType === "damage_reimbursement";
}
