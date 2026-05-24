/**
 * Quản lý dịch vụ KTX (Bootstrap 5): danh mục, gán phòng, nhập chỉ số điện/nước.
 * API: /api/services, /api/room-services, /api/service-usage
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import "./admin-dorm-services.css";
import { useSocket } from "../../contexts/SocketContext";
import { roomsApi, servicesApi, roomServicesApi, serviceUsageApi } from "../../api";
import type { Room } from "../../types";
import {
  BILLING_STATUS_CLASS,
  BILLING_STATUS_LABEL,
  meterDisplayStatus,
  meterPeriodLockedMessage,
  PAYMENT_STATUS_CLASS,
  PAYMENT_STATUS_LABEL,
  type MeterBillingStatus,
  type MeterPaymentStatus,
} from "../../utils/meterServiceDisplay";

type Svc = {
  _id: string;
  name: string;
  type: string;
  unit: string;
  price: number;
  measureUnit?: string;
  tariffType?: string;
  description?: string;
  isActive?: boolean;
};

type RoomSvcRow = {
  _id: string;
  room?: { roomNumber?: string; _id?: string } | string;
  service?: { _id?: string; name?: string; measureUnit?: string; tariffType?: string; price?: number };
  isActive?: boolean;
};

type UsageRow = {
  _id: string;
  room?: { roomNumber?: string; _id?: string };
  service?: { name?: string; measureUnit?: string; _id?: string };
  month: number;
  year: number;
  oldIndex: number;
  newIndex: number;
  usage: number;
  amount: number;
  serviceStatus?: string;
  billingStatus?: MeterBillingStatus;
  paymentStatus?: MeterPaymentStatus;
  isEditable?: boolean;
  billId?: string | null;
  bill?: { billCode?: string; status?: string };
};

type PeriodStatus = {
  billingStatus?: MeterBillingStatus;
  paymentStatus?: MeterPaymentStatus;
  isEditable?: boolean;
  billCount?: number;
  usageCount?: number;
};

const fmt = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;

type FilterSeg = "all" | "common" | "personal";

/** Kiểu tính phí — map sang unit / measureUnit / tariffType trên backend. */
type BillingKind = "monthly_fixed" | "meter" | "per_use";

function serviceToBillingKind(s: Pick<Svc, "unit" | "measureUnit">): BillingKind {
  if (s.measureUnit === "kwh" || s.measureUnit === "m3") return "meter";
  if (s.unit === "once") return "per_use";
  return "monthly_fixed";
}

function billingKindToFields(kind: BillingKind, meterMeasure: "kwh" | "m3") {
  if (kind === "meter") {
    return { unit: "monthly" as const, measureUnit: meterMeasure, tariffType: "variable" as const };
  }
  if (kind === "per_use") {
    return { unit: "once" as const, measureUnit: "month" as const, tariffType: "fixed" as const };
  }
  return { unit: "monthly" as const, measureUnit: "month" as const, tariffType: "fixed" as const };
}

function getBillingKindLabel(kind: BillingKind, measureUnit?: string): string {
  if (kind === "meter") {
    if (measureUnit === "m3") return "Theo chỉ số (m³)";
    if (measureUnit === "kwh") return "Theo chỉ số (kWh)";
    return "Theo chỉ số";
  }
  if (kind === "per_use") return "Tính theo số lần";
  return "Cố định theo tháng";
}

function getUnitLabel(s: Svc): string {
  const kind = serviceToBillingKind(s);
  if (kind === "monthly_fixed" && s.type === "common") return "Phòng / tháng";
  if (kind === "monthly_fixed" && s.type === "personal") return "Cá nhân / tháng";
  return getBillingKindLabel(kind, s.measureUnit);
}

function isMeterService(s: Svc): boolean {
  return s.isActive !== false && (s.measureUnit === "kwh" || s.measureUnit === "m3");
}

function rowRoomId(row: RoomSvcRow): string {
  const r = row.room;
  if (!r) return "";
  if (typeof r === "string") return r;
  return String(r._id || "");
}

function rowRoomNumber(row: RoomSvcRow): string {
  const r = row.room;
  if (!r) return "—";
  if (typeof r === "string") return "—";
  return r.roomNumber || "—";
}

