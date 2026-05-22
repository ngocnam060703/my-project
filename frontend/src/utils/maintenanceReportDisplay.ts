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
  pending: { color: "orange", label: "Chờ xử lý" },
  processing: { color: "blue", label: "Đang xử lý" },
  resolved: { color: "green", label: "Đã xử lý" },
  cancelled: { color: "default", label: "Đã hủy" },
};

export const SEVERITY_LABEL: Record<MaintenanceSeverity, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
  "": "—",
};

export const DAMAGE_CAUSE_LABEL: Record<MaintenanceDamageCause, string> = {
  natural_wear: "Hỏng tự nhiên / xuống cấp CSVC",
  student_caused: "Do sinh viên gây ra",
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
