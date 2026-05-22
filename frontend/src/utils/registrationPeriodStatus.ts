import dayjs from "dayjs";

export type RegistrationPeriodStatus = "not_open" | "open" | "closed";

export interface RegistrationPeriodLike {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export const REGISTRATION_STATUS_LABEL: Record<RegistrationPeriodStatus, string> = {
  not_open: "Chưa mở",
  open: "Đang mở",
  closed: "Đã đóng",
};

export const REGISTRATION_STATUS_COLOR: Record<RegistrationPeriodStatus, string> = {
  not_open: "orange",
  open: "green",
  closed: "default",
};

/** Trạng thái đợt theo khoảng thời gian start/end — không phụ thuộc isActive. */
export function getRegistrationPeriodStatus(
  period: RegistrationPeriodLike,
  nowMs: number = Date.now(),
): RegistrationPeriodStatus {
  const now = dayjs(nowMs);
  const start = dayjs(period.startDate);
  const end = dayjs(period.endDate);
  if (now.isBefore(start)) return "not_open";
  if (now.isAfter(end)) return "closed";
  return "open";
}

/** Chọn đợt hiển thị: đang mở → sắp mở → vừa đóng gần nhất. */
export function pickDisplayRegistrationPeriod(
  periods: RegistrationPeriodLike[],
  nowMs: number = Date.now(),
): RegistrationPeriodLike | null {
  if (!periods.length) return null;

  const now = dayjs(nowMs);
  const openNow = periods.find((p) => getRegistrationPeriodStatus(p, nowMs) === "open");
  if (openNow) return openNow;

  const upcoming = periods
    .filter((p) => now.isBefore(dayjs(p.startDate)))
    .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf());
  if (upcoming.length) return upcoming[0];

  const past = periods
    .filter((p) => now.isAfter(dayjs(p.endDate)))
    .sort((a, b) => dayjs(b.endDate).valueOf() - dayjs(a.endDate).valueOf());
  return past[0] || periods[0];
}

export function formatCountdownTo(targetIso: string, nowMs: number = Date.now()): string {
  const diffMs = dayjs(targetIso).diff(dayjs(nowMs));
  if (diffMs <= 0) return "00:00:00";
  const totalSeconds = Math.floor(diffMs / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function buildRegistrationStatusDetail(
  period: RegistrationPeriodLike | null,
  nowMs: number = Date.now(),
  countdown?: string,
): string {
  if (!period) return "Chưa có đợt đăng ký nào";

  const status = getRegistrationPeriodStatus(period, nowMs);
  const start = dayjs(period.startDate).format("DD/MM/YYYY HH:mm");
  const end = dayjs(period.endDate).format("DD/MM/YYYY HH:mm");

  if (status === "open") {
    return `${period.name} — mở đến ${end}${countdown ? ` (còn ${countdown})` : ""}`;
  }
  if (status === "not_open") {
    return `${period.name} — bắt đầu ${start}${countdown ? ` (còn ${countdown})` : ""}`;
  }
  return `${period.name} — đã kết thúc ${end}`;
}