function rowServiceId(row: RoomSvcRow): string {
  const s = row.service;
  if (!s) return "";
  if (typeof s === "string") return s;
  return String((s as { _id?: string })._id || "");
}

/** Tránh crash overlay CRA khi API 404 (backend cũ / chưa mount route). */
function apiErrMessage(e: unknown): string {
  if (isAxiosError(e)) {
    const st = e.response?.status;
    if (st === 404) {
      return (
        "API trả về 404 — thường do backend chưa có route mới. Hãy chạy backend trong thư mục `backend` (port 5000), " +
        "pull code mới nhất và khởi động lại. Cần có GET /api/room-services và GET /api/service-usage."
      );
    }
    const m = (e.response?.data as { message?: string } | undefined)?.message;
    if (m) return m;
  }
  return "Không tải được dữ liệu";
}

const ServiceManagementBootstrapPage: React.FC = () => {
  const { socket } = useSocket();
  const [tab, setTab] = useState<"svc" | "room" | "usage">("svc");
  const [services, setServices] = useState<Svc[]>([]);
  const [svcLoading, setSvcLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<FilterSeg>("all");
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Svc | null>(null);
  const [svcPage, setSvcPage] = useState(1);
  const [svcPageSize, setSvcPageSize] = useState(10);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomRows, setRoomRows] = useState<RoomSvcRow[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus | null>(null);
  const [usageFilter, setUsageFilter] = useState({
    room: "",
    month: "" as string | number,
    year: "" as string | number,
    billingStatus: "",
    paymentStatus: "",
  });

  const [form, setForm] = useState({
    name: "",
    type: "common" as "common" | "personal",
    price: "" as string | number,
    billingKind: "monthly_fixed" as BillingKind,
    meterMeasure: "kwh" as "kwh" | "m3",
    unit: "monthly" as "monthly" | "once",
    measureUnit: "month" as "month" | "kwh" | "m3",
    tariffType: "fixed" as "fixed" | "variable",
    description: "",
    isActive: true,
  });

  const [rsForm, setRsForm] = useState({ room: "", service: "" });
  const [usForm, setUsForm] = useState({
    room: "",
    service: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    oldIndex: "",
    newIndex: "",
    note: "",
  });

  const loadServices = useCallback(async () => {
    setSvcLoading(true);
    try {
      const res = await servicesApi.getAll();
      setServices((res.data as Svc[]) || []);
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setSvcLoading(false);
    }
  }, []);

  const loadRooms = useCallback(async () => {
    const res = await roomsApi.getAll({ limit: 500 });
    setRooms((res.data as { rooms?: Room[] })?.rooms || []);
  }, []);

  const loadRoomServices = useCallback(async () => {
    setErr(null);
    try {
      const res = await roomServicesApi.list({ limit: 200 });
      setRoomRows((res.data as { items?: RoomSvcRow[] })?.items || []);
    } catch (e) {
      setErr(apiErrMessage(e));
      setRoomRows([]);
    }
  }, []);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setErr(null);
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (usageFilter.room) params.room = usageFilter.room;
      if (usageFilter.month) params.month = Number(usageFilter.month);
      if (usageFilter.year) params.year = Number(usageFilter.year);
      const res = await serviceUsageApi.list(params);
      let rows = (res.data as { items?: UsageRow[] })?.items || [];
      if (usageFilter.billingStatus) {
        rows = rows.filter((r) => r.billingStatus === usageFilter.billingStatus);
      }
      if (usageFilter.paymentStatus) {
        rows = rows.filter((r) => r.paymentStatus === usageFilter.paymentStatus);
      }
      setUsageRows(rows);
    } catch (e) {
      setErr(apiErrMessage(e));
      setUsageRows([]);
    } finally {
      setUsageLoading(false);
    }
  }, [usageFilter.room, usageFilter.month, usageFilter.year, usageFilter.billingStatus, usageFilter.paymentStatus]);

  const loadPeriodStatus = useCallback(async (room: string, month: number, year: number) => {
    if (!room) {
      setPeriodStatus(null);
      return;
    }
    try {
      const res = await serviceUsageApi.getPeriodStatus({ room, month, year });
      setPeriodStatus(res.data as PeriodStatus);
    } catch {
      setPeriodStatus(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    Promise.all([loadServices(), loadRooms()])
      .catch((e) => setErr(apiErrMessage(e)))
      .finally(() => setLoading(false));
  }, [loadServices, loadRooms]);

  useEffect(() => {
    setSvcPage(1);
  }, [search, segment]);

  const filteredServices = useMemo(() => {
    let rows = services;
    if (segment === "common") rows = rows.filter((s) => s.type === "common");
    if (segment === "personal") rows = rows.filter((s) => s.type === "personal");
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [services, segment, search]);

  const svcStats = useMemo(() => {
    const active = services.filter((s) => s.isActive !== false).length;
    const common = services.filter((s) => s.type === "common").length;
    const personal = services.filter((s) => s.type === "personal").length;
    const estCommonMonth = services
      .filter((s) => s.isActive !== false && s.type === "common" && !String(s.name).toLowerCase().includes("tiền phòng"))
      .reduce((a, s) => a + Number(s.price || 0), 0);
    return { active, common, personal, total: services.length, estCommonMonth };
  }, [services]);

  const svcPageCount = Math.max(1, Math.ceil(filteredServices.length / svcPageSize));
  const pagedServices = useMemo(() => {
    const start = (svcPage - 1) * svcPageSize;
    return filteredServices.slice(start, start + svcPageSize);
  }, [filteredServices, svcPage, svcPageSize]);

  const openCreateDrawer = () => {
    setEditing(null);
    const billingKind: BillingKind = "monthly_fixed";
    const fields = billingKindToFields(billingKind, "kwh");
    setForm({
      name: "",
      type: "personal",
      price: "",
      billingKind,
      meterMeasure: "kwh",
      ...fields,
      description: "",
      isActive: true,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (s: Svc) => {
    setEditing(s);
    const billingKind = serviceToBillingKind(s);
    const meterMeasure = s.measureUnit === "m3" ? "m3" : "kwh";
    const fields = billingKindToFields(billingKind, meterMeasure);
    setForm({
      name: s.name,
      type: (s.type as "common" | "personal") || "personal",
      price: s.price,
      billingKind,
      meterMeasure,
      unit: fields.unit,
      measureUnit: fields.measureUnit,
      tariffType: fields.tariffType,
      description: s.description || "",
      isActive: s.isActive !== false,
    });
    setDrawerOpen(true);
  };

  const applyBillingKind = (billingKind: BillingKind, meterMeasure = form.meterMeasure) => {
    const fields = billingKindToFields(billingKind, meterMeasure);
    setForm((f) => ({
      ...f,
      billingKind,
      meterMeasure,
      unit: fields.unit,
      measureUnit: fields.measureUnit,
      tariffType: fields.tariffType,
    }));
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    if (tab === "room") void loadRoomServices();
    if (tab === "usage") {
      void loadUsage();
      void loadRoomServices();
    }
  }, [tab, loadRoomServices, loadUsage]);

  useEffect(() => {
    if (tab !== "usage" || !usForm.room) {
      setPeriodStatus(null);
      return;
    }
    void loadPeriodStatus(usForm.room, Number(usForm.month), Number(usForm.year));
  }, [tab, usForm.room, usForm.month, usForm.year, loadPeriodStatus]);

  useEffect(() => {
    if (!socket || tab !== "usage") return;
    const refresh = () => {
      void loadUsage();
      if (usForm.room) {
        void loadPeriodStatus(usForm.room, Number(usForm.month), Number(usForm.year));
      }
    };
    socket.on("bill:new", refresh);
    socket.on("bill:paid", refresh);
    return () => {
      socket.off("bill:new", refresh);
      socket.off("bill:paid", refresh);
    };
  }, [socket, tab, loadUsage, loadPeriodStatus, usForm.room, usForm.month, usForm.year]);

  const submitService = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const p = Number(form.price);
    if (!(p >= 0)) {
      setErr("Giá phải ≥ 0");
      return;
    }
    setSvcLoading(true);
    try {
      const billingFields = billingKindToFields(form.billingKind, form.meterMeasure);
      const payload = {
        name: form.name.trim(),
        type: form.type,
        price: p,
        unit: billingFields.unit,
        measureUnit: billingFields.measureUnit,
        tariffType: billingFields.tariffType,
        description: form.description.trim(),
        isActive: form.isActive,
      };
      if (editing) {
        await servicesApi.update(editing._id, payload);
      } else {
        await servicesApi.create(payload);
      }
      closeDrawer();
      await loadServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lưu thất bại");
    } finally {
      setSvcLoading(false);
    }
  };

  const toggleSvc = async (s: Svc) => {
    setToggleId(s._id);
    try {
      await servicesApi.toggle(s._id);
      await loadServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không đổi được trạng thái");
    } finally {
      setToggleId(null);
    }
  };

  const delSvc = async (id: string) => {
    if (!window.confirm("Xóa dịch vụ? Chỉ xóa được khi không còn liên kết.")) return;
    try {
      await servicesApi.remove(id);
      await loadServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không xóa được");
    }
  };

  const submitRoomService = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await roomServicesApi.create({ room: rsForm.room, service: rsForm.service });
      setRsForm({ room: "", service: "" });
      await loadRoomServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi gán phòng");
    } finally {
      setLoading(false);
    }
  };

  const submitUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setUsageLoading(true);
    try {
      await serviceUsageApi.create({
        room: usForm.room,
        service: usForm.service,
        month: Number(usForm.month),
        year: Number(usForm.year),
        oldIndex: Number(usForm.oldIndex),
        newIndex: Number(usForm.newIndex),
        note: usForm.note,
      });
      setUsForm((f) => ({ ...f, oldIndex: "", newIndex: "", note: "" }));
      await loadUsage();
      if (usForm.room) {
        await loadPeriodStatus(usForm.room, Number(usForm.month), Number(usForm.year));
      }
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi nhập chỉ số");
    } finally {
      setUsageLoading(false);
    }
  };

  const meterCatalog = services.filter(isMeterService);
  const assignedMeterIdsForRoom = usForm.room
    ? new Set(
        roomRows
          .filter((row) => row.isActive !== false && rowRoomId(row) === usForm.room)
          .map((row) => rowServiceId(row))
          .filter(Boolean)
      )
    : new Set<string>();

  /** Luôn hiển thị toàn bộ dịch vụ đồng hồ — không ẩn sau khi tạo HĐ */
  const meterServicesForDropdown = meterCatalog;

  const periodLocked =
    periodStatus?.billingStatus === "closed" || periodStatus?.isEditable === false;
  const lockMessage = meterPeriodLockedMessage(periodStatus?.billingStatus);

  let meterServiceHint: string | null = null;
  if (meterCatalog.length === 0) {
    meterServiceHint = "Chưa có dịch vụ điện/nước. Tạo ở tab «Danh mục dịch vụ» với đơn vị đo kWh hoặc m³.";
  } else if (!usForm.room) {
    meterServiceHint = "Chọn phòng và kỳ để nhập chỉ số.";
  } else if (assignedMeterIdsForRoom.size > 0) {
    const unassigned = meterCatalog.filter((s) => !assignedMeterIdsForRoom.has(s._id));
    if (unassigned.length > 0) {
      meterServiceHint = "Một số dịch vụ chưa gán phòng — vẫn có thể chọn từ danh mục. Nên gán ở tab «Gán dịch vụ — phòng».";
    }
  } else {
    meterServiceHint = "Phòng chưa gán dịch vụ đồng hồ — hiển thị toàn danh mục điện/nước.";
  }

  const filteredUsageRows = usageRows;

  return (
    <div className="admin-dorm-services">
      <div className="mb-4">
        <h1 className="page-title">Dịch vụ KTX</h1>
        <p className="page-desc">
          Cấu hình dịch vụ chung (chia trên hóa đơn phòng) và dịch vụ cá nhân (sinh viên đăng ký). Giá chung được tự động đưa vào hóa đơn tháng.
        </p>
      </div>

      {err && (
        <div className="alert alert-danger py-2 small mb-3 d-flex justify-content-between align-items-start" role="alert">
          <span>{err}</span>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setErr(null)} />
        </div>
      )}

      <ul className="nav nav-tabs nav-tabs-svc">
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "svc" ? "active" : ""}`} onClick={() => setTab("svc")}>
            Danh mục dịch vụ
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "room" ? "active" : ""}`} onClick={() => setTab("room")}>
            Gán dịch vụ — phòng
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link ${tab === "usage" ? "active" : ""}`} onClick={() => setTab("usage")}>
            Chỉ số điện / nước
          </button>
        </li>
      </ul>

      {tab === "svc" && (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="stat-card">
                <div className="stat-label">Tổng dịch vụ</div>
                <div className="stat-value">{svcStats.total}</div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="stat-card">
                <div className="stat-label">Đang hoạt động</div>
                <div className="stat-value success">{svcStats.active}</div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="stat-card">
                <div className="stat-label">Dịch vụ chung</div>
                <div className="stat-value">{svcStats.common}</div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="stat-card">
                <div className="stat-label">Dịch vụ cá nhân</div>
                <div className="stat-value">{svcStats.personal}</div>
              </div>
            </div>
          </div>

          <div className="main-panel">
            <div className="main-panel-header">
              <div className="filter-bar mb-0 flex-grow-1">
                <input
                  type="search"
                  className="form-control form-control-sm search-input"
                  placeholder="Tìm theo tên hoặc mô tả…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="btn-group segment-group" role="group">
                  {(
                    [
                      ["all", "Tất cả"],
                      ["common", "Chung"],
                      ["personal", "Cá nhân"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`btn btn-outline-secondary ${segment === val ? "active" : ""}`}
                      onClick={() => setSegment(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={svcLoading} onClick={() => void loadServices()}>
                  {svcLoading ? "Đang tải…" : "Làm mới"}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateDrawer}>
                  + Thêm dịch vụ
                </button>
              </div>
            </div>
            <div className="main-panel-body">
              <div className="table-responsive">
                <table className="table svc-table align-middle">
                  <thead>
                    <tr>
                      <th>Dịch vụ</th>
                      <th style={{ width: 130 }}>Loại</th>
                      <th style={{ width: 140 }}>Giá</th>
                      <th style={{ width: 150 }}>Cách tính</th>
                      <th style={{ width: 110 }}>Trạng thái</th>
                      <th style={{ width: 72 }} className="text-center">
                        Bật
                      </th>
                      <th style={{ width: 72 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {svcLoading && pagedServices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          <span className="spinner-border spinner-border-sm me-2" role="status" />
                          Đang tải…
                        </td>
                      </tr>
                    ) : null}
                    {!svcLoading && pagedServices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          {search ? "Không khớp bộ lọc" : "Chưa có dịch vụ"}
                        </td>
                      </tr>
                    ) : null}
                    {pagedServices.map((s) => (
                      <tr key={s._id}>
                        <td>
                          <div className="svc-name">{s.name}</div>
                          {s.description ? <div className="svc-desc">{s.description}</div> : null}
                        </td>
                        <td>
                          {s.type === "common" ? (
                            <span className="tag tag-geekblue">Chung</span>
                          ) : (
                            <span className="tag tag-purple">Cá nhân</span>
                          )}
                        </td>
                        <td className="fw-semibold">{fmt(s.price)}</td>
                        <td>
                          <span className="tag tag-default">{getUnitLabel(s)}</span>
                        </td>
                        <td>
                          {s.isActive !== false ? (
                            <span className="tag tag-success">Hoạt động</span>
                          ) : (
                            <span className="tag tag-default">Ngừng</span>
                          )}
                        </td>
                        <td className="text-center">
                          <div className="form-check form-switch d-inline-block mb-0">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              role="switch"
                              checked={s.isActive !== false}
                              disabled={toggleId === s._id}
                              title={s.isActive !== false ? "Tạm ngừng cung cấp" : "Kích hoạt lại"}
                              onChange={() => void toggleSvc(s)}
                            />
                          </div>
                        </td>
                        <td>
                          <button type="button" className="btn-link-edit" onClick={() => openEditDrawer(s)}>
                            Sửa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredServices.length > 0 ? (
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
                  <span className="small text-muted">{filteredServices.length} dịch vụ</span>
                  <div className="d-flex align-items-center gap-2">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 88 }}
                      value={svcPageSize}
                      onChange={(e) => {
                        setSvcPageSize(Number(e.target.value));
                        setSvcPage(1);
                      }}
                    >
                      {[10, 20, 50].map((n) => (
                        <option key={n} value={n}>
                          {n}/trang
                        </option>
                      ))}
                    </select>
                    <div className="btn-group btn-group-sm">
                      <button type="button" className="btn btn-outline-secondary" disabled={svcPage <= 1} onClick={() => setSvcPage((p) => p - 1)}>
                        ‹
                      </button>
                      <button type="button" className="btn btn-outline-secondary disabled">
                        {svcPage}/{svcPageCount}
                      </button>
                      <button type="button" className="btn btn-outline-secondary" disabled={svcPage >= svcPageCount} onClick={() => setSvcPage((p) => p + 1)}>
                        ›
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {svcStats.estCommonMonth > 0 && segment !== "personal" ? (
                <span className="hint-text">
                  Gợi ý: tổng dịch vụ chung (trừ mục &quot;Tiền phòng&quot;) ~ <strong>{fmt(svcStats.estCommonMonth)}</strong> / phòng / tháng — cộng vào hóa đơn và chia theo số người ở.
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}

      {tab === "room" && (
        <div className="row">
          <div className="col-md-5 mb-3">
            <div className="sub-panel card border-0">
              <div className="card-header">Gán dịch vụ cho phòng</div>
              <div className="card-body">
                <form onSubmit={submitRoomService}>
                  <div className="mb-2">
                    <label className="form-label">Phòng</label>
                    <select className="form-select form-select-sm" required value={rsForm.room} onChange={(e) => setRsForm({ ...rsForm, room: e.target.value })}>
                      <option value="">—</option>
                      {rooms.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.roomNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Dịch vụ</label>
                    <select className="form-select form-select-sm" required value={rsForm.service} onChange={(e) => setRsForm({ ...rsForm, service: e.target.value })}>
                      <option value="">—</option>
                      {services.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Gán
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-md-7">
            <div className="sub-panel">
            <table className="table table-sm svc-table mb-0">
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Dịch vụ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roomRows.map((r) => (
                  <tr key={r._id}>
                    <td>{rowRoomNumber(r)}</td>
                    <td>{r.service?.name}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => roomServicesApi.remove(r._id).then(() => loadRoomServices())}>
                        Gỡ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {tab === "usage" && (
        <div className="row">
          <div className="col-lg-5 mb-3">
            <div className="sub-panel card border-0 border-primary">
              <div className="card-header d-flex justify-content-between align-items-center">
                <span>Nhập chỉ số (kWh / m³)</span>
                {periodStatus?.billingStatus && (
                  <span className={`badge ${BILLING_STATUS_CLASS[periodStatus.billingStatus]}`}>
                    {meterDisplayStatus(periodStatus.billingStatus, periodStatus.paymentStatus)}
                  </span>
                )}
              </div>
              <div className="card-body">
                {periodLocked && lockMessage && (
                  <div className="alert alert-warning py-2 small mb-3">{lockMessage}</div>
                )}
                <form onSubmit={submitUsage}>
                  <div className="mb-2">
                    <label className="form-label">Phòng</label>
                    <select
                      className="form-select form-select-sm"
                      required
                      disabled={periodLocked}
                      value={usForm.room}
                      onChange={(e) => setUsForm({ ...usForm, room: e.target.value, service: "" })}
                    >
                      <option value="">—</option>
                      {rooms.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.roomNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Dịch vụ đồng hồ</label>
                    <select
                      className="form-select form-select-sm"
                      required
                      disabled={periodLocked}
                      value={usForm.service}
                      onChange={(e) => setUsForm({ ...usForm, service: e.target.value })}
                    >
                      <option value="">—</option>
                      {meterServicesForDropdown.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({s.measureUnit} — {fmt(s.price)}/đơn vị)
                          {assignedMeterIdsForRoom.has(s._id) ? " ✓ đã gán" : ""}
                        </option>
                      ))}
                    </select>
                    {meterServiceHint && <p className="form-text text-warning mb-0 mt-1">{meterServiceHint}</p>}
                    <p className="form-text text-muted mb-0 mt-1">
                      Dịch vụ luôn hiển thị sau khi chốt hóa đơn — chỉ khóa nhập chỉ số.
                    </p>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label">Tháng</label>
                      <input
                        className="form-control form-control-sm"
                        type="number"
                        min={1}
                        max={12}
                        disabled={periodLocked}
                        value={usForm.month}
                        onChange={(e) => setUsForm({ ...usForm, month: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Năm</label>
                      <input
                        className="form-control form-control-sm"
                        type="number"
                        disabled={periodLocked}
                        value={usForm.year}
                        onChange={(e) => setUsForm({ ...usForm, year: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="row g-2 mt-1">
                    <div className="col-6">
                      <label className="form-label">Chỉ số cũ</label>
                      <input
                        className="form-control form-control-sm"
                        required
                        type="number"
                        disabled={periodLocked}
                        value={usForm.oldIndex}
                        onChange={(e) => setUsForm({ ...usForm, oldIndex: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Chỉ số mới</label>
                      <input
                        className="form-control form-control-sm"
                        required
                        type="number"
                        disabled={periodLocked}
                        value={usForm.newIndex}
                        onChange={(e) => setUsForm({ ...usForm, newIndex: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mb-2 mt-2">
                    <label className="form-label">Ghi chú</label>
                    <input
                      className="form-control form-control-sm"
                      disabled={periodLocked}
                      value={usForm.note}
                      onChange={(e) => setUsForm({ ...usForm, note: e.target.value })}
                    />
                  </div>
                  <p className="small text-muted mb-2">Tiền = (mới − cũ) × đơn giá. Chỉ số cũ phải ≥ chỉ số kết tháng trước.</p>
                  <button type="submit" className="btn btn-success btn-sm" disabled={periodLocked || usageLoading}>
                    {periodLocked ? "Đã chốt — không cập nhật" : "Lưu & tính tiền"}
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
              <div>
                <label className="form-label small mb-0">Lọc phòng</label>
                <select
                  className="form-select form-select-sm"
                  value={usageFilter.room}
                  onChange={(e) => setUsageFilter((f) => ({ ...f, room: e.target.value }))}
                >
                  <option value="">Tất cả</option>
                  {rooms.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.roomNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label small mb-0">Tháng</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="—"
                  value={usageFilter.month}
                  onChange={(e) => setUsageFilter((f) => ({ ...f, month: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label small mb-0">Năm</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  placeholder="—"
                  value={usageFilter.year}
                  onChange={(e) => setUsageFilter((f) => ({ ...f, year: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label small mb-0">Chốt kỳ</label>
                <select
                  className="form-select form-select-sm"
                  value={usageFilter.billingStatus}
                  onChange={(e) => setUsageFilter((f) => ({ ...f, billingStatus: e.target.value }))}
                >
                  <option value="">Tất cả</option>
                  <option value="open">Chưa chốt</option>
                  <option value="closed">Đã chốt HĐ</option>
                </select>
              </div>
              <div>
                <label className="form-label small mb-0">Thanh toán</label>
                <select
                  className="form-select form-select-sm"
                  value={usageFilter.paymentStatus}
                  onChange={(e) => setUsageFilter((f) => ({ ...f, paymentStatus: e.target.value }))}
                >
                  <option value="">Tất cả</option>
                  <option value="none">—</option>
                  <option value="unpaid">Chờ TT</option>
                  <option value="paid">Đã TT</option>
                  <option value="overdue">Quá hạn</option>
                </select>
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void loadUsage()}>
                Làm mới
              </button>
            </div>

            <h6 className="mb-2">Lịch sử chỉ số điện / nước</h6>
            {usageLoading && (
              <div className="spinner-border spinner-border-sm text-primary mb-2" role="status" />
            )}
            <div className="sub-panel table-responsive">
              <table className="table table-sm svc-table mb-0">
                <thead>
                  <tr>
                    <th>Phòng</th>
                    <th>Dịch vụ</th>
                    <th>Kỳ</th>
                    <th>CS cũ</th>
                    <th>CS mới</th>
                    <th>Tiêu thụ</th>
                    <th className="text-end">Tiền</th>
                    <th>Chốt kỳ</th>
                    <th>Thanh toán</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsageRows.length === 0 && !usageLoading && (
                    <tr>
                      <td colSpan={9} className="text-center text-muted py-4">
                        Chưa có dữ liệu chỉ số
                      </td>
                    </tr>
                  )}
                  {filteredUsageRows.map((u) => {
                    const bs = (u.billingStatus || "open") as MeterBillingStatus;
                    const ps = (u.paymentStatus || "none") as MeterPaymentStatus;
                    return (
                      <tr key={u._id}>
                        <td>{u.room?.roomNumber}</td>
                        <td>{u.service?.name}</td>
                        <td>
                          {u.month}/{u.year}
                        </td>
                        <td>{u.oldIndex}</td>
                        <td>{u.newIndex}</td>
                        <td>
                          {u.usage} {u.service?.measureUnit || ""}
                        </td>
                        <td className="text-end fw-bold text-primary">{fmt(u.amount)}</td>
                        <td>
                          <span className={`badge ${BILLING_STATUS_CLASS[bs]}`}>{BILLING_STATUS_LABEL[bs]}</span>
                        </td>
                        <td>
                          <span className={`badge ${PAYMENT_STATUS_CLASS[ps]}`}>{PAYMENT_STATUS_LABEL[ps]}</span>
                          {u.bill?.billCode ? (
                            <div className="small text-muted">{u.bill.billCode}</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className={`offcanvas offcanvas-end offcanvas-svc ${drawerOpen ? "show" : ""}`} tabIndex={-1} style={{ visibility: drawerOpen ? "visible" : "hidden" }}>
        <div className="offcanvas-header border-bottom">
          <h5 className="offcanvas-title">{editing ? "Sửa dịch vụ" : "Thêm dịch vụ mới"}</h5>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={closeDrawer} />
        </div>
        <div className="offcanvas-body">
          <form onSubmit={submitService}>
            <div className="mb-3">
              <label className="form-label">Tên dịch vụ</label>
              <input className="form-control" required placeholder="VD: WiFi, Gửi xe, Giặt ủi…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="mb-3">
              <label className="form-label">Loại</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "common" | "personal" })}>
                <option value="common">Dịch vụ chung — giá theo phòng, chia đều số slot (capacity)</option>
                <option value="personal">Dịch vụ cá nhân — sinh viên tự đăng ký</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Giá (VNĐ)</label>
              <input className="form-control" required type="number" min={0} step={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="mb-3">
              <label className="form-label">Kiểu tính</label>
              <select
                className="form-select"
                value={form.billingKind}
                onChange={(e) => applyBillingKind(e.target.value as BillingKind)}
              >
                <option value="monthly_fixed">Cố định theo tháng</option>
                <option value="meter">Theo chỉ số (điện / nước)</option>
                <option value="per_use">Tính theo số lần</option>
              </select>
              {form.billingKind === "per_use" ? (
                <p className="form-text text-muted mb-0 mt-1">
                  Sinh viên nhập số lần sử dụng khi đăng ký; tiền = đơn giá × số lần.
                </p>
              ) : null}
              {form.billingKind === "monthly_fixed" ? (
                <p className="form-text text-muted mb-0 mt-1">Bật/tắt theo tháng; giá cố định mỗi kỳ.</p>
              ) : null}
            </div>
            {form.billingKind === "meter" ? (
              <div className="mb-3">
                <label className="form-label">Loại đồng hồ</label>
                <select
                  className="form-select"
                  value={form.meterMeasure}
                  onChange={(e) => applyBillingKind("meter", e.target.value as "kwh" | "m3")}
                >
                  <option value="kwh">Điện (kWh)</option>
                  <option value="m3">Nước (m³)</option>
                </select>
                <p className="form-text text-muted mb-0 mt-1">Nhập chỉ số ở tab «Chỉ số điện / nước».</p>
              </div>
            ) : null}
            <div className="mb-3">
              <label className="form-label">Mô tả (tuỳ chọn)</label>
              <textarea className="form-control" rows={3} placeholder="Hiển thị cho admin và có thể dùng cho sinh viên hiểu rõ dịch vụ." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-check form-switch mb-4">
              <input className="form-check-input" type="checkbox" id="svcActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              <label className="form-check-label" htmlFor="svcActive">
                Đang cung cấp
              </label>
            </div>
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={svcLoading}>
                {svcLoading ? "Đang lưu…" : editing ? "Lưu" : "Tạo"}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={closeDrawer}>
                Hủy
              </button>
              {editing ? (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-auto"
                  onClick={() => {
                    if (window.confirm("Xóa dịch vụ? Chỉ xóa được khi không còn liên kết.")) {
                      void delSvc(editing._id).then(() => closeDrawer());
                    }
                  }}
                >
                  Xóa
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
      {drawerOpen ? <div className="offcanvas-backdrop fade show" onClick={closeDrawer} aria-hidden /> : null}
    </div>
  );
};

export default ServiceManagementBootstrapPage;
