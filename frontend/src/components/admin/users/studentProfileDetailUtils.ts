import dayjs from "dayjs";
import type { Bed, Contract, Room } from "../../../types";

export function slotPriceVnd(room: Room | null | undefined): number {
  if (!room) return 0;
  if (typeof room.pricePerPerson === "number" && room.pricePerPerson > 0) return Math.round(room.pricePerPerson);
  const cap = Number(room.capacity || 0);
  const price = Number(room.price || 0);
  return cap > 0 ? Math.round(price / cap) : 0;
}

export function formatBedEquipmentVi(raw: string | undefined | null): string {
  const k = String(raw || "").trim().toLowerCase();
  if (!k) return "—";
  const map: Record<string, string> = {
    good: "Hoạt động tốt",
    ok: "Hoạt động tốt",
    excellent: "Hoạt động tốt",
    maintenance: "Đang bảo trì",
    maintaining: "Đang bảo trì",
    repair: "Đang bảo trì",
    broken: "Hỏng",
    damaged: "Hỏng",
    bad: "Hỏng",
    poor: "Hỏng",
  };
  return map[k] || String(raw ?? "").trim();
}

export function contractBedCode(c: Contract): string {
  const b = c.bed;
  if (!b) return "—";
  if (typeof b === "object" && b !== null && "code" in b) return String((b as Bed).code || "") || "—";
  return "—";
}

export function contractBedComposite(c: Contract): string {
  const rn = String((typeof c.room === "object" && c.room ? c.room.roomNumber : "") || "").trim();
  const bc = contractBedCode(c);
  if (bc === "—") return "—";
  if (rn && bc.startsWith(`${rn}-`)) return bc;
  if (rn) return `${rn}-${bc}`;
  return bc;
}

export function contractBedEquipment(c: Contract): string {
  const b = c.bed;
  if (b && typeof b === "object" && "equipmentStatus" in b) {
    return formatBedEquipmentVi(String((b as Bed).equipmentStatus || ""));
  }
  return "—";
}

type OccupancyBadgeUi = { bg: string; border: string; text: string };

export function residencyStayStatusDisplay(status?: string | null): { color: string; text: string; emoji?: string } {
  switch (String(status || "")) {
    case "pending_checkin":
      return { color: "gold", text: "Chờ check-in", emoji: "🟡" };
    case "staying":
      return { color: "success", text: "Đang ở", emoji: "🟢" };
    case "checked_out":
      return { color: "default", text: "Đã check-out", emoji: "⚪" };
    case "ended_cancelled":
      return { color: "error", text: "Đã kết thúc (HĐ hủy)", emoji: "🔴" };
    case "ended_transfer_settled":
      return { color: "purple", text: "Đã thanh lý (chuyển phòng)", emoji: "🟣" };
    case "ended_terminated":
      return { color: "default", text: "Đã chấm dứt HĐ", emoji: "⚪" };
    case "ended_expired":
      return { color: "default", text: "Hết hạn HĐ", emoji: "⚪" };
    case "pending_bed":
      return { color: "processing", text: "Chờ phân giường" };
    case "not_started":
      return { color: "blue", text: "Chưa bắt đầu kỳ" };
    default:
      return { color: "default", text: status || "—" };
  }
}

export function occupancyOperationalBadgeLarge(
  status: string | null | undefined,
  stayHistoryLen: number,
): OccupancyBadgeUi | null {
  if (!status) return null;
  if (status === "checked_in_staying") return { bg: "#ecfdf5", border: "#10b981", text: "Đang ở" };
  if (status === "assigned_pending_checkin") return { bg: "#fffbeb", border: "#f59e0b", text: "Chờ check-in" };
  if (status === "no_active_contract" && stayHistoryLen > 0) {
    return { bg: "#f3f4f6", border: "#9ca3af", text: "Đã check-out / không HĐ hiện hành" };
  }
  if (status === "no_active_contract") return { bg: "#f9fafb", border: "#d1d5db", text: "Không có HĐ hiện hành" };
  if (status === "contract_no_bed") return { bg: "#eff6ff", border: "#3b82f6", text: "Đã phân phòng — chờ giường" };
  if (status === "no_bed_assigned") return { bg: "#fffbeb", border: "#f59e0b", text: "Chưa phân giường" };
  return { bg: "#f0f9ff", border: "#0ea5e9", text: status };
}

export function formatParentLine(name?: string, phone?: string): string {
  const n = String(name || "").trim();
  const p = String(phone || "").trim();
  if (!n && !p) return "—";
  if (!n) return `SĐT: ${p}`;
  if (!p) return n;
  return `${n} — SĐT: ${p}`;
}

export function formatStayHistoryDateVi(v?: string | Date | null): string {
  if (!v) return "—";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD/MM/YYYY") : "—";
}

export function inferFacultyGroupFromMajor(
  major?: string,
  majorOptions?: Array<{ name: string; faculty?: string }>,
): string {
  const m = String(major || "").trim();
  if (!m || !majorOptions?.length) return "";
  const hit = majorOptions.find((x) => String(x.faculty || "").trim() === m);
  return hit ? String(hit.name || "").trim() : "";
}

export function violationSeverityLabel(severity?: string): { color: string; text: string } {
  switch (String(severity || "").toLowerCase()) {
    case "heavy":
      return { color: "red", text: "Nặng" };
    case "medium":
      return { color: "orange", text: "Trung bình" };
    case "light":
      return { color: "default", text: "Nhẹ" };
    default:
      return { color: "default", text: severity || "—" };
  }
}
