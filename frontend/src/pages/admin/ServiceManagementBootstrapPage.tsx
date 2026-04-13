/**
 * Quản lý dịch vụ KTX (Bootstrap 5): danh mục, gán phòng, nhập chỉ số điện/nước.
 * API: /api/services, /api/room-services, /api/service-usage
 */
import React, { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import { roomsApi, servicesApi, roomServicesApi, serviceUsageApi } from "../../api";
import type { Room } from "../../types";

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
  room?: { roomNumber?: string; _id?: string };
  service?: { name?: string; measureUnit?: string; tariffType?: string; price?: number };
  isActive?: boolean;
};

type UsageRow = {
  _id: string;
  room?: { roomNumber?: string };
  service?: { name?: string; measureUnit?: string };
  month: number;
  year: number;
  oldIndex: number;
  newIndex: number;
  usage: number;
  amount: number;
};

const fmt = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;

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
  const [tab, setTab] = useState<"svc" | "room" | "usage">("svc");
  const [services, setServices] = useState<Svc[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomRows, setRoomRows] = useState<RoomSvcRow[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setErr(null);
    try {
      const res = await serviceUsageApi.list({ limit: 100 });
      setUsageRows((res.data as { items?: UsageRow[] })?.items || []);
    } catch (e) {
      setErr(apiErrMessage(e));
      setUsageRows([]);
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
    if (tab === "usage") void loadUsage();
  }, [tab, loadRoomServices, loadUsage]);

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
        tariffType: form.tariffType,
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
    setLoading(true);
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
    } catch (ex: unknown) {
      setErr((ex as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi nhập chỉ số");
    } finally {
      setLoading(false);
    }
  };

  const variableServices = services.filter((s) => s.tariffType === "variable" && (s.measureUnit === "kwh" || s.measureUnit === "m3"));

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
                      <select className="form-select form-select-sm" value={form.measureUnit} onChange={(e) => setForm({ ...form, measureUnit: e.target.value as "month" | "kwh" | "m3" })}>
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
                    <td>{r.room?.roomNumber}</td>
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
              <div className="card-header">Nhập chỉ số (variable + kWh/m³)</div>
              <div className="card-body">
                <form onSubmit={submitUsage}>
                  <div className="mb-2">
                    <label className="form-label">Phòng</label>
                    <select className="form-select form-select-sm" required value={usForm.room} onChange={(e) => setUsForm({ ...usForm, room: e.target.value })}>
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
                    <select className="form-select form-select-sm" required value={usForm.service} onChange={(e) => setUsForm({ ...usForm, service: e.target.value })}>
                      <option value="">—</option>
                      {variableServices.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({s.measureUnit} — {fmt(s.price)}/đơn vị)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label">Tháng</label>
                      <input className="form-control form-control-sm" type="number" min={1} max={12} value={usForm.month} onChange={(e) => setUsForm({ ...usForm, month: Number(e.target.value) })} />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Năm</label>
                      <input className="form-control form-control-sm" type="number" value={usForm.year} onChange={(e) => setUsForm({ ...usForm, year: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="row g-2 mt-1">
                    <div className="col-6">
                      <label className="form-label">Chỉ số cũ</label>
                      <input className="form-control form-control-sm" required type="number" value={usForm.oldIndex} onChange={(e) => setUsForm({ ...usForm, oldIndex: e.target.value })} />
                    </div>
                    <div className="col-6">
                      <label className="form-label">Chỉ số mới</label>
                      <input className="form-control form-control-sm" required type="number" value={usForm.newIndex} onChange={(e) => setUsForm({ ...usForm, newIndex: e.target.value })} />
                    </div>
                  </div>
                  <div className="mb-2 mt-2">
                    <label className="form-label">Ghi chú</label>
                    <input className="form-control form-control-sm" value={usForm.note} onChange={(e) => setUsForm({ ...usForm, note: e.target.value })} />
                  </div>
                  <p className="small text-muted mb-2">Tiền = (mới − cũ) × đơn giá. Chỉ số cũ phải ≥ chỉ số kết tháng trước.</p>
                  <button type="submit" className="btn btn-success btn-sm">
                    Lưu & tính tiền
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <h6 className="mb-2">Lịch sử nhập</h6>
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead className="table-light">
                  <tr>
                    <th>Phòng</th>
                    <th>DV</th>
                    <th>Kỳ</th>
                    <th>Tiêu thụ</th>
                    <th className="text-end">Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((u) => (
                    <tr key={u._id}>
                      <td>{u.room?.roomNumber}</td>
                      <td>{u.service?.name}</td>
                      <td>
                        {u.month}/{u.year}
                      </td>
                      <td>
                        {u.usage} ({u.oldIndex} → {u.newIndex})
                      </td>
                      <td className="text-end fw-bold text-primary">{fmt(u.amount)}</td>
                    </tr>
                  ))}
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
