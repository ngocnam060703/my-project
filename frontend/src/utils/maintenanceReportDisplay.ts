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
