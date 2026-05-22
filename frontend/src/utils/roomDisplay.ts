const ROOM_STATUS_LABELS: Record<string, string> = {
  available: "Trống",
  occupied: "Đang ở",
  maintenance: "Bảo trì",
  full: "Đầy",
};

export function roomStatusLabel(status?: string | null): string {
  if (!status) return "";
  return ROOM_STATUS_LABELS[status] || status;
}

/** Nhãn phòng trong dropdown — không hiển thị khu (tránh lặp «Khu Khu …») */
export function roomSelectLabel(room: {
  roomNumber?: string;
  capacity?: number;
  currentOccupancy?: number;
  status?: string;
}): string {
  const num = room.roomNumber || "—";
  const cap = room.capacity != null ? room.capacity : "—";
  const occ = room.currentOccupancy ?? 0;
  const st = roomStatusLabel(room.status);
  return `Phòng ${num} · Sức chứa ${cap} · Đang ở ${occ}${st ? ` · ${st}` : ""}`;
}
