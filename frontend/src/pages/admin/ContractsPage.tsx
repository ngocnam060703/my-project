import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Table,
  Button,
  Modal,
  Form,
  DatePicker,
  Tag,
  message,
  Space,
  Card,
  Row,
  Col,
  Statistic,
  Select,
  Input,
  Alert,
  Switch,
} from "antd";
import {
  EyeOutlined,
  StopOutlined,
  DownloadOutlined,
  FilterOutlined,
  CalendarOutlined,
  FileDoneOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { contractsApi, client, opsContractsApi, dashboardApi, extensionPeriodsApi } from "../../api";
import { useNowMs } from "../../hooks/useNowMs";
import { areasApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import type { Area, Contract, ContractExtendRequest, Room, User } from "../../types";
import dayjs from "dayjs";

const statusMap: Record<string, { color: string; text: string }> = {
  pending_payment: { color: "gold", text: "Chờ xác nhận (chưa hiệu lực)" },
  active: { color: "green", text: "Có hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã hủy / chấm dứt" },
};

const lessorAddress = "................................................................................................";
const lessorPhone = ".............................................................................................";

/** Tháng giữa hai ngày (làm tròn xuống theo ngày trong tháng — cùng logic MyContracts). */
function monthsBetweenStartEnd(start: string | Date, end: string | Date): number {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 12;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(1, m);
}

function roomSlots(r: Room | null | undefined): number {
  const cap = Number(r?.capacity ?? 0);
  return Number.isFinite(cap) && cap >= 1 ? cap : 1;
}

/** Giá 01 slot theo bảng giá phòng (trừ khi HĐ có monthlyRent thỏa thuận). */
function studentMonthlyRentVnd(c: Contract, room: Room | null): number {
  if (c.monthlyRent != null && Number(c.monthlyRent) > 0) return Math.round(Number(c.monthlyRent));
  const full = Math.round(Number(room?.price ?? 0));
  return Math.round(full / roomSlots(room || undefined));
}

const extendStatusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chờ duyệt" },
  approved: { color: "green", text: "Đã duyệt" },
  rejected: { color: "red", text: "Từ chối" },
};

type ExtensionPeriodItem = {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  note?: string;
};

function isExtPeriodOpenNow(period: ExtensionPeriodItem | null | undefined, nowMs: number): boolean {
  if (!period?.isActive) return false;
  const now = dayjs(nowMs);
  return !now.isBefore(dayjs(period.startDate)) && !now.isAfter(dayjs(period.endDate));
}

const ContractsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openContractId = searchParams.get("openContract")?.trim() || "";
  const extendTabActive = searchParams.get("tab") === "extend";
  const { socket } = useSocket();

  const [data, setData] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [rooms, setRooms] = useState<{ _id: string; roomNumber: string; area?: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Contract | null>(null);
  const [extendModal, setExtendModal] = useState<Contract | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ status?: string; room?: string; area?: string }>({});
  const [quick, setQuick] = useState<{ hasDebt?: boolean }>({});
  const [search, setSearch] = useState("");
  const [faculty, setFaculty] = useState("");
  const [major, setMajor] = useState("");
  const [areas, setAreas] = useState<Array<Pick<Area, "_id" | "name">>>([]);
  const [extendReqs, setExtendReqs] = useState<ContractExtendRequest[]>([]);
  const [extendStatusFilter, setExtendStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [extendSearch, setExtendSearch] = useState("");
  const [extendLoading, setExtendLoading] = useState(false);
  const [rejectExt, setRejectExt] = useState<{ id: string; note: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ contract: Contract; signedPdfUrl: string } | null>(null);
  const nowMs = useNowMs(1000);
  const [extPeriods, setExtPeriods] = useState<ExtensionPeriodItem[]>([]);
  const [extPeriodsLoading, setExtPeriodsLoading] = useState(true);
  const [extPeriodsError, setExtPeriodsError] = useState<string | null>(null);
  const [contractExtensionEnabled, setContractExtensionEnabled] = useState<boolean | null>(null);
  const [contractExtensionToggling, setContractExtensionToggling] = useState(false);
  const [extTogglingId, setExtTogglingId] = useState<string | null>(null);
  const [extOpenModalOpen, setExtOpenModalOpen] = useState(false);
  const [extCreateModalOpen, setExtCreateModalOpen] = useState(false);
  const [extQuickCountdown, setExtQuickCountdown] = useState("");
  const [extOpenForm] = Form.useForm();
  const [extCreateForm] = Form.useForm();

  const [ops, setOps] = useState<{
    activeContracts: number;
    expiringSoonContracts: number;
    studentsWithDebt: number;
    pendingViolations: number;
    pendingRenewalRequests: number;
    pendingTransferRequests: number;
    occupancyRate: number;
    roomsOverCapacity: number;
    roomsMaintenance: number;
    pendingMaintenanceReports: number;
  } | null>(null);

  const loadExtensionPeriods = async () => {
    setExtPeriodsLoading(true);
    setExtPeriodsError(null);
    try {
      const res = await extensionPeriodsApi.getAll();
      setExtPeriods((res.data || []) as ExtensionPeriodItem[]);
    } catch (err: unknown) {
      const st = (err as { response?: { status?: number } })?.response?.status;
      const msg =
        st === 404
          ? "API đợt gia hạn chưa sẵn sàng — khởi động lại backend."
          : "Không tải được danh sách đợt gia hạn";
      setExtPeriodsError(msg);
      setExtPeriods([]);
    } finally {
      setExtPeriodsLoading(false);
    }
  };

  const loadContractExtensionSetting = async () => {
    try {
      const res = await dashboardApi.getContractExtensionSetting();
      const v = res.data?.enable_contract_extension;
      setContractExtensionEnabled(typeof v === "boolean" ? v : true);
    } catch {
      setContractExtensionEnabled(true);
    }
  };

  const loadExtendRequests = async () => {
    setExtendLoading(true);
    try {
      const res = await contractsApi.listExtendRequests({
        status: extendStatusFilter,
        search: extendSearch.trim() || undefined,
      });
      setExtendReqs(res.data?.items || []);
    } catch (err: unknown) {
      setExtendReqs([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) message.error("Bạn không có quyền xem yêu cầu gia hạn");
      else message.error("Không tải được danh sách yêu cầu gia hạn");
    } finally {
      setExtendLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.room) params.room = filters.room;
      if (filters.area) params.area = filters.area;
      if (quick.hasDebt) params.hasDebt = 1;
      if (search.trim()) params.search = search.trim();
      if (faculty.trim()) params.faculty = faculty.trim();
      if (major.trim()) params.major = major.trim();
      const [res, roomsRes] = await Promise.all([
        client.get("/contracts", { params }),
        client.get("/rooms"),
      ]);
      setData(res.data.contracts || []);
      setTotal(res.data.total || 0);
      setRooms(roomsRes.data.rooms || []);
      void loadExtendRequests();
    } catch (err: unknown) {
      setData([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) message.error("Bạn không có quyền truy cập");
      else message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExtensionPeriods();
    void loadContractExtensionSetting();
  }, []);

  const activeExtPeriod = extPeriods.find((p) => isExtPeriodOpenNow(p, nowMs)) || null;

  useEffect(() => {
    if (!activeExtPeriod) {
      setExtQuickCountdown("");
      return;
    }
    const tick = () => {
      const diffMs = dayjs(activeExtPeriod.endDate).diff(dayjs());
      if (diffMs <= 0) {
        setExtQuickCountdown("00:00:00");
        void loadExtensionPeriods();
        return;
      }
      const totalSeconds = Math.floor(diffMs / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const s = String(totalSeconds % 60).padStart(2, "0");
      setExtQuickCountdown(`${h}:${m}:${s}`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeExtPeriod?._id, activeExtPeriod?.endDate]);

  const handleContractExtensionToggle = async (checked: boolean) => {
    const prev = contractExtensionEnabled ?? true;
    setContractExtensionEnabled(checked);
    setContractExtensionToggling(true);
    try {
      await dashboardApi.setContractExtensionSetting({ enable_contract_extension: checked });
      message.success(checked ? "Đã bật gia hạn hợp đồng" : "Đã tắt gia hạn hợp đồng");
    } catch (err: unknown) {
      setContractExtensionEnabled(prev);
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được");
    } finally {
      setContractExtensionToggling(false);
    }
  };

  const handleToggleExtActive = async (period: ExtensionPeriodItem, checked: boolean) => {
    setExtTogglingId(period._id);
    try {
      await extensionPeriodsApi.update(period._id, { isActive: checked });
      message.success(checked ? "Đã mở đợt gia hạn" : "Đã đóng đợt gia hạn");
      await loadExtensionPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được đợt");
    } finally {
      setExtTogglingId(null);
    }
  };

  const handleExtMainToggle = async (checked: boolean) => {
    if (contractExtensionEnabled === false) {
      message.warning("Bật chức năng gia hạn toàn hệ thống trước khi mở đợt");
      return;
    }
    if (checked) {
      extOpenForm.setFieldsValue({ endDate: dayjs().add(14, "day") });
      setExtOpenModalOpen(true);
      return;
    }
    if (!activeExtPeriod) return;
    const closed = extPeriods.find((p) => p._id === activeExtPeriod._id) || activeExtPeriod;
    await handleToggleExtActive(closed, false);
  };

  const handleConfirmExtOpen = async (values: { endDate: ReturnType<typeof dayjs> }) => {
    const end = values.endDate;
    if (!end || end.isBefore(dayjs())) {
      message.error("Vui lòng chọn ngày giờ hết hạn lớn hơn hiện tại");
      return;
    }
    const now = dayjs();
    const target = activeExtPeriod || extPeriods[0] || null;
    setExtTogglingId(target?._id || "new");
    try {
      if (target) {
        await extensionPeriodsApi.update(target._id, {
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          isActive: true,
        });
      } else {
        const created = await extensionPeriodsApi.create({
          name: `Đợt gia hạn ${now.format("DD/MM/YYYY HH:mm")}`,
          startDate: now.toISOString(),
          endDate: end.toISOString(),
        });
        const newId = (created.data as ExtensionPeriodItem)?._id;
        if (newId) {
          await extensionPeriodsApi.update(newId, {
            startDate: now.toISOString(),
            endDate: end.toISOString(),
            isActive: true,
          });
        }
      }
      message.success("Đã mở đợt gia hạn — sinh viên có HĐ active có thể gia hạn (thêm 6 tháng)");
      setExtOpenModalOpen(false);
      extOpenForm.resetFields();
      await loadExtensionPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không mở được đợt");
    } finally {
      setExtTogglingId(null);
    }
  };

  const handleCreateExtPeriod = async (values: {
    name: string;
    startDate: ReturnType<typeof dayjs>;
    endDate: ReturnType<typeof dayjs>;
  }) => {
    try {
      await extensionPeriodsApi.create({
        name: values.name,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
      });
      message.success("Đã tạo đợt gia hạn");
      setExtCreateModalOpen(false);
      extCreateForm.resetFields();
      await loadExtensionPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tạo được đợt");
    }
  };

  const extensionStatusText =
    contractExtensionEnabled === false
      ? "Chức năng gia hạn đang tắt toàn cục"
      : activeExtPeriod
        ? `Đang mở — hết hạn ${dayjs(activeExtPeriod.endDate).format("DD/MM/YYYY HH:mm")} (còn ${extQuickCountdown || "…"})`
        : "Chưa mở đợt — sinh viên chỉ gia hạn khi còn ≤30 ngày đến hạn HĐ";

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void loadExtendRequests(), 30000);
    return () => window.clearInterval(timer);
  }, [page, filters.status, filters.room, filters.area, quick.hasDebt, search, faculty, major]);

  useEffect(() => {
    void loadExtendRequests();
  }, [extendStatusFilter, extendSearch]);

  useEffect(() => {
    if (!socket) return;
    const onNewExtend = () => {
      void loadExtendRequests();
      void opsContractsApi.dashboard().then((res) => setOps(res.data?.cards || null)).catch(() => {});
    };
    socket.on("contract:extend-request:new", onNewExtend);
    return () => {
      socket.off("contract:extend-request:new", onNewExtend);
    };
  }, [socket, extendStatusFilter, extendSearch]);

  useEffect(() => {
    if (!openContractId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await contractsApi.getById(openContractId);
        if (cancelled || !res.data) return;
        setDetailModal(res.data as Contract);
      } catch {
        message.error("Không mở được hợp đồng từ liên kết");
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("openContract");
              return next;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openContractId, setSearchParams]);

  useEffect(() => {
    if (!extendTabActive) return;
    window.setTimeout(() => {
      document.getElementById("extend-requests")?.scrollIntoView({ behavior: "smooth" });
    }, 200);
  }, [extendTabActive]);

  useEffect(() => {
    areasApi
      .getAll()
      .then((res) => setAreas((res.data?.areas ?? res.data ?? []) as Array<Pick<Area, "_id" | "name">>))
      .catch(() => setAreas([]));
  }, []);

  useEffect(() => {
    opsContractsApi
      .dashboard()
      .then((res) => setOps(res.data?.cards || null))
      .catch(() => setOps(null));
  }, []);

  const handleTerminate = (c: Contract) => {
    Modal.confirm({
      title: "Chấm dứt hợp đồng",
      content: `Xác nhận chấm dứt hợp đồng ${c.contractNumber}? Sinh viên sẽ bị trả phòng và số đang ở phòng/khu được cập nhật lại.`,
      okText: "Chấm dứt",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await contractsApi.terminate(c._id);
          message.success("Đã chấm dứt hợp đồng");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const handleDelete = (c: Contract) => {
    Modal.confirm({
      title: "Xóa hợp đồng",
      content: `Xóa vĩnh viễn hợp đồng ${c.contractNumber}? Hệ thống sẽ cập nhật lại số sinh viên đang ở phòng.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await contractsApi.remove(c._id);
          message.success("Đã xóa hợp đồng");
          setDetailModal(null);
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const handleExtend = async (v: { endDate: dayjs.Dayjs }) => {
    if (!extendModal) return;
    try {
      await contractsApi.extend(extendModal._id, v.endDate.format("YYYY-MM-DD"));
      message.success("Đã gia hạn hợp đồng");
      setExtendModal(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const activeCount = data.filter((c) => c.status === "active").length;

  const columns = [
    {
      title: "STT",
      key: "stt",
      width: 70,
      render: (_: unknown, __: Contract, idx: number) => (page - 1) * 10 + idx + 1,
    },
    {
      title: "Số HĐ",
      dataIndex: "contractNumber",
      key: "contractNumber",
      width: 140,
      render: (v: string) => <strong style={{ fontFamily: "monospace" }}>{v || "-"}</strong>,
    },
    {
      title: "Sinh viên",
      key: "user",
      width: 160,
      render: (_: unknown, r: Contract) => (r.user ? (typeof r.user === "object" ? (r.user as { fullName?: string }).fullName : r.user) : "-"),
    },
    {
      title: "MSSV",
      key: "studentId",
      width: 100,
      render: (_: unknown, r: Contract) =>
        r.user && typeof r.user === "object" ? String((r.user as User).studentId || "-") : "-",
    },
    {
      title: "Giới tính",
      key: "gender",
      width: 90,
      render: (_: unknown, r: Contract) =>
        r.user && typeof r.user === "object" ? String((r.user as User).gender || "-") : "-",
    },
    {
      title: "Phòng",
      key: "room",
      width: 100,
      render: (_: unknown, r: Contract) => {
        if (!r.room) return "-";
        const room = typeof r.room === "object" ? r.room : null;
        const area = room?.area && typeof room.area === "object" ? room.area.name : "";
        return room ? `${room.roomNumber}${area ? ` (${area})` : ""}` : "-";
      },
    },
    {
      title: "Giá phòng (nền)",
      key: "roomPricing",
      width: 168,
      render: (_: unknown, r: Contract) => {
        const room = typeof r.room === "object" ? (r.room as Room) : null;
        if (!room || room.price == null) return "—";
        const slots = roomSlots(room);
        const full = Math.round(Number(room.price));
        const per = Math.round(full / slots);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.45 }}>
            <div>
              Tổng phòng: <strong>{full.toLocaleString("vi-VN")}</strong>đ/th
            </div>
            <div>
              {slots} slot → <strong>{per.toLocaleString("vi-VN")}</strong>đ/slot
            </div>
          </div>
        );
      },
    },
    {
      title: "Từ ngày",
      dataIndex: "startDate",
      key: "startDate",
      width: 110,
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-"),
    },
    {
      title: "Đến ngày",
      dataIndex: "endDate",
      key: "endDate",
      width: 110,
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-"),
    },
    {
      title: "SV ký",
      key: "signedAt",
      width: 100,
      render: (_: unknown, r: Contract) =>
        r.signedAt ? (
          <Tag color="green">Đã ký</Tag>
        ) : r.status === "pending_payment" ? (
          <Tag color="gold">Chưa ký</Tag>
        ) : (
          "—"
        ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 220,
      fixed: "right" as const,
      render: (_: unknown, r: Contract) => (
        <Space wrap size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
            Chi tiết
          </Button>
          {r.status === "pending_payment" && (
            <Button
              type="link"
              size="small"
              disabled={!r.signedAt}
              title={!r.signedAt ? "Sinh viên chưa ký xác nhận" : undefined}
              onClick={() =>
                setConfirmModal({
                  contract: r,
                  signedPdfUrl: r.signedPdfUrl || "",
                })
              }
            >
              Xác nhận
            </Button>
          )}
          {r.status === "active" && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CalendarOutlined />}
                onClick={() => {
                  setExtendModal(r);
                  form.setFieldsValue({ endDate: dayjs(r.endDate) });
                }}
              >
                Gia hạn
              </Button>
              <Button type="link" danger size="small" icon={<StopOutlined />} onClick={() => handleTerminate(r)}>
                Chấm dứt
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Dorm Operations Center — Hợp đồng lưu trú</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Trung tâm vận hành lưu trú: hợp đồng, công nợ, vi phạm, gia hạn, chuyển phòng.
        </p>
      </div>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Input.Search
            placeholder="Tìm kiếm theo tên hoặc MSSV"
            allowClear
            style={{ width: 420, maxWidth: "100%" }}
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            onSearch={() => void load()}
          />
        </div>
      </Card>

      <Card
        id="extension-period-panel"
        title="Đợt gia hạn hợp đồng"
        style={{ marginBottom: 16, borderRadius: 12, scrollMarginTop: 80 }}
        loading={extPeriodsLoading && contractExtensionEnabled === null}
        extra={
          <Button size="small" onClick={() => setExtCreateModalOpen(true)}>
            Tạo đợt
          </Button>
        }
      >
        {extPeriodsError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message={extPeriodsError}
            action={
              <Button size="small" onClick={() => void loadExtensionPeriods()}>
                Thử lại
              </Button>
            }
          />
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Cho phép gia hạn (toàn hệ thống)</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {contractExtensionEnabled === false
                ? "Tắt — sinh viên không thể gia hạn"
                : "Bật — có thể mở đợt gia hạn tập trung"}
            </div>
          </div>
          <Switch
            checked={contractExtensionEnabled ?? true}
            checkedChildren="Bật"
            unCheckedChildren="Tắt"
            loading={contractExtensionToggling}
            onChange={(v) => void handleContractExtensionToggle(v)}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 12,
            borderTop: "1px solid #f3f4f6",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Mở đợt gia hạn hiện tại</div>
            <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 520 }}>{extensionStatusText}</div>
            {activeExtPeriod ? (
              <div style={{ fontSize: 12, color: "#059669", marginTop: 4 }}>
                Trong đợt: mọi SV có HĐ <strong>active</strong> thấy nút gia hạn (HĐ mới +6 tháng), bỏ qua giới hạn 30 ngày.
              </div>
            ) : null}
          </div>
          <Switch
            checked={!!activeExtPeriod}
            checkedChildren="Mở"
            unCheckedChildren="Đóng"
            loading={!!extTogglingId}
            disabled={contractExtensionEnabled === false}
            onChange={(v) => void handleExtMainToggle(v)}
          />
        </div>
        {contractExtensionEnabled !== false && extPeriods.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Lịch sử đợt (gần nhất)</div>
            <Table<ExtensionPeriodItem>
              size="small"
              rowKey="_id"
              pagination={false}
              dataSource={extPeriods.slice(0, 5)}
              columns={[
                { title: "Tên đợt", dataIndex: "name", key: "name" },
                {
                  title: "Bắt đầu",
                  key: "start",
                  width: 150,
                  render: (_, r) => dayjs(r.startDate).format("DD/MM/YYYY HH:mm"),
                },
                {
                  title: "Kết thúc",
                  key: "end",
                  width: 150,
                  render: (_, r) => dayjs(r.endDate).format("DD/MM/YYYY HH:mm"),
                },
                {
                  title: "Trạng thái",
                  key: "st",
                  width: 120,
                  render: (_, r) =>
                    isExtPeriodOpenNow(r, nowMs) ? (
                      <Tag color="green">Đang mở</Tag>
                    ) : r.isActive ? (
                      <Tag color="gold">Đã bật (ngoài hạn)</Tag>
                    ) : (
                      <Tag>Đóng</Tag>
                    ),
                },
              ]}
            />
          </div>
        )}
      </Card>

      <Card
        id="extend-requests"
        title={`Quản lý đơn gia hạn (${extendStatusFilter === "pending" ? `${extendReqs.length} hiển thị` : "danh sách"})`}
        style={{ marginBottom: 24, borderRadius: 12, scrollMarginTop: 80 }}
        size="small"
        extra={
          <Button type="link" size="small" onClick={() => void loadExtendRequests()}>
            Làm mới
          </Button>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <Select
            value={extendStatusFilter}
            style={{ width: 160 }}
            onChange={(v) => setExtendStatusFilter(v)}
            options={[
              { value: "pending", label: "Chờ duyệt" },
              { value: "approved", label: "Đã duyệt" },
              { value: "rejected", label: "Từ chối" },
              { value: "all", label: "Tất cả" },
            ]}
          />
          <Input.Search
            placeholder="Tìm tên, MSSV, số HĐ"
            allowClear
            style={{ width: 280, maxWidth: "100%" }}
            value={extendSearch}
            onChange={(e) => setExtendSearch(e.target.value)}
            onSearch={() => void loadExtendRequests()}
          />
        </div>
        {extendTabActive ? (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Bạn đang xem mục đơn gia hạn từ thông báo hoặc liên kết trực tiếp." />
        ) : null}
        {extendLoading ? (
          <div style={{ padding: 24, textAlign: "center" }}>Đang tải…</div>
        ) : extendReqs.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="Chưa có yêu cầu gia hạn"
            description="Sinh viên gia hạn từ «Hợp đồng của tôi»: mở đợt ở khối phía trên (mọi HĐ active) hoặc tự động khi còn ≤30 ngày đến hạn."
          />
        ) : (
          <Table<ContractExtendRequest>
            rowKey="_id"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="small"
            dataSource={extendReqs}
            columns={[
              {
                title: "Thời gian",
                key: "createdAt",
                width: 140,
                render: (_, r) => (r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"),
              },
              {
                title: "Sinh viên",
                key: "u",
                render: (_, r) =>
                  typeof r.user === "object" && r.user
                    ? `${(r.user as User).fullName || ""} (${(r.user as User).studentId || ""})`
                    : "—",
              },
              {
                title: "Hợp đồng",
                key: "c",
                render: (_, r) => (typeof r.contract === "object" ? (r.contract as Contract).contractNumber || "—" : "—"),
              },
              { title: "Tháng", dataIndex: "months", width: 70 },
              {
                title: "Kết thúc (lúc gửi)",
                key: "end",
                width: 120,
                render: (_, r) =>
                  r.snapshotEndDate ? new Date(r.snapshotEndDate).toLocaleDateString("vi-VN") : "—",
              },
              {
                title: "SV ký HĐ",
                key: "signed",
                width: 90,
                render: (_, r) => {
                  const c = typeof r.contract === "object" ? (r.contract as Contract) : null;
                  return c?.signedAt ? <Tag color="green">Đã ký</Tag> : <Tag>Chưa ký</Tag>;
                },
              },
              {
                title: "Trạng thái",
                key: "status",
                width: 110,
                render: (_, r) => {
                  const m = extendStatusMap[r.status] || { color: "default", text: r.status };
                  return <Tag color={m.color}>{m.text}</Tag>;
                },
              },
              {
                title: "Ghi chú",
                key: "note",
                ellipsis: true,
                render: (_, r) =>
                  r.status === "approved" && r.appliedEndDate
                    ? `Kết thúc mới: ${new Date(r.appliedEndDate).toLocaleDateString("vi-VN")}`
                    : r.note || "—",
              },
              {
                title: "",
                key: "act",
                width: 200,
                render: (_, r) =>
                  r.status === "pending" ? (
                    <Space>
                      <Button
                        type="primary"
                        size="small"
                        onClick={async () => {
                          try {
                            await contractsApi.approveExtendRequest(r._id);
                            message.success("Đã duyệt gia hạn");
                            void load();
                            void loadExtendRequests();
                          } catch (err: unknown) {
                            message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
                          }
                        }}
                      >
                        Duyệt
                      </Button>
                      <Button danger size="small" onClick={() => setRejectExt({ id: r._id, note: "" })}>
                        Từ chối
                      </Button>
                    </Space>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title="Từ chối yêu cầu gia hạn"
        open={!!rejectExt}
        onCancel={() => setRejectExt(null)}
        onOk={async () => {
          if (!rejectExt?.note?.trim()) {
            message.warning("Nhập lý do");
            return;
          }
          try {
            await contractsApi.rejectExtendRequest(rejectExt.id, rejectExt.note.trim());
            message.success("Đã từ chối");
            setRejectExt(null);
            void load();
            void loadExtendRequests();
          } catch (err: unknown) {
            message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
          }
        }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Lý do từ chối"
          value={rejectExt?.note || ""}
          onChange={(e) => setRejectExt((prev) => (prev ? { ...prev, note: e.target.value } : null))}
        />
      </Modal>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}><FileDoneOutlined /> HĐ hiệu lực</span>} value={ops?.activeContracts ?? activeCount} suffix="hđ" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title={<span><ClockCircleOutlined /> Sắp hết hạn (≤30 ngày)</span>} value={ops?.expiringSoonContracts ?? 0} suffix="hđ" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            onClick={() => {
              setPage(1);
              setQuick({ hasDebt: true });
              void load();
            }}
          >
            <Statistic title={<span><DollarOutlined /> SV còn nợ phí</span>} value={ops?.studentsWithDebt ?? 0} suffix="sv" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title={<span><WarningOutlined /> Vi phạm chờ xử lý</span>} value={ops?.pendingViolations ?? 0} suffix="vụ" />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            hoverable
            onClick={() => {
              document.getElementById("extend-requests")?.scrollIntoView({ behavior: "smooth" });
              setExtendStatusFilter("pending");
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("tab", "extend");
                return next;
              });
            }}
          >
            <Statistic title={<span><CalendarOutlined /> Yêu cầu gia hạn</span>} value={ops?.pendingRenewalRequests ?? extendReqs.filter((r) => r.status === "pending").length} suffix="y/c" />
          </Card>
        </Col>
        <Col xs={0} md={18} />
      </Row>

      {quick.hasDebt ? (
        <div style={{ margin: "-8px 0 16px 0" }}>
          <Tag closable color="red" onClose={() => setQuick({})}>
            Đang lọc: Sinh viên còn nợ phí
          </Tag>
        </div>
      ) : null}

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input
            placeholder="Lọc theo khóa"
            allowClear
            style={{ width: 160 }}
            value={faculty}
            onChange={(e) => {
              setPage(1);
              setFaculty(e.target.value);
            }}
            onPressEnter={() => void load()}
          />
          <Input
            placeholder="Lọc theo ngành"
            allowClear
            style={{ width: 160 }}
            value={major}
            onChange={(e) => {
              setPage(1);
              setMajor(e.target.value);
            }}
            onPressEnter={() => void load()}
          />
          <Select
            placeholder="Lọc theo khu"
            allowClear
            style={{ width: 180 }}
            value={filters.area}
            onChange={(v) => {
              setFilters((f) => ({ ...f, area: v }));
              setPage(1);
            }}
            showSearch
            optionFilterProp="children"
          >
            {areas.map((a) => (
              <Select.Option key={a._id} value={a._id}>
                {a.name}
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 150 }}
            value={filters.status}
            onChange={(v) => {
              setFilters((f) => ({ ...f, status: v }));
              setPage(1);
            }}
          >
            <Select.Option value="pending_payment">Chờ xác nhận (chưa hiệu lực)</Select.Option>
            <Select.Option value="active">Có hiệu lực</Select.Option>
            <Select.Option value="expired">Hết hạn</Select.Option>
            <Select.Option value="terminated">Đã chấm dứt</Select.Option>
          </Select>
          <Select
            placeholder="Lọc theo phòng"
            allowClear
            style={{ width: 180 }}
            value={filters.room}
            onChange={(v) => {
              setFilters((f) => ({ ...f, room: v }));
              setPage(1);
            }}
            showSearch
            optionFilterProp="children"
          >
            {rooms.map((r) => (
              <Select.Option key={r._id} value={r._id}>
                Phòng {r.roomNumber} {r.area?.name ? `- ${r.area.name}` : ""}
              </Select.Option>
            ))}
          </Select>
          <Button
            onClick={() => {
              setFilters({});
              setSearch("");
              setFaculty("");
              setMajor("");
              setQuick({});
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            icon={<DownloadOutlined />}
            onClick={() =>
              exportToExcel(
                data.map((c, idx) => ({
                  STT: (page - 1) * 10 + idx + 1,
                  "Số HĐ": c.contractNumber,
                  "Sinh viên": c.user && typeof c.user === "object" ? (c.user as { fullName?: string }).fullName : "-",
                  MSSV: c.user && typeof c.user === "object" ? (c.user as User).studentId || "-" : "-",
                  "Giới tính": c.user && typeof c.user === "object" ? (c.user as User).gender || "-" : "-",
                  Khóa: c.user && typeof c.user === "object" ? (c.user as User).faculty || "-" : "-",
                  Ngành: c.user && typeof c.user === "object" ? (c.user as User).major || "-" : "-",
                  "Phòng": c.room && typeof c.room === "object" ? (c.room as { roomNumber?: string }).roomNumber : "-",
                  "Số slot": c.room && typeof c.room === "object" ? (c.room as Room).capacity ?? "-" : "-",
                  "Tổng phòng/tháng (đ)":
                    c.room && typeof c.room === "object" && (c.room as Room).price != null
                      ? Math.round(Number((c.room as Room).price))
                      : "-",
                  "Giá 01 slot/tháng (đ)":
                    c.room && typeof c.room === "object" && (c.room as Room).price != null
                      ? Math.round(
                          Number((c.room as Room).price) /
                            Math.max(1, Number((c.room as Room).capacity) || 1),
                        )
                      : "-",
                  "Từ ngày": c.startDate ? new Date(c.startDate).toLocaleDateString("vi-VN") : "-",
                  "Đến ngày": c.endDate ? new Date(c.endDate).toLocaleDateString("vi-VN") : "-",
                  "Trạng thái": statusMap[c.status]?.text || c.status,
                })),
                "danh-sach-hop-dong",
                "Hợp đồng",
              )
            }
          >
            Xuất Excel
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize: 10,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t} hợp đồng`,
          }}
          scroll={{ x: 1080 }}
          size="middle"
        />
      </Card>

      <Modal
        title={confirmModal ? `Xác nhận hợp đồng ${confirmModal.contract.contractNumber || ""}` : "Xác nhận hợp đồng"}
        open={!!confirmModal}
        onCancel={() => setConfirmModal(null)}
        onOk={async () => {
          if (!confirmModal) return;
          const pdfUrl = String(confirmModal.signedPdfUrl || "").trim();
          if (!pdfUrl) {
            message.warning("Vui lòng nhập đường dẫn PDF đã ký");
            return;
          }
          try {
            await contractsApi.uploadSignedPdf(confirmModal.contract._id, pdfUrl);
            await contractsApi.confirmPayment(confirmModal.contract._id);
            message.success("Đã xác nhận. Hợp đồng có hiệu lực.");
            setConfirmModal(null);
            void load();
          } catch (err: unknown) {
            message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
          }
        }}
      >
        <p style={{ marginBottom: 8, color: "#6b7280" }}>
          Điều kiện hiệu lực: sinh viên đã ký và có file PDF hợp đồng đã ký bởi hai bên.
        </p>
        <Input
          placeholder="https://.../hop-dong-da-ky.pdf"
          value={confirmModal?.signedPdfUrl || ""}
          onChange={(e) =>
            setConfirmModal((prev) => (prev ? { ...prev, signedPdfUrl: e.target.value } : null))
          }
        />
      </Modal>

      <Modal
        title={`Chi tiết hợp đồng ${detailModal?.contractNumber || ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>
            Đóng
          </Button>,
          detailModal?.status === "active" && (
            <Button
              key="terminate"
              danger
              icon={<StopOutlined />}
              onClick={() => {
                handleTerminate(detailModal);
                setDetailModal(null);
              }}
            >
              Chấm dứt hợp đồng
            </Button>
          ),
          detailModal && detailModal.status !== "active" && (
            <Button
              key="delete"
              danger
              onClick={() => handleDelete(detailModal)}
            >
              Xóa hợp đồng
            </Button>
          ),
        ].filter(Boolean) as React.ReactNode[]}
        width={900}
      >
        {detailModal && (() => {
          const u = typeof detailModal.user === "object" ? (detailModal.user as User) : null;
          const studentName = u?.fullName || "-";
          const studentGender = u?.gender || "-";
          const studentIdVal = u?.studentId || "-";
          const citizenId = u?.citizenId || "-";
          const dateOfBirth = u?.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString("vi-VN") : "-";
          const ethnicity = "-";
          return (
            <div style={{ maxHeight: "70vh", overflowY: "auto", lineHeight: 1.8, paddingRight: 6 }}>
              <h3 style={{ textAlign: "center", marginBottom: 4 }}>HỢP ĐỒNG THUÊ CHỖ Ở NỘI TRÚ</h3>
              <p style={{ marginBottom: 12, textAlign: "center" }}>
                <strong>Số hợp đồng:</strong> {detailModal.contractNumber || "-"}
              </p>

              {(() => {
                const room = typeof detailModal.room === "object" ? (detailModal.room as Room) : null;
                if (!room) return null;
                const slots = roomSlots(room);
                const full = Math.round(Number(room.price || 0));
                const perSlotTable = Math.round(full / slots);
                const agreed = detailModal.monthlyRent != null && Number(detailModal.monthlyRent) > 0;
                return (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 14 }}
                    message="Thông tin phòng — Bên lập hợp đồng cần nắm để ghi Điều 2"
                    description={
                      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                        <div>
                          <strong>Phòng:</strong> {room.roomNumber} — <strong>Số chỗ (slot):</strong> {slots}
                        </div>
                        <div>
                          <strong>Tổng tiền thuê phòng (VNĐ/tháng):</strong> {full.toLocaleString("vi-VN")}đ
                        </div>
                        <div>
                          <strong>Giá 01 slot theo bảng giá phòng:</strong> {perSlotTable.toLocaleString("vi-VN")}đ/tháng (= {full.toLocaleString("vi-VN")} ÷ {slots})
                        </div>
                        {agreed ? (
                          <div>
                            <strong>Giá thỏa thuận trên hợp đồng (01 chỗ/tháng):</strong>{" "}
                            {Math.round(Number(detailModal.monthlyRent)).toLocaleString("vi-VN")}đ
                          </div>
                        ) : null}
                      </div>
                    }
                  />
                );
              })()}

              <p><strong>BÊN CHO THUÊ (BÊN A):</strong> KÝ TÚC XÁ TRƯỜNG ĐẠI HỌC (ĐH)</p>
              <p><strong>Địa chỉ:</strong> {lessorAddress}</p>
              <p><strong>Điện thoại:</strong> {lessorPhone}</p>

              <p style={{ marginTop: 10 }}><strong>BÊN THUÊ (BÊN B):</strong></p>
              <p><strong>Họ và tên:</strong> {studentName} &nbsp;&nbsp;&nbsp; <strong>Nam/Nữ:</strong> {studentGender}</p>
              <p><strong>Mã SV:</strong> {studentIdVal} &nbsp;&nbsp;&nbsp; <strong>CCCD:</strong> {citizenId}</p>
              <p><strong>Ngày sinh:</strong> {dateOfBirth} &nbsp;&nbsp;&nbsp; <strong>Dân tộc:</strong> {ethnicity}</p>
              {u?.email ? <p><strong>Email:</strong> {u.email}</p> : null}
              {u?.phone ? <p><strong>SĐT:</strong> {u.phone}</p> : null}

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 1: NỘI DUNG THUÊ</strong></p>
              <p>
                Bên A đồng ý cho Bên B thuê 01 chỗ ở nội trú tại: Phòng{" "}
                <strong>{typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</strong>, Tầng{" "}
                <strong>{typeof detailModal.room === "object" ? detailModal.room?.floor || "-" : "-"}</strong>, Nhà{" "}
                <strong>
                  {typeof detailModal.room === "object" && detailModal.room?.area && typeof detailModal.room.area === "object"
                    ? detailModal.room.area.name
                    : "-"}
                </strong>{" "}
                của KTX Trường ĐH.
              </p>
              <p>Bên B được sử dụng trang thiết bị tại phòng theo nội quy của Trường ĐH.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 2: CHI PHÍ VÀ THANH TOÁN</strong></p>
              {(() => {
                const room = typeof detailModal.room === "object" ? (detailModal.room as Room) : null;
                if (!room) {
                  return (
                    <p>
                      Giá thuê: <strong>—</strong>
                    </p>
                  );
                }
                const slots = roomSlots(room);
                const fullMonthly = Math.round(Number(room.price || 0));
                const studentMonthly = studentMonthlyRentVnd(detailModal, room);
                const months = monthsBetweenStartEnd(detailModal.startDate, detailModal.endDate);
                const totalStudentPeriod = studentMonthly * months;
                const agreed = detailModal.monthlyRent != null && Number(detailModal.monthlyRent) > 0;
                return (
                  <>
                    <p>
                      <strong>Giá thuê:</strong> Phòng có <strong>{slots}</strong> chỗ (slot). Tổng tiền thuê{" "}
                      <strong>toàn phòng</strong>:{" "}
                      <strong>{fullMonthly.toLocaleString("vi-VN")} VNĐ/tháng</strong>. Giá thuê{" "}
                      <strong>01 chỗ (01 sinh viên — Bên B)</strong>:{" "}
                      <strong>{studentMonthly.toLocaleString("vi-VN")} VNĐ/tháng</strong>
                      {agreed ? " (ghi theo thỏa thuận trong hợp đồng)" : ` (= ${fullMonthly.toLocaleString("vi-VN")} ÷ ${slots})`}.
                    </p>
                    <p>
                      Tổng tiền Bên B thanh toán tiền thuê cho cả thời hạn hợp đồng (theo 01 chỗ, {months} tháng):{" "}
                      <strong>{totalStudentPeriod.toLocaleString("vi-VN")} VNĐ</strong>.
                    </p>
                  </>
                );
              })()}
              <p>Tiền thế chấp tài sản: <strong>100.000 VNĐ/sinh viên</strong>.</p>
              <p>
                Thời hạn thuê: Từ ngày <strong>{new Date(detailModal.startDate).toLocaleDateString("vi-VN")}</strong> đến ngày{" "}
                <strong>{new Date(detailModal.endDate).toLocaleDateString("vi-VN")}</strong>.
              </p>
              <p>Phương thức thanh toán: Thanh toán trực tuyến qua tài khoản của Trường ĐH tại thời điểm nhận phòng.</p>
              <p>Tiền điện, nước: Thanh toán hàng tháng theo chỉ số công tơ và đơn giá quy định.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 3: TRÁCH NHIỆM CỦA SINH VIÊN</strong></p>
              <p>Chấp hành nghiêm chỉnh pháp luật, nội quy KTX và quy định về PCCC.</p>
              <p>Ở đúng vị trí được sắp xếp; không tự ý chuyển nhượng chỗ ở cho người khác.</p>
              <p>Giữ gìn vệ sinh, bảo quản tài sản công. Bồi thường nếu gây hư hỏng, mất mát.</p>
              <p>Thanh toán đầy đủ các khoản phí dịch vụ (điện, nước, gửi xe, wifi...) đúng hạn.</p>
              <p>Bàn giao phòng và chìa khóa ngay khi hết hạn hợp đồng hoặc nghỉ hè/Tết.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 4: CHẤM DỨT HỢP ĐỒNG</strong></p>
              <p>
                Hợp đồng chấm dứt khi: Hết thời hạn; SV tự nguyện xin ra; SV tốt nghiệp/thôi học; hoặc SV vi phạm kỷ luật bị buộc ra khỏi KTX.
              </p>
              <p>(Lưu ý: Trường ĐH không hoàn trả phí nội trú nếu SV vi phạm kỷ luật hoặc chấm dứt hợp đồng sau 01 tháng).</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 5: ĐIỀU KHOẢN CHUNG</strong></p>
              <p>
                Mọi hư hỏng tài sản hoặc nợ phí sẽ được trừ vào tiền thế chấp. Sau khi hoàn tất thủ tục trả phòng, Trường ĐH sẽ hoàn trả lại tiền thế chấp cho sinh viên.
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <div style={{ textAlign: "center", width: "48%" }}>
                  <strong>ĐẠI DIỆN BÊN B</strong>
                  <div>(Ký, ghi rõ họ tên)</div>
                  <div style={{ marginTop: 16, minHeight: 24 }}>
                    {detailModal.signedAt
                      ? `${studentName} - Đã ký ngày ${new Date(detailModal.signedAt).toLocaleString("vi-VN")}`
                      : "Chưa ký"}
                  </div>
                </div>
                <div style={{ textAlign: "center", width: "48%" }}>
                  <strong>ĐẠI DIỆN BÊN A</strong>
                  <div>(Ký, ghi rõ họ tên)</div>
                  <div style={{ marginTop: 16, minHeight: 24 }}>
                    {detailModal.status === "active" ? "Đã ký - Hợp đồng có hiệu lực" : "Chờ admin xác nhận"}
                  </div>
                </div>
              </div>

              <p style={{ marginTop: 16 }}>
                <strong>Trạng thái hiện tại:</strong>{" "}
                <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag>
              </p>
              {detailModal.status === "pending_payment" && (
                <p style={{ color: "#ad6800" }}>
                  <strong>Hướng dẫn:</strong>{" "}
                  {detailModal.signedAt
                    ? detailModal.signedPdfUrl
                      ? "Sinh viên đã ký và đã có PDF. Admin có thể xác nhận để hợp đồng có hiệu lực."
                      : "Sinh viên đã ký nhưng chưa có file PDF đã ký. Vui lòng upload PDF trước khi xác nhận."
                    : "Sinh viên chưa ký xác nhận hợp đồng."}
                </p>
              )}
              {detailModal.signedPdfUrl ? (
                <p style={{ marginTop: 8 }}>
                  <strong>PDF đã ký:</strong>{" "}
                  <a href={detailModal.signedPdfUrl} target="_blank" rel="noreferrer">
                    Xem file
                  </a>
                </p>
              ) : null}
              {detailModal.terms ? (
                <div style={{ marginTop: 16 }}>
                  <strong>Điều khoản bổ sung / ghi chú:</strong>
                  <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{detailModal.terms}</p>
                </div>
              ) : null}
            </div>
          );
        })()}
      </Modal>

      <Modal title="Tạo đợt gia hạn hợp đồng" open={extCreateModalOpen} onCancel={() => setExtCreateModalOpen(false)} footer={null}>
        <Form form={extCreateForm} layout="vertical" onFinish={handleCreateExtPeriod}>
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true, message: "Nhập tên đợt" }]}>
            <Input placeholder="VD: Gia hạn HK2 2025–2026" />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true, message: "Chọn ngày bắt đầu" }]}>
            <DatePicker style={{ width: "100%" }} showTime />
          </Form.Item>
          <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true, message: "Chọn ngày kết thúc" }]}>
            <DatePicker style={{ width: "100%" }} showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Tạo đợt
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Mở đợt gia hạn hợp đồng"
        open={extOpenModalOpen}
        onCancel={() => setExtOpenModalOpen(false)}
        onOk={() => extOpenForm.submit()}
        okText="Mở đợt"
        cancelText="Hủy"
        confirmLoading={!!extTogglingId}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Sinh viên có hợp đồng đang hiệu lực sẽ thấy nút Gia hạn ngay, không cần chờ gần ngày hết hạn."
        />
        <Form form={extOpenForm} layout="vertical" onFinish={handleConfirmExtOpen}>
          <Form.Item
            name="endDate"
            label="Ngày giờ hết hạn đợt gia hạn"
            rules={[{ required: true, message: "Chọn ngày giờ kết thúc" }]}
          >
            <DatePicker style={{ width: "100%" }} showTime disabledDate={(d) => !!d && d < dayjs().startOf("day")} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Gia hạn hợp đồng"
        open={!!extendModal}
        onCancel={() => {
          setExtendModal(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        {extendModal && (
          <div style={{ marginBottom: 16 }}>
            <p>
              <strong>Số HĐ:</strong> {extendModal.contractNumber}
            </p>
            <p>
              <strong>Hết hạn hiện tại:</strong> {new Date(extendModal.endDate).toLocaleDateString("vi-VN")}
            </p>
          </div>
        )}
        <Form form={form} onFinish={handleExtend} layout="vertical">
          <Form.Item name="endDate" label="Ngày kết thúc mới" rules={[{ required: true }]}>
            <DatePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              disabledDate={(d) => (extendModal ? d.isBefore(dayjs(extendModal.endDate), "day") : false)}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Xác nhận gia hạn
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ContractsPage;
