import type {
  MaintenanceIncidentType,
  MaintenanceReport,
  MaintenanceReportStatus,
  MaintenanceDamageCause,
  MaintenanceResolutionType,
  MaintenanceSeverity,
  MaintenanceStatus,
} from "../types";

export const INCIDENT_LABEL: Record<MaintenanceIncidentType, string> = {
  electricity: "Điện",
  water: "Nước",
  equipment: "Thiết bị",
  other: "Khác",
};

export const STATUS_MAP: Record<
  MaintenanceReportStatus,
  { color: string; label: string }
> = {
  pending: { color: "orange", label: "Chờ kiểm tra" },
  processing: { color: "blue", label: "Đang sửa chữa" },
  resolved: { color: "green", label: "Đã khắc phục" },
  cancelled: { color: "default", label: "Đã hủy" },
};

export const SEVERITY_LABEL: Record<MaintenanceSeverity, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
  "": "—",
};

export const DAMAGE_CAUSE_LABEL: Record<MaintenanceDamageCause, string> = {
  natural_wear: "Thiết bị bảo trì / Hao mòn tự nhiên",
  student_caused: "Sinh viên làm hỏng",
  "": "—",
};

export const RESOLUTION_LABEL: Record<MaintenanceResolutionType, string> = {
  maintenance: "Yêu cầu bảo trì",
  compensation: "Bồi thường",
  "": "—",
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  none: "—",
  scheduled: "Đã lên lịch",
  in_progress: "Đang sửa",
  completed: "Hoàn thành bảo trì",
  "": "—",
};

export const formatMoney = (v?: number | null) =>
  (v ?? 0).toLocaleString("vi-VN") + "đ";

/** InputNumber VNĐ — nhập từng đồng (trăm, nghìn…), hiển thị dấu chấm phân cách nghìn. */
export const vndAmountInputNumberProps = {
  min: 0,
  step: 1,
  precision: 0,
  controls: true,
  formatter: (value: number | string | undefined) => {
    if (value === undefined || value === null || value === "") return "";
    return `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  },
  parser: (value: string | undefined) => {
    const digits = (value ?? "").replace(/\./g, "").replace(/[^\d]/g, "");
    if (digits === "") return "" as unknown as number;
    return Number(digits);
  },
} as const;

export function requestCodeDisplay(r: MaintenanceReport): string {
  if (r.requestCode) return r.requestCode;
  const y = r.createdAt ? new Date(r.createdAt).getFullYear() : "";
  return `YC-${y}${String(r._id).slice(-6).toUpperCase()}`;
}

export function incidentAreaLabel(type?: MaintenanceIncidentType): string {
  if (!type) return "—";
  return INCIDENT_LABEL[type] || type;
}

/** Thiết bị/vật tư hỏng — ưu tiên snapshot trên đơn. */
export function damagedItemDisplay(r: MaintenanceReport): string {
  if (r.damagedItemLabel?.trim()) return r.damagedItemLabel.trim();
  if (r.incidentType) return incidentAreaLabel(r.incidentType);
  return "—";
}

const PAYABLE_BILL_STATUSES = new Set(["unpaid", "pending", "overdue"]);

/** SV: đã có phán quyết nguyên nhân từ BQL. */
export function hasAdminRuling(r: MaintenanceReport): boolean {
  return r.status === "resolved" && !!r.damageCause;
}

/** SV: được thanh toán VNPay trên trang khai báo hư hỏng. */
export function canPayMaintenanceCompensation(r: MaintenanceReport): boolean {
  if (r.status !== "resolved" || r.damageCause !== "student_caused") return false;
  const b = r.compensationBill;
  if (!b?._id) return false;
  return PAYABLE_BILL_STATUSES.has(String(b.status)) && Number(b.total) > 0;
}
