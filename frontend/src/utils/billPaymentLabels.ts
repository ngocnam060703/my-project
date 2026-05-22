/** Nhãn phương thức thanh toán theo nghiệp vụ KTX */export function billPaymentMethodLabel(method?: string | null): string {
  const m = String(method || "").toLowerCase();
  if (m === "online" || m === "vnpay") return "Chuyển khoản qua VNPay";
  if (m === "counter" || m === "manual" || m === "cash") return "Sinh viên đã thanh toán tại quầy";
  return "—";
}

/** Người thực hiện / ghi nhận thanh toán */
export function billPaymentPayerLabel(bill: {
  status?: string;
  paymentMethod?: string | null;
  paidBy?: { fullName?: string; role?: string } | string | null;
}): string {
  if (bill.status !== "paid") return "—";
  const m = String(bill.paymentMethod || "").toLowerCase();
  if (m === "online" || m === "vnpay") return "Sinh viên";
  const paidBy = bill.paidBy;
  if (paidBy && typeof paidBy === "object" && paidBy.fullName) return paidBy.fullName;
  return "Ban quản lý";
}
