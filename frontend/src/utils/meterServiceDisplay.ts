/** Trạng thái chuẩn hóa dịch vụ đồng hồ (BS5) */

export type MeterBillingStatus = "open" | "closed";
export type MeterPaymentStatus = "none" | "unpaid" | "paid" | "overdue";
export type MeterServiceStatus = "recorded" | "pending";

export const BILLING_STATUS_LABEL: Record<MeterBillingStatus, string> = {
  open: "Chưa chốt",
  closed: "Đã chốt HĐ",
};

export const BILLING_STATUS_CLASS: Record<MeterBillingStatus, string> = {
  open: "text-bg-warning text-dark",
  closed: "text-bg-info",
};

export const PAYMENT_STATUS_LABEL: Record<MeterPaymentStatus, string> = {
  none: "—",
  unpaid: "Chờ thanh toán",
  paid: "Đã thanh toán",
  overdue: "Quá hạn",
};

export const PAYMENT_STATUS_CLASS: Record<MeterPaymentStatus, string> = {
  none: "text-bg-secondary",
  unpaid: "text-bg-warning text-dark",
  paid: "text-bg-success",
  overdue: "text-bg-danger",
};

export const SERVICE_STATUS_LABEL: Record<MeterServiceStatus, string> = {
  recorded: "Đã nhập CS",
  pending: "Chưa nhập",
};

/** Nhãn tổng hợp theo nghiệp vụ KTX */
export function meterDisplayStatus(billingStatus?: string, paymentStatus?: string): string {
  if (billingStatus !== "closed") return "Chưa chốt";
  if (paymentStatus === "paid") return "Đã thanh toán";
  if (paymentStatus === "overdue") return "Quá hạn";
  if (paymentStatus === "unpaid") return "Chờ thanh toán";
  return "Đã chốt hóa đơn";
}

export function meterPeriodLockedMessage(billingStatus?: string): string | null {
  if (billingStatus === "closed") {
    return "Kỳ điện nước này đã được chốt hóa đơn — không thể chỉnh sửa chỉ số.";
  }
  return null;
}
