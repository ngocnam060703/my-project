/**
 * Quản lý dịch vụ KTX (Bootstrap 5): danh mục, gán phòng, nhập chỉ số điện/nước.
 * API: /api/services, /api/room-services, /api/service-usage
 */
import React, { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
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
    unit: "monthly" as "monthly" | "once",
    measureUnit: "month" as "month" | "kwh" | "m3",
    tariffType: "fixed" as "fixed" | "variable",
    description: "",
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
    const res = await servicesApi.getAll();
    setServices((res.data as Svc[]) || []);
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
    if (!(p > 0)) {
      setErr("Đơn giá phải > 0");
      return;
    }
    setLoading(true);
    try {
      await servicesApi.create({
        name: form.name.trim(),
        type: form.type,
        price: p,
        unit: form.unit,
        measureUnit: form.measureUnit,
        tariffType: form.measureUnit === "kwh" || form.measureUnit === "m3" ? "variable" : form.tariffType,
        description: form.description,
        isActive: true,
      });
      setForm({ name: "", type: "common", price: "", unit: "monthly", measureUnit: "month", tariffType: "fixed", description: "" });
      await loadServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi tạo dịch vụ");
    } finally {
      setLoading(false);
    }
  };

  const toggleSvc = async (id: string) => {
    try {
      await servicesApi.toggle(id);
      await loadServices();
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
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
    <div className="container-fluid px-0">
      <h4 className="mb-3">Quản lý dịch vụ</h4>
      {err && <div className="alert alert-danger">{err}</div>}

      <ul className="nav nav-tabs mb-3">
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

      {loading && tab === "svc" && (
        <div className="spinner-border spinner-border-sm text-primary mb-2" role="status" />
      )}

      {tab === "svc" && (
        <div className="row">
          <div className="col-lg-5 mb-4">
            <div className="card">
              <div className="card-header">Thêm dịch vụ</div>
              <div className="card-body">
                <form onSubmit={submitService}>
                  <div className="mb-2">
                    <label className="form-label">Tên</label>
                    <input className="form-control form-control-sm" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Đơn giá (VNĐ)</label>
                    <input className="form-control form-control-sm" required type="number" min={0.01} step={0.01} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label">Loại SV</label>
                      <select className="form-select form-select-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "common" | "personal" })}>
                        <option value="common">Chung (phòng)</option>
                        <option value="personal">Cá nhân</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label">Đăng ký</label>
                      <select className="form-select form-select-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as "monthly" | "once" })}>
                        <option value="monthly">Theo tháng</option>
                        <option value="once">Một lần</option>
                      </select>
                    </div>
                  </div>
                  <div className="row g-2 mt-1">
                    <div className="col-6">
                      <label className="form-label">Đơn vị đo</label>
                      <select
                        className="form-select form-select-sm"
                        value={form.measureUnit}
                        onChange={(e) => {
                          const measureUnit = e.target.value as "month" | "kwh" | "m3";
                          setForm({
                            ...form,
                            measureUnit,
                            tariffType: measureUnit === "kwh" || measureUnit === "m3" ? "variable" : form.tariffType,
                          });
                        }}
                      >
                        <option value="month">Tháng</option>
                        <option value="kwh">kWh</option>
                        <option value="m3">m³</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label">Kiểu tính</label>
                      <select className="form-select form-select-sm" value={form.tariffType} onChange={(e) => setForm({ ...form, tariffType: e.target.value as "fixed" | "variable" })}>
                        <option value="fixed">Cố định</option>
                        <option value="variable">Theo chỉ số</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-2 mt-2">
                    <label className="form-label">Mô tả</label>
                    <input className="form-control form-control-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Lưu
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead className="table-light">
                  <tr>
                    <th>Tên</th>
                    <th>Giá</th>
                    <th>Đo / Kiểu</th>
                    <th>TT</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s._id}>
                      <td>{s.name}</td>
                      <td className="text-end fw-semibold">{fmt(s.price)}</td>
                      <td className="small">
                        {s.measureUnit || "month"} / {s.tariffType || "fixed"}
                      </td>
                      <td>{s.isActive ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Off</span>}</td>
                      <td>
                        <button type="button" className="btn btn-outline-secondary btn-sm me-1" onClick={() => toggleSvc(s._id)}>
                          Bật/tắt
                        </button>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => delSvc(s._id)}>
                          Xóa
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

      {tab === "room" && (
        <div className="row">
          <div className="col-md-5 mb-3">
            <div className="card">
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
            <table className="table table-sm table-bordered">
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
      )}

      {tab === "usage" && (
        <div className="row">
          <div className="col-lg-5 mb-3">
            <div className="card border-primary">
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
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead className="table-light">
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
    </div>
  );
};

export default ServiceManagementBootstrapPage;
