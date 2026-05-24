/** Nhãn loại hóa đơn — tách phạt kỷ luật / bồi thường HH / tháng */
export type BillTypeKey = "monthly" | "penalty" | "damage_reimbursement" | string | undefined;

export function billTypeLabel(billType?: BillTypeKey): string {
  if (billType === "penalty") return "Phạt vi phạm";
  if (billType === "damage_reimbursement") return "Bồi thường hư hỏng";
  if (billType === "transfer_supplement") return "Phụ thu chuyển phòng";
  return "Hóa đơn tháng";
}

export function billTypeTagColor(billType?: BillTypeKey): string {
  if (billType === "penalty") return "red";
  if (billType === "damage_reimbursement") return "volcano";
  if (billType === "transfer_supplement") return "purple";
  return "blue";
}

export function billTypeShort(billType?: BillTypeKey): string {
  if (billType === "penalty") return "Phạt VP";
  if (billType === "damage_reimbursement") return "BT HH";
  if (billType === "transfer_supplement") return "Phụ thu CP";
  return "Tháng";
}

export function billDetailTitle(billType?: BillTypeKey, month?: number, year?: number): string {
  if (billType === "penalty") return "phạt vi phạm";
  if (billType === "damage_reimbursement") return "bồi thường hư hỏng";
  if (billType === "transfer_supplement") return `phụ thu chuyển phòng ${month}/${year}`;
  return `${month}/${year}`;
}

export function isSpecialBill(billType?: BillTypeKey): boolean {
  return billType === "penalty" || billType === "damage_reimbursement" || billType === "transfer_supplement";
}

export function isTransferSupplementBill(billType?: BillTypeKey): boolean {
  return billType === "transfer_supplement";
}
