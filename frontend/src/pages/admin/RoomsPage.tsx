import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  List,
  Checkbox,
  Descriptions,
  Spin,
  Tabs,
  Tooltip,
  Dropdown,
  Progress,
} from "antd";
import type { MenuProps } from "antd";
import {
  PlusOutlined,
  ApartmentOutlined,
  EditOutlined,
  DeleteOutlined,
  FilterOutlined,
  EyeOutlined,
  DownloadOutlined,
  SwapOutlined,
  LoginOutlined,
  LogoutOutlined,
  DollarOutlined,
  IdcardOutlined,
  MoreOutlined,
  ReloadOutlined,
  HomeOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { roomsApi, areasApi, facilitiesApi, bedsApi } from "../../api";
import type { Bed, Room, RoomSlotStats } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  available: { color: "green", text: "Còn trống" },
  full: { color: "red", text: "Đã đầy" },
  maintenance: { color: "orange", text: "Bảo trì" },
};

const formatPrice = (v: number) => (v ?? 0).toLocaleString("vi-VN") + "đ";
const removeWifiFromAmenities = (arr: string[] = []) =>
  arr.map((s) => String(s || "").trim()).filter(Boolean).filter((s) => !/^wi-?fi$/i.test(s));

/** CSVC hiển thị: phân bổ từ kho (FacilityLocation) + tiện ích lưu trên Room.amenities */
function buildRoomCsvcDisplayList(
  room: Room,
  fromInventory: Array<{ name: string; quantity: number }> | undefined
): Array<{ name: string; quantity: number }> {
  const inv = fromInventory?.length ? [...fromInventory] : [];
  const seen = new Set(inv.map((x) => String(x.name || "").trim().toLowerCase()).filter(Boolean));
  for (const raw of room.amenities || []) {
    const n = String(raw || "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    inv.push({ name: n, quantity: 0 });
  }
  return inv;
}
type FacilityLocation = {
  room?: string | { _id?: string };
  facility?: { _id?: string; name?: string };
  quantity?: number;
};
type ResidentRow = {
  contractId: string;
  status: string;
  contractNumber?: string;
  startDate?: string;
  endDate?: string;
  isRoomLeader?: boolean;
  user?: { _id?: string; fullName?: string; studentId?: string; email?: string; phone?: string; gender?: string };
  bed?: Bed | null;
  bedCode?: string;
  assignedAt?: string;
  checkInAt?: string;
  debtTotal?: number;
  residencyOperationalStatus?: string;
};

type ResidencyPeriodRow = {
  contractId: string;
  contractNumber?: string;
  user?: { fullName?: string; studentId?: string };
  bedCode?: string;
  /** Khu / phòng — server gắn theo phòng đang xem */
  areaName?: string;
  roomNumber?: string;
  moveInAt?: string;
  moveOutAt?: string | null;
  reasonIn?: string;
  reasonOut?: string;
  ongoing?: boolean;
};

function bedSlotComposite(roomNum: string | undefined, bedCode: string | undefined): string {
  const rn = String(roomNum || "").trim();
  const bc = String(bedCode || "").trim();
  if (!bc) return "—";
  if (rn && bc.startsWith(`${rn}-`)) return bc;
  if (rn) return `${rn}-${bc}`;
  return bc;
}

function residencyHistoryRowStatusTag(
  row: ResidencyPeriodRow,
  residentMatch?: ResidentRow
): React.ReactNode {
  if (row.ongoing) {
    if (residentMatch?.residencyOperationalStatus === "assigned_pending_checkin") {
      return (
        <Tag color="gold" style={{ fontWeight: 600 }}>
          🟡 Chờ check-in
        </Tag>
      );
    }
    return (
      <Tag color="success" style={{ fontWeight: 600 }}>
        🟢 Đang ở
      </Tag>
    );
  }
  return (
    <Tag color="default" style={{ fontWeight: 600 }}>
      ⚪ Đã check-out
    </Tag>
  );
}

/** Khi API slot chưa về (lỗi từng phần) — ước lượng theo currentOccupancy trên Room */
function fallbackSlotStatsFromRoom(room: Room | null): RoomSlotStats | null {
  if (!room || typeof room.capacity !== "number") return null;
  const cap = Math.max(1, room.capacity);
  const occ = Math.min(cap, Math.max(0, Number(room.currentOccupancy ?? 0)));
  return {
    totalSlots: cap,
    occupiedSlots: occ,
    reservedSlots: 0,
    emptySlots: Math.max(0, cap - occ),
    fillRatePercent: cap ? Math.round((occ / cap) * 1000) / 10 : 0,
  };
}

const residencyOperationalLabels: Record<string, { color: string; text: string }> = {
  no_active_contract: { color: "default", text: "Không có HĐ hiện hành" },
  contract_no_bed: { color: "processing", text: "Đã phân phòng — chờ giường" },
  no_bed_assigned: { color: "warning", text: "Chưa phân giường" },
  assigned_pending_checkin: { color: "gold", text: "Đã phân giường — chờ check-in" },
  checked_in_staying: { color: "green", text: "Đang ở (đã check-in)" },
};

function bedUiMeta(b: Bed): { bg: string; border: string; icon: React.ReactNode; label: string; desc: string } {
  const phase = String(b.residencyPhase || "");
  const st = String(b.status || "");
  if (st === "maintenance" || st === "locked" || phase === "maintenance") {
    return {
      bg: "#f3f4f6",
      border: "#9ca3af",
      icon: <ToolOutlined />,
      label: "Bảo trì / khóa",
      desc: "Không phân sinh viên. Cần xử lý CSVC trước.",
    };
  }
  if (st === "reserved" || phase === "reserved_hold") {
    return {
      bg: "#fef9c3",
      border: "#eab308",
      icon: <ClockCircleOutlined />,
      label: "Đã giữ chỗ",
      desc: "Slot đang được giữ — hoàn tất thanh toán / xác nhận để vào ở.",
    };
  }
  if (st === "occupied") {
    if (phase === "assigned_pending_checkin") {
      return {
        bg: "#dbeafe",
        border: "#2563eb",
        icon: <LoginOutlined />,
        label: "Đã phân giường",
        desc: "Đã gắn HĐ nhưng chờ check-in thực tế.",
      };
    }
    return {
      bg: "#dcfce7",
      border: "#16a34a",
      icon: <HomeOutlined />,
      label: "Đang ở",
      desc: "Đã check-in — đang chiếm slot cư trú.",
    };
  }
  return {
    bg: "#f9fafb",
    border: "#e5e7eb",
    icon: <HomeOutlined />,
    label: "Trống",
    desc: "Slot trống — có thể phân giường.",
  };
}

const RoomsPage: React.FC = () => {
  const [data, setData] = useState<Room[]>([]);
  const [total, setTotal] = useState(0);
  const [areas, setAreas] = useState<{ _id: string; name: string }[]>([]);
  const [roomFacilities, setRoomFacilities] = useState<Record<string, { name: string; quantity: number }[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Room | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailResidents, setDetailResidents] = useState<Record<string, ResidentRow[]>>({});
  const [detailResidentsLoading, setDetailResidentsLoading] = useState<Record<string, boolean>>({});
  const [bedsByRoom, setBedsByRoom] = useState<Record<string, Bed[]>>({});
  const [bedsLoadingByRoom, setBedsLoadingByRoom] = useState<Record<string, boolean>>({});
  const [assigningBedId, setAssigningBedId] = useState<string | null>(null);
  const [residentModal, setResidentModal] = useState<{
    open: boolean;
    roomId?: string;
    room?: { roomNumber?: string; area?: { name?: string }; capacity?: number; currentOccupancy?: number };
    residents: ResidentRow[];
    loading: boolean;
    settingLeaderUserId?: string;
  }>({ open: false, residents: [], loading: false });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openRoomQ = searchParams.get("openRoom")?.trim() || "";
  const openTransferQ = searchParams.get("openTransfer")?.trim() || "";
  const [detailSlotStats, setDetailSlotStats] = useState<Record<string, RoomSlotStats>>({});
  const [residencyHistoryByRoom, setResidencyHistoryByRoom] = useState<Record<string, ResidencyPeriodRow[]>>({});
  const [historyLoadingByRoom, setHistoryLoadingByRoom] = useState<Record<string, boolean>>({});
  const [transferModal, setTransferModal] = useState<{
    open: boolean;
    roomId?: string;
    contractId?: string;
    fromBedId?: string;
    targetBedId?: string;
    reason?: string;
  }>({ open: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [query, setQuery] = useState<string>("");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<{ available: number; full: number; maintenance: number }>({ available: 0, full: 0, maintenance: 0 });
  const [filters, setFilters] = useState<{
    area?: string;
    status?: string;
    minPrice?: number;
    maxPrice?: number;
    minCapacity?: number;
    capacity?: number;
  }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.area) params.area = filters.area;
      if (filters.status) params.status = filters.status;
      if (filters.minPrice != null) params.minPrice = filters.minPrice;
      if (filters.maxPrice != null) params.maxPrice = filters.maxPrice;
      if (filters.minCapacity != null) params.minCapacity = filters.minCapacity;
      if (filters.capacity != null) params.capacity = filters.capacity;
      if (query.trim()) params.roomNumber = query.trim();
      const [roomsRes, areasRes, locationsRes] = await Promise.all([
        roomsApi.getAll(params),
        areasApi.getAll(),
        facilitiesApi.getLocations({ limit: 2000 }),
      ]);
      setData(roomsRes.data.rooms || []);
      setTotal(roomsRes.data.total || 0);
      setStats(roomsRes.data.stats || { available: 0, full: 0, maintenance: 0 });
      setAreas(areasRes.data?.areas ?? areasRes.data ?? []);
      const grouped: Record<string, { name: string; quantity: number }[]> = {};
      const locations = (locationsRes.data?.items || []) as FacilityLocation[];
      locations.forEach((loc) => {
        const roomRef: unknown =
          (loc as unknown as { room?: unknown }).room ??
          (loc as unknown as { roomId?: unknown }).roomId ??
          (loc as unknown as { room_id?: unknown }).room_id;
        const rid =
          typeof roomRef === "string"
            ? roomRef
            : String(
                (roomRef as { _id?: unknown; id?: unknown } | null | undefined)?._id ??
                  (roomRef as { id?: unknown } | null | undefined)?.id ??
                  ""
              );

        const facilityRef: unknown =
          (loc as unknown as { facility?: unknown }).facility ??
          (loc as unknown as { facilityId?: unknown }).facilityId;
        const name =
          typeof facilityRef === "string"
            ? String((loc as unknown as { facilityName?: unknown }).facilityName || "").trim()
            : String((facilityRef as { name?: unknown } | null | undefined)?.name || "").trim();
        if (!rid || !name) return;
        if (!grouped[rid]) grouped[rid] = [];
        grouped[rid].push({ name, quantity: Number(loc.quantity || 0) });
      });
      setRoomFacilities(grouped);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { load(); }, [page, filters.area, filters.status, filters.minPrice, filters.maxPrice, filters.minCapacity, filters.capacity, query]);

  const visibleRooms = data;

  const defaultRoomKit = (labels: string[]) => {
    const arr = labels.map((s) => s.toLowerCase());
    const kit: string[] = [];
    if (arr.some((x) => x.includes("giường") || x.includes("giuong"))) kit.push("bed");
    if (arr.some((x) => x.includes("tủ") || x.includes("tu"))) kit.push("cabinet");
    if (arr.some((x) => x.includes("quạt") || x.includes("quat"))) kit.push("fan");
    if (arr.some((x) => x.includes("điều hòa") || x.includes("dieu hoa") || x.includes("lạnh"))) kit.push("ac");
    return kit;
  };

  const kitToAmenities = (kit: string[]) => {
    const out: string[] = [];
    if (kit.includes("bed")) out.push("Giường");
    if (kit.includes("cabinet")) out.push("Tủ");
    if (kit.includes("fan")) out.push("Quạt");
    if (kit.includes("ac")) out.push("Điều hòa");
    return out;
  };

  const amenitiesExtras = (kit: string[], all: string[]) => {
    const kitAmenities = kitToAmenities(kit);
    const kitLowerList = kitAmenities.map((x) => x.toLowerCase());
    return all.filter((a) => {
      const t = String(a).trim().toLowerCase();
      if (!t) return false;
      return !kitLowerList.some((k) => t.includes(k) || (t.length > 2 && k.includes(t)));
    });
  };

  const handleSubmit = async (v: Record<string, unknown>) => {
    try {
      const kit = (v.roomKit as string[]) || [];
      const fromKit = kitToAmenities(kit);
      const amenitiesInput = (v.amenities as string | undefined) || "";
      const fromText = removeWifiFromAmenities(amenitiesInput.split(",").map((s) => s.trim()).filter(Boolean));
      const merged = removeWifiFromAmenities([...fromKit, ...fromText]);
      const amenities = Array.from(new Set(merged.map((x) => String(x).trim()).filter(Boolean)));
      const { roomKit: _rk, ...rest } = v;
      const payload = { ...rest, amenities };
      if (editingId) {
        await roomsApi.update(editingId, payload);
        message.success("Cập nhật thành công");
      } else {
        await roomsApi.create(payload);
        message.success("Thêm phòng thành công");
      }
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleEdit = (r: Room) => {
    setEditingId(r._id);
    const am = (r.amenities || []).map(String);
    const rk = defaultRoomKit(am);
    form.setFieldsValue({
      roomNumber: r.roomNumber,
      area: typeof r.area === "object" ? r.area?._id : r.area,
      roomKit: rk,
      amenities: amenitiesExtras(rk, am).join(", "),
      capacity: r.capacity,
      price: r.price,
      floor: r.floor ?? 1,
      status: r.status,
      currentOccupancy: r.currentOccupancy,
      description: r.description,
    });
    setModalOpen(true);
  };

  const handleDelete = (r: Room) => {
    Modal.confirm({
      title: "Xác nhận xóa phòng",
      content: `Xóa phòng ${r.roomNumber}? Không thể xóa phòng đang có người ở.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await roomsApi.delete(r._id);
          message.success("Đã xóa");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const setRoomLeader = async (resident: ResidentRow) => {
    if (!residentModal.roomId || !resident.user?._id) return;
    try {
      setResidentModal((prev) => ({ ...prev, settingLeaderUserId: resident.user?._id }));
      await roomsApi.setRoomLeader(residentModal.roomId, resident.user._id);
      setResidentModal((prev) => ({
        ...prev,
        residents: prev.residents.map((r) => ({ ...r, isRoomLeader: r.user?._id === resident.user?._id })),
        settingLeaderUserId: undefined,
      }));
      message.success("Đã cập nhật trưởng phòng");
      load();
    } catch (err: unknown) {
      setResidentModal((prev) => ({ ...prev, settingLeaderUserId: undefined }));
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được trưởng phòng");
    }
  };

  const openRoomDetail = async (r: Room) => {
    setDetailModal(r);
    setDetailLoading(true);
    let roomForFallback: Room = r;
    try {
      const [roomRes, facRes] = await Promise.all([
        roomsApi.getById(r._id).catch(() => ({ data: r } as { data: Room })),
        facilitiesApi.getLocations({ roomId: r._id, limit: 500 }).catch(() => ({ data: { items: [] } })),
      ]);
      roomForFallback = roomRes.data as Room;
      setDetailModal(roomForFallback);

      const grouped = { ...(roomFacilities || {}) } as Record<string, { name: string; quantity: number }[]>;
      const items = ((facRes as unknown as { data?: { items?: unknown[] } }).data?.items || []) as unknown[];
      const list: { name: string; quantity: number }[] = [];
      for (const raw of items) {
        const loc = raw as { facility?: { name?: string } | string; quantity?: number };
        const name = typeof loc.facility === "string" ? "" : String(loc.facility?.name || "").trim();
        if (!name) continue;
        list.push({ name, quantity: Number(loc.quantity || 0) });
      }
      grouped[r._id] = list;
      setRoomFacilities(grouped);
    } finally {
      setDetailLoading(false);
    }

    setDetailResidentsLoading((m) => ({ ...m, [r._id]: true }));
    setHistoryLoadingByRoom((m) => ({ ...m, [r._id]: true }));
    const rid = r._id;
    const fb = fallbackSlotStatsFromRoom(roomForFallback);
    if (fb) setDetailSlotStats((m) => ({ ...m, [rid]: fb }));

    try {
      const residentsRes = await roomsApi.getResidents(rid);
      setDetailResidents((m) => ({ ...m, [rid]: residentsRes.data?.residents || [] }));
      const ss = residentsRes.data?.slotStats as RoomSlotStats | undefined;
      if (ss) setDetailSlotStats((m) => ({ ...m, [rid]: ss }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || "Không tải được danh sách sinh viên trong phòng");
      setDetailResidents((m) => ({ ...m, [rid]: [] }));
    } finally {
      setDetailResidentsLoading((m) => ({ ...m, [rid]: false }));
    }

    try {
      const histRes = await roomsApi.getResidencyHistory(rid);
      setResidencyHistoryByRoom((m) => ({ ...m, [rid]: (histRes.data?.periods || []) as ResidencyPeriodRow[] }));
    } catch {
      setResidencyHistoryByRoom((m) => ({ ...m, [rid]: [] }));
      message.warning("Không tải được lịch sử cư trú (tab Lịch sử có thể trống). Hãy khởi động lại backend nếu vừa cập nhật code.");
    } finally {
      setHistoryLoadingByRoom((m) => ({ ...m, [rid]: false }));
    }
  };

  useEffect(() => {
    if (!openRoomQ) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await roomsApi.getById(openRoomQ);
        if (cancelled || !res.data) return;
        await openRoomDetail(res.data as Room);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("openRoom");
            return next;
          },
          { replace: true }
        );
      } catch {
        message.error("Không mở được chi tiết phòng từ liên kết");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("openRoom");
            next.delete("openTransfer");
            return next;
          },
          { replace: true }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // openRoomDetail intentionally omitted — stable enough for query deeplink
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deeplink: chỉ theo openRoomQ
  }, [openRoomQ, setSearchParams]);

  useEffect(() => {
    if (!openTransferQ || !detailModal?._id) return;
    const roomId = detailModal._id;
    if (detailResidentsLoading[roomId]) return;
    const residents = detailResidents[roomId];
    if (!residents?.length) return;

    const row = residents.find((r) => String(r.contractId) === openTransferQ);
    const bedObj = row?.bed && typeof row.bed === "object" ? (row.bed as Bed) : null;
    const fromBedId = bedObj?._id ? String(bedObj._id) : "";

    if (!fromBedId) {
      message.warning("Chưa có giường occupied cho HĐ này — không mở được form chuyển giường.");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("openTransfer");
          return next;
        },
        { replace: true }
      );
      return;
    }

    void loadBedsForRoom(roomId, true);
    setTransferModal({
      open: true,
      roomId,
      contractId: openTransferQ,
      fromBedId,
      targetBedId: undefined,
      reason: "",
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("openTransfer");
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chờ residents sau openRoomDetail
  }, [openTransferQ, detailModal?._id, detailResidents, detailResidentsLoading, setSearchParams]);

  const refreshRoomSnapshot = async (roomId: string) => {
    const settled = await Promise.allSettled([
      roomsApi.getBeds(roomId),
      roomsApi.getResidents(roomId),
      roomsApi.getResidencyHistory(roomId),
    ]);
    const [bedsRes, residentsRes, histRes] = settled;

    if (bedsRes.status === "fulfilled") {
      setBedsByRoom((m) => ({ ...m, [roomId]: (bedsRes.value.data?.beds || []) as Bed[] }));
      const bss = bedsRes.value.data?.slotStats as RoomSlotStats | undefined;
      if (bss) setDetailSlotStats((m) => ({ ...m, [roomId]: bss }));
    }

    if (residentsRes.status === "fulfilled") {
      setDetailResidents((m) => ({ ...m, [roomId]: residentsRes.value.data?.residents || [] }));
      const rss = residentsRes.value.data?.slotStats as RoomSlotStats | undefined;
      if (rss) setDetailSlotStats((m) => ({ ...m, [roomId]: rss }));
    } else {
      message.warning("Không làm mới được danh sách sinh viên");
    }

    if (histRes.status === "fulfilled") {
      setResidencyHistoryByRoom((m) => ({ ...m, [roomId]: (histRes.value.data?.periods || []) as ResidencyPeriodRow[] }));
    }
  };

  const loadBedsForRoom = async (roomId: string, force = false) => {
    if (!force && bedsByRoom[roomId]?.length) return;
    setBedsLoadingByRoom((m) => ({ ...m, [roomId]: true }));
    try {
      const res = await roomsApi.getBeds(roomId);
      setBedsByRoom((m) => ({ ...m, [roomId]: (res.data?.beds || []) as Bed[] }));
      const bss = res.data?.slotStats as RoomSlotStats | undefined;
      if (bss) setDetailSlotStats((m) => ({ ...m, [roomId]: bss }));
    } catch {
      message.error("Không tải được danh sách giường");
      setBedsByRoom((m) => ({ ...m, [roomId]: [] }));
    } finally {
      setBedsLoadingByRoom((m) => ({ ...m, [roomId]: false }));
    }
  };

  const assignResidentToBed = async (roomId: string, bedId: string, contractId: string) => {
    setAssigningBedId(bedId);
    try {
      await roomsApi.assignBed(roomId, { bedId, contractId });
      message.success("Đã phân giường — chờ sinh viên check-in");
      await refreshRoomSnapshot(roomId);
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không phân giường được");
    } finally {
      setAssigningBedId(null);
    }
  };

  const handleBedCheckIn = async (roomId: string, bedId: string) => {
    try {
      await roomsApi.checkInBed(roomId, bedId);
      message.success("Đã check-in");
      await refreshRoomSnapshot(roomId);
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không check-in được");
    }
  };

  const handleBedCheckout = (roomId: string, bedId: string) => {
    Modal.confirm({
      title: "Check-out & giải phóng giường?",
      content: "Giường trở về trống; liên kết giường trên HĐ được gỡ.",
      okText: "Check-out",
      cancelText: "Hủy",
      onOk: async () => {
        await bedsApi.checkout(bedId);
        message.success("Đã check-out & giải phóng giường");
        await refreshRoomSnapshot(roomId);
      },
    });
  };

  const submitTransferBed = async () => {
    const { roomId, contractId, targetBedId, reason } = transferModal;
    if (!roomId || !contractId || !transferModal.fromBedId || !targetBedId) {
      message.error("Chọn đủ giường đích");
      return;
    }
    try {
      await roomsApi.transferBed(roomId, {
        contractId,
        targetBedId,
        reason: reason?.trim() || undefined,
      });
      message.success("Đã chuyển giường");
      setTransferModal({ open: false });
      await refreshRoomSnapshot(roomId);
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Chuyển giường thất bại");
    }
  };

  const formatDateVi = (v?: string | null) => {
    if (!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("vi-VN");
  };

  const columns = [
    { title: "Số phòng", dataIndex: "roomNumber", key: "roomNumber", width: 100, render: (v: string) => <strong>{v || "-"}</strong> },
    { title: "Khu", dataIndex: ["area", "name"], key: "area", width: 100, render: (v: string, r: Room) => (typeof r.area === "object" ? r.area?.name : v) || "-" },
    { title: "Tầng", dataIndex: "floor", key: "floor", width: 70 },
    {
      title: "Sức chứa",
      key: "capacity",
      width: 100,
      render: (_: unknown, r: Room) => `${r.currentOccupancy ?? 0}/${r.capacity}`,
    },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (v: number) => <span style={{ color: "#0d9488" }}>{formatPrice(v)}/tháng</span>,
    },
    {
      title: "Giá/đầu người",
      key: "pricePerPerson",
      width: 120,
      render: (_: unknown, r: Room) => {
        const p = r.pricePerPerson ?? (r.capacity > 0 ? Math.round(r.price / r.capacity) : 0);
        return <span style={{ color: "#0369a1" }}>{formatPrice(p)}/người</span>;
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "CSVC phòng",
      key: "facilities",
      render: (_: unknown, r: Room) => {
        const items = buildRoomCsvcDisplayList(r, roomFacilities[r._id]);
        return items.length ? (
          <Space wrap size="small">
            {items.slice(0, 6).map((x) => (
              <Tag key={`${r._id}-${x.name}`} color="cyan">
                {x.name}
                {x.quantity > 0 ? ` (${x.quantity})` : ""}
              </Tag>
            ))}
            {items.length > 6 ? <Tag>+{items.length - 6}</Tag> : null}
          </Space>
        ) : (
          <span style={{ color: "#999" }}>-</span>
        );
      },
    },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      fixed: "right" as const,
      render: (_: unknown, r: Room) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openRoomDetail(r)}>Chi tiết</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>Sửa</Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(r)} disabled={(r.currentOccupancy ?? 0) > 0}>Xóa</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><ApartmentOutlined /> Quản lý phòng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Thêm, sửa phòng và xem thống kê theo khu, tầng</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Phòng còn trống</span>} value={stats.available} suffix="phòng" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Phòng đã đầy" value={stats.full} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Tổng phòng" value={total} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Bảo trì" value={stats.maintenance} suffix="phòng" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Select placeholder="Lọc khu" allowClear style={{ width: 160 }} value={filters.area} onChange={(v) => { setFilters((f) => ({ ...f, area: v })); setPage(1); }}>
            {areas.map((a) => <Select.Option key={a._id} value={a._id}>{a.name}</Select.Option>)}
          </Select>
          <Select placeholder="Trạng thái" allowClear style={{ width: 140 }} value={filters.status} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}>
            <Select.Option value="available">Còn trống</Select.Option>
            <Select.Option value="full">Đã đầy</Select.Option>
            <Select.Option value="maintenance">Bảo trì</Select.Option>
          </Select>
          <InputNumber placeholder="Giá từ" min={0} style={{ width: 100 }} value={filters.minPrice} onChange={(v) => { setFilters((f) => ({ ...f, minPrice: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Giá đến" min={0} style={{ width: 100 }} value={filters.maxPrice} onChange={(v) => { setFilters((f) => ({ ...f, maxPrice: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Sức chứa từ" min={1} style={{ width: 110 }} value={filters.minCapacity} onChange={(v) => { setFilters((f) => ({ ...f, minCapacity: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Sức chứa đến" min={1} style={{ width: 110 }} value={filters.capacity} onChange={(v) => { setFilters((f) => ({ ...f, capacity: v ?? undefined })); setPage(1); }} />
          <Input placeholder="Tìm số phòng" style={{ width: 130 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={() => { setFilters({}); setQuery(""); setPage(1); }}>Xóa lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(visibleRooms.map((r) => ({
              "Số phòng": r.roomNumber,
              "Khu": typeof r.area === "object" ? r.area?.name : "-",
              "Tầng": r.floor,
              "Sức chứa": `${r.currentOccupancy}/${r.capacity}`,
              "Giá": r.price,
              "Trạng thái": statusMap[r.status]?.text || r.status,
              "CSVC phòng": buildRoomCsvcDisplayList(r, roomFacilities[r._id])
                .map((x) => `${x.name}${x.quantity > 0 ? ` (${x.quantity})` : ""}`)
                .join(", "),
            })), "danh-sach-phong", "Phòng")}>Xuất Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); form.setFieldsValue({ capacity: 4, floor: 1, status: "available", currentOccupancy: 0, roomKit: ["bed", "cabinet", "fan"] }); setModalOpen(true); }}>Thêm phòng</Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={visibleRooms}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} phòng` }}
          scroll={{ x: 900 }}
          size="middle"
        />
      </Card>

      <Modal title={editingId ? "Sửa phòng" : "Thêm phòng"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingId(null); }} footer={null} width={520}>
        <Form form={form} onFinish={handleSubmit} layout="vertical" initialValues={{ capacity: 4, floor: 1, status: "available", currentOccupancy: 0, roomKit: ["bed", "cabinet", "fan"] }}>
          <Form.Item name="roomNumber" label="Số phòng" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="area" label="Khu" rules={[{ required: true }]}>
            <Select>{areas.map((a) => <Select.Option key={a._id} value={a._id}>{a.name}</Select.Option>)}</Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="capacity" label="Sức chứa" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="floor" label="Tầng" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Form.Item name="price" label="Giá (đ/tháng)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="status" label="Trạng thái"><Select><Select.Option value="available">Còn trống</Select.Option><Select.Option value="full">Đã đầy</Select.Option><Select.Option value="maintenance">Bảo trì</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="currentOccupancy" label="Đã ở"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="roomKit" label="CSVC khi tạo phòng">
            <Checkbox.Group
              options={[
                { label: "Giường", value: "bed" },
                { label: "Tủ", value: "cabinet" },
                { label: "Quạt", value: "fan" },
                { label: "Điều hòa", value: "ac" },
              ]}
            />
          </Form.Item>
          <Form.Item name="amenities" label="Tiện ích thêm (ngăn cách bằng dấu phẩy)"><Input placeholder="VD: Bàn học, Wi-Fi" /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>{editingId ? "Cập nhật" : "Thêm phòng"}</Button></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Chi tiết phòng ${detailModal?.roomNumber || ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>,
          detailModal && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailModal(null); handleEdit(detailModal); setModalOpen(true); }}>Sửa</Button>,
        ]}
        width={860}
      >
        {detailLoading && !detailModal ? (
          <div style={{ padding: 16, textAlign: "center" }}>
            <Spin />
          </div>
        ) : null}
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={16}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Số phòng">{detailModal.roomNumber}</Descriptions.Item>
                  <Descriptions.Item label="Khu">{typeof detailModal.area === "object" ? detailModal.area?.name : "-"}</Descriptions.Item>
                  <Descriptions.Item label="Tầng">{detailModal.floor ?? "-"}</Descriptions.Item>
                  <Descriptions.Item label="Sức chứa (HĐ / CRM)">{detailModal.currentOccupancy ?? 0}/{detailModal.capacity}</Descriptions.Item>
                  <Descriptions.Item label="Giá">
                    <span style={{ color: "#0d9488" }}>{formatPrice(detailModal.price)}/tháng</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Giá/đầu người">
                    <span style={{ color: "#0369a1" }}>
                      {formatPrice(detailModal.pricePerPerson ?? (detailModal.capacity > 0 ? Math.round(detailModal.price / detailModal.capacity) : 0))}/người
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Trạng thái phòng" span={2}>
                    <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag>
                  </Descriptions.Item>
                  {detailModal.description ? (
                    <Descriptions.Item label="Mô tả" span={2}>{detailModal.description}</Descriptions.Item>
                  ) : null}
                </Descriptions>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="Occupancy theo slot giường" bordered={false} style={{ background: "#f8fafc", height: "100%" }}>
                  {(() => {
                    const rid = detailModal._id;
                    const loading = !!detailResidentsLoading[rid];
                    const ss = detailSlotStats[rid] ?? fallbackSlotStatsFromRoom(detailModal);
                    if (loading && !detailSlotStats[rid]) {
                      return <Spin size="small" />;
                    }
                    if (!ss) return <span style={{ color: "#64748b" }}>—</span>;
                    const isApprox = !detailSlotStats[rid];
                    return (
                      <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        {isApprox ? (
                          <div style={{ fontSize: 11, color: "#b45309" }}>Ước lượng theo số chỗ trên phòng — mở Bed Layout để xem slot giường chính xác.</div>
                        ) : null}
                        <div>
                          <strong>{ss.occupiedSlots}</strong> đang dùng / <strong>{ss.totalSlots}</strong> slot — còn{" "}
                          <strong style={{ color: "#059669" }}>{ss.emptySlots}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          Giữ chỗ: <strong>{ss.reservedSlots}</strong>
                        </div>
                        <Progress percent={ss.fillRatePercent} size="small" strokeColor="#0d9488" />
                        <div style={{ fontSize: 12, color: "#64748b" }}>Tỷ lệ lấp đầy theo slot giường</div>
                      </Space>
                    );
                  })()}
                </Card>
              </Col>
            </Row>
            {(() => {
              const items = roomFacilities[detailModal._id] || [];
              const amen = Array.isArray(detailModal.amenities) ? detailModal.amenities.map((s) => String(s).trim()).filter(Boolean) : [];
              return (
                <p>
                  <strong>CSVC phòng:</strong>{" "}
                  {items.length === 0 && amen.length === 0 ? (
                    <span style={{ color: "#999" }}>-</span>
                  ) : (
                    <Space wrap>
                      {items.map((x) => (
                        <Tag key={`${detailModal._id}-${x.name}`} color="cyan">
                          {x.name}{x.quantity > 0 ? ` (${x.quantity})` : ""}
                        </Tag>
                      ))}
                      {items.length === 0 && amen.map((a) => (
                        <Tag key={`${detailModal._id}-amen-${a}`} color="cyan">
                          {a}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </p>
              );
            })()}

            <div style={{ marginTop: 12 }}>
              <Tabs
                defaultActiveKey="residents"
                items={[
                  {
                    key: "residents",
                    label: "Sinh viên đang ở",
                    children: (
                      <div style={{ marginTop: 8 }}>
                        {detailResidentsLoading[detailModal._id] ? (
                          <div style={{ padding: 16, textAlign: "center" }}>
                            <Spin />
                          </div>
                        ) : (
                          <Table
                            size="small"
                            pagination={false}
                            scroll={{ x: 1100 }}
                            rowKey={(it: ResidentRow) => it.contractId || it.user?._id || Math.random().toString(16)}
                            dataSource={detailResidents[detailModal._id] || []}
                            columns={[
                              { title: "STT", key: "stt", width: 52, render: (_: unknown, __: ResidentRow, idx: number) => idx + 1 },
                              { title: "Tên", key: "name", width: 140, ellipsis: true, render: (_: unknown, it: ResidentRow) => it.user?.fullName || "-" },
                              { title: "MSSV", key: "studentId", width: 100, render: (_: unknown, it: ResidentRow) => it.user?.studentId || "-" },
                              {
                                title: "Mã giường",
                                key: "bedCode",
                                width: 88,
                                render: (_: unknown, it: ResidentRow) => it.bedCode || "—",
                              },
                              {
                                title: "Trạng thái cư trú",
                                key: "ros",
                                width: 160,
                                render: (_: unknown, it: ResidentRow) => {
                                  const meta = residencyOperationalLabels[it.residencyOperationalStatus || ""] || {
                                    color: "blue",
                                    text: it.residencyOperationalStatus || "—",
                                  };
                                  return <Tag color={meta.color}>{meta.text}</Tag>;
                                },
                              },
                              {
                                title: "Hợp đồng",
                                key: "cn",
                                width: 120,
                                ellipsis: true,
                                render: (_: unknown, it: ResidentRow) => it.contractNumber || String(it.contractId).slice(-8),
                              },
                              {
                                title: "Hết HĐ",
                                key: "endDate",
                                width: 100,
                                render: (_: unknown, it: ResidentRow) => (it.endDate ? new Date(it.endDate).toLocaleDateString("vi-VN") : "-"),
                              },
                              {
                                title: "Phân giường / Check-in",
                                key: "dates",
                                width: 140,
                                render: (_: unknown, it: ResidentRow) => (
                                  <span style={{ fontSize: 12 }}>
                                    PG: {it.assignedAt ? formatDateVi(it.assignedAt) : "-"}
                                    <br />
                                    CI: {it.checkInAt ? formatDateVi(it.checkInAt) : "—"}
                                  </span>
                                ),
                              },
                              {
                                title: "Công nợ",
                                key: "debt",
                                width: 100,
                                align: "right" as const,
                                render: (_: unknown, it: ResidentRow) =>
                                  `${(it.debtTotal ?? 0).toLocaleString("vi-VN")}đ`,
                              },
                              {
                                title: "",
                                key: "prof",
                                width: 120,
                                fixed: "right" as const,
                                render: (_: unknown, it: ResidentRow) =>
                                  it.user?._id ? (
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={<UserOutlined />}
                                      onClick={() => navigate(`/admin/users?openUser=${encodeURIComponent(it.user!._id!)}`)}
                                    >
                                      Hồ sơ
                                    </Button>
                                  ) : null,
                              },
                            ]}
                            locale={{ emptyText: "Phòng chưa có sinh viên ở" }}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "history",
                    label: "Lịch sử cư trú",
                    children: (
                      <div style={{ marginTop: 8 }}>
                        {historyLoadingByRoom[detailModal._id] ? (
                          <div style={{ padding: 16, textAlign: "center" }}>
                            <Spin />
                          </div>
                        ) : (
                          <Table
                            size="small"
                            pagination={false}
                            scroll={{ x: 1320 }}
                            rowKey={(row, index) => `${row.contractId}-${row.moveInAt}-${index ?? 0}`}
                            dataSource={residencyHistoryByRoom[detailModal._id] || []}
                            columns={[
                              {
                                title: "Sinh viên",
                                key: "u",
                                width: 150,
                                ellipsis: true,
                                fixed: "left",
                                render: (_: unknown, row: ResidencyPeriodRow) => row.user?.fullName || "—",
                              },
                              {
                                title: "MSSV",
                                key: "sid",
                                width: 100,
                                ellipsis: true,
                                render: (_: unknown, row: ResidencyPeriodRow) => row.user?.studentId || "—",
                              },
                              {
                                title: "Khu",
                                key: "zone",
                                width: 130,
                                ellipsis: true,
                                render: (_: unknown, row: ResidencyPeriodRow) =>
                                  row.areaName ||
                                  (typeof detailModal.area === "object" ? detailModal.area?.name : "") ||
                                  "—",
                              },
                              {
                                title: "Phòng",
                                key: "room",
                                width: 88,
                                render: (_: unknown, row: ResidencyPeriodRow) =>
                                  row.roomNumber || detailModal.roomNumber || "—",
                              },
                              {
                                title: "Giường / Slot",
                                key: "slot",
                                width: 118,
                                ellipsis: true,
                                render: (_: unknown, row: ResidencyPeriodRow) =>
                                  bedSlotComposite(row.roomNumber || detailModal.roomNumber, row.bedCode),
                              },
                              {
                                title: "Ngày check-in",
                                key: "in",
                                width: 118,
                                render: (_: unknown, row: ResidencyPeriodRow) => formatDateVi(row.moveInAt),
                              },
                              {
                                title: "Ngày check-out",
                                key: "out",
                                width: 118,
                                render: (_: unknown, row: ResidencyPeriodRow) =>
                                  row.moveOutAt ? formatDateVi(row.moveOutAt) : "—",
                              },
                              {
                                title: "Trạng thái cư trú",
                                key: "stay",
                                width: 150,
                                render: (_: unknown, row: ResidencyPeriodRow) => {
                                  const residents = detailResidents[detailModal._id] || [];
                                  const match = residents.find(
                                    (r) => String(r.contractId) === String(row.contractId)
                                  );
                                  return residencyHistoryRowStatusTag(row, match);
                                },
                              },
                              {
                                title: "Hợp đồng",
                                key: "cn",
                                width: 140,
                                ellipsis: true,
                                render: (_: unknown, row: ResidencyPeriodRow) => row.contractNumber || "—",
                              },
                              {
                                title: "Ghi chú",
                                key: "why",
                                ellipsis: true,
                                render: (_: unknown, row: ResidencyPeriodRow) =>
                                  [row.reasonOut, row.reasonIn].filter(Boolean).join(" · ") || "—",
                              },
                            ]}
                            locale={{ emptyText: "Chưa có lịch sử giường trong phòng" }}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "beds",
                    label: "Bed Layout",
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Space style={{ marginBottom: 12 }} wrap>
                          <Button size="small" icon={<ReloadOutlined />} type="primary" ghost onClick={() => void loadBedsForRoom(detailModal._id, true)}>
                            Làm mới sơ đồ giường
                          </Button>
                          <Button size="small" onClick={() => void loadBedsForRoom(detailModal._id, false)}>
                            Tải giường (nếu chưa có)
                          </Button>
                        </Space>

                        {bedsLoadingByRoom[detailModal._id] ? (
                          <div style={{ padding: 16, textAlign: "center" }}>
                            <Spin />
                          </div>
                        ) : null}

                        {bedsByRoom[detailModal._id]?.length ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                            {(bedsByRoom[detailModal._id] || []).map((b) => {
                              const meta = bedUiMeta(b);
                              const st = String(b.status || "");
                              const occupant = b.currentUser && typeof b.currentUser === "object" ? b.currentUser : null;
                              const residents = detailResidents[detailModal._id] || [];
                              const needsBed = residents.filter((r) => !r.bedCode);
                              const canAssign = st === "available" && needsBed.length > 0;
                              const uid =
                                occupant && "_id" in occupant && occupant._id ? String(occupant._id) : "";
                              const ccRaw = b.currentContract;
                              const contractIdStr =
                                ccRaw && typeof ccRaw === "object" && "_id" in ccRaw
                                  ? String((ccRaw as { _id: string })._id)
                                  : ccRaw
                                    ? String(ccRaw)
                                    : "";

                              const menuItems: MenuProps["items"] = [];
                              if (st === "occupied" && b.residencyPhase === "assigned_pending_checkin") {
                                menuItems.push({
                                  key: "in",
                                  icon: <LoginOutlined />,
                                  label: "Check-in",
                                  onClick: () => void handleBedCheckIn(detailModal._id, b._id),
                                });
                              }
                              if (st === "occupied" && contractIdStr) {
                                menuItems.push({
                                  key: "mv",
                                  icon: <SwapOutlined />,
                                  label: "Chuyển giường",
                                  onClick: () => {
                                    void loadBedsForRoom(detailModal._id, true);
                                    setTransferModal({
                                      open: true,
                                      roomId: detailModal._id,
                                      contractId: contractIdStr,
                                      fromBedId: b._id,
                                      targetBedId: undefined,
                                      reason: "",
                                    });
                                  },
                                });
                              }
                              if ((st === "occupied" || st === "reserved") && contractIdStr) {
                                menuItems.push({
                                  key: "co",
                                  icon: <LogoutOutlined />,
                                  label: "Check-out",
                                  onClick: () => handleBedCheckout(detailModal._id, b._id),
                                });
                              }
                              if (contractIdStr) {
                                menuItems.push({
                                  key: "ctr",
                                  icon: <IdcardOutlined />,
                                  label: "Xem hợp đồng",
                                  onClick: () =>
                                    navigate(`/admin/contracts?openContract=${encodeURIComponent(contractIdStr)}`),
                                });
                              }
                              if (uid) {
                                menuItems.push({
                                  key: "stu",
                                  icon: <UserOutlined />,
                                  label: "Hồ sơ SV",
                                  onClick: () => navigate(`/admin/users?openUser=${encodeURIComponent(uid)}`),
                                });
                              }
                              if (uid) {
                                menuItems.push({
                                  key: "bill",
                                  icon: <DollarOutlined />,
                                  label: "Tạo / xem thu phí",
                                  onClick: () => navigate(`/admin/billing`),
                                });
                              }

                              const titleTip = (
                                <div>
                                  <div style={{ fontWeight: 600 }}>
                                    {meta.icon} {meta.label}
                                  </div>
                                  <div style={{ marginTop: 6 }}>{meta.desc}</div>
                                  {occupant ? (
                                    <div style={{ marginTop: 6, fontSize: 12 }}>
                                      {occupant.fullName} — MSSV {occupant.studentId || "—"}
                                    </div>
                                  ) : null}
                                  <div style={{ marginTop: 6, fontSize: 12 }}>
                                    PG: {b.assignedAt ? formatDateVi(b.assignedAt) : "—"} | CI:{" "}
                                    {b.checkInAt ? formatDateVi(b.checkInAt) : "—"}
                                  </div>
                                </div>
                              );

                              return (
                                <Tooltip key={b._id} title={titleTip}>
                                  <div
                                    style={{
                                      border: `2px solid ${meta.border}`,
                                      borderRadius: 12,
                                      padding: 12,
                                      background: meta.bg,
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 8,
                                      minHeight: 120,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                      <div>
                                        <div style={{ fontWeight: 800, fontSize: 15 }}>{b.code}</div>
                                        <Tag style={{ marginTop: 4 }}>{meta.label}</Tag>
                                      </div>
                                      <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!menuItems.length}>
                                        <Button size="small" icon={<MoreOutlined />} />
                                      </Dropdown>
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                      {occupant ? (
                                        <>
                                          <div style={{ fontWeight: 600 }}>{occupant.fullName}</div>
                                          <div style={{ opacity: 0.85 }}>MSSV: {occupant.studentId || "—"}</div>
                                        </>
                                      ) : (
                                        <span style={{ color: "#64748b" }}>Slot trống</span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#475569" }}>
                                      Vào ở (PG): {b.assignedAt ? formatDateVi(b.assignedAt) : "—"}
                                      <br />
                                      Check-in: {b.checkInAt ? formatDateVi(b.checkInAt) : "—"}
                                    </div>
                                    <div>
                                      {canAssign ? (
                                        <Select
                                          size="small"
                                          style={{ width: "100%" }}
                                          placeholder="Phân SV (chưa có giường)"
                                          allowClear
                                          onChange={(v) => {
                                            if (v) void assignResidentToBed(detailModal._id, b._id, String(v));
                                          }}
                                          loading={assigningBedId === b._id}
                                          options={needsBed.map((r) => ({
                                            label: `${r.user?.fullName || "—"} (${r.user?.studentId || "-"})`,
                                            value: r.contractId,
                                          }))}
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                </Tooltip>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ color: "#6b7280" }}>Chưa tải giường — bấm “Tải giường” hoặc “Làm mới”.</div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="Chuyển giường (cùng phòng)"
        open={transferModal.open}
        onCancel={() => setTransferModal({ open: false })}
        onOk={() => void submitTransferBed()}
        okText="Chuyển"
        destroyOnClose
      >
        <p style={{ marginBottom: 8, color: "#64748b", fontSize: 13 }}>
          Giải phóng giường hiện tại và gán giường đích; check-in sẽ được làm lại trên giường mới.
        </p>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 600 }}>Giường đích</span>
        </div>
        <Select
          style={{ width: "100%" }}
          placeholder="Chọn giường trống"
          value={transferModal.targetBedId}
          onChange={(v) => setTransferModal((prev) => ({ ...prev, targetBedId: String(v) }))}
          options={(bedsByRoom[transferModal.roomId || ""] || [])
            .filter((x) => x.status === "available" && String(x._id) !== String(transferModal.fromBedId))
            .map((x) => ({ label: x.code, value: x._id }))}
        />
        <Input.TextArea
          style={{ marginTop: 12 }}
          rows={2}
          placeholder="Lý do / ghi chú (tuỳ chọn)"
          value={transferModal.reason}
          onChange={(e) => setTransferModal((prev) => ({ ...prev, reason: e.target.value }))}
        />
      </Modal>

      <Modal
        title={`Sinh viên phòng ${residentModal.room?.roomNumber || ""}`}
        open={residentModal.open}
        onCancel={() => setResidentModal({ open: false, residents: [], loading: false, roomId: undefined, settingLeaderUserId: undefined })}
        footer={[<Button key="close" onClick={() => setResidentModal({ open: false, residents: [], loading: false, roomId: undefined, settingLeaderUserId: undefined })}>Đóng</Button>]}
      >
        <p style={{ marginBottom: 12 }}>
          <strong>Khu:</strong> {residentModal.room?.area?.name || "-"} |{" "}
          <strong>Sức chứa:</strong> {residentModal.room?.currentOccupancy ?? 0}/{residentModal.room?.capacity ?? 0}
        </p>
        <List
          loading={residentModal.loading}
          locale={{ emptyText: "Phòng này chưa có sinh viên ở" }}
          dataSource={residentModal.residents}
          renderItem={(it) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{it.user?.fullName || "-"}</span>
                    {it.isRoomLeader ? <Tag color="gold">Trưởng phòng</Tag> : null}
                    <Tag color={it.status === "active" ? "green" : "blue"}>{it.status === "active" ? "Đang ở" : "Chờ thanh toán"}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={6}>
                    <span>
                      MSSV: {it.user?.studentId || "-"} | SĐT: {it.user?.phone || "-"} | Email: {it.user?.email || "-"}
                    </span>
                    <div>
                      <Button
                        size="small"
                        type={it.isRoomLeader ? "default" : "primary"}
                        disabled={!!it.isRoomLeader}
                        loading={residentModal.settingLeaderUserId === it.user?._id}
                        onClick={() => setRoomLeader(it)}
                      >
                        {it.isRoomLeader ? "Đang là trưởng phòng" : "Chọn làm trưởng phòng"}
                      </Button>
                    </div>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default RoomsPage;
