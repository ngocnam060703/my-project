import type { StudentPriorityType } from "../types";

export const PRIORITY_OPTIONS: { label: string; value: StudentPriorityType }[] = [
  { label: "Bình thường", value: "normal" },
  { label: "Con liệt sĩ", value: "martyr_child" },
  { label: "Con thương binh", value: "invalid_child" },
  { label: "Dân tộc thiểu số", value: "minority" },
  { label: "Tàn tật", value: "disabled" },
];

export function formatPriorityType(value?: string | null): string {
  return PRIORITY_OPTIONS.find((item) => item.value === (value || "normal"))?.label || "Bình thường";
}

export function isPriorityProofRequired(priorityType?: string | null): boolean {
  return !!priorityType && priorityType !== "normal";
}
