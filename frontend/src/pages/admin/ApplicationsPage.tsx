/**
 * Trang xét duyệt đơn đăng ký KTX (module Application).
 * Giao diện Bootstrap 5 — phần còn lại của admin dùng Ant Design.
 * Dự án này là React; file Vue mẫu tương đương: `frontend/examples/ApplicationApprovalAdmin.example.vue`.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import { applicationsApi } from "../../api";
import { areasApi } from "../../api";
import type { Area, DormApplication, Room } from "../../types";
import RegistrationsPanel from "./RegistrationsPage";

const statusBadge: Record<string, { cls: string; text: string }> = {
  pending: { cls: "text-bg-warning", text: "Chờ duyệt" },
  approved: { cls: "text-bg-success", text: "Đã duyệt" },
  rejected: { cls: "text-bg-danger", text: "Từ chối" },
};

const priorityLabel: Record<string, string> = {
  none: "Bình thường",
  ho_ngheo: "Hộ nghèo",
  con_thuong_binh: "Con thương binh",
  chinh_sach: "Chính sách",
};

function formatGender(g?: string) {
  const s = String(g || "").toLowerCase();
  if (s === "male" || s.includes("nam")) return "Nam";
  if (s === "female" || s.includes("nữ")) return "Nữ";
  return "Chưa rõ";
}

function studentName(app: DormApplication) {
  const u = app.user;
  if (u && typeof u === "object" && "fullName" in u) return String((u as { fullName?: string }).fullName || "-");
  return "-";
}

function appStudentUser(app: DormApplication) {
  const u = app.user;
  return u && typeof u === "object" ? u : null;
}

function formatApiError(e: unknown): string {
  const ax = e as {
    response?: { data?: { message?: string; errors?: Array<{ msg?: string; message?: string }> } };
    message?: string;
  };
  const d = ax.response?.data;
  if (d?.message) return d.message;
  const fieldErrors = d?.errors;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.map((x) => x.msg || x.message).filter(Boolean).join("; ");
  }
  if (!ax.response) {
    return "Không kết nối được máy chủ. Hãy chạy backend (ví dụ npm run dev trong thư mục backend, port 5000) và đảm bảo frontend gọi được /api.";
  }
  return "Không tải được danh sách";
}

function roomLabel(app: DormApplication) {
  const r = app.assignedRoom;
  if (!r || typeof r !== "object") return "—";
  const num = (r as Room).roomNumber;
  const area = (r as Room).area;
  const areaName = area && typeof area === "object" && "name" in area ? String((area as { name?: string }).name) : "";
  const cap = Number((r as Room).capacity || 0);
  const occ = Number((r as Room).currentOccupancy || 0);
  const vacant = cap > 0 ? Math.max(0, cap - occ) : 0;
  const vacancyLabel = cap > 0 ? `Trống ${vacant}/${cap}` : "";
  const base = areaName ? `${num} (${areaName})` : String(num || "—");
  return vacancyLabel ? `${base} - ${vacancyLabel}` : base;
}

type AdminApplicationsTab = "ktx" | "registrations";

const ApplicationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: AdminApplicationsTab = searchParams.get("tab") === "registrations" ? "registrations" : "ktx";

  const setTab = (t: AdminApplicationsTab) => {
    if (t === "ktx") setSearchParams({}, { replace: true });
    else setSearchParams({ tab: "registrations" }, { replace: true });
  };

  const [rows, setRows] = useState<DormApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [faculty, setFaculty] = useState("");
  const [enrollmentYear, setEnrollmentYear] = useState("");
  const [area, setArea] = useState<string>("");
  const [priorityCategory, setPriorityCategory] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [areas, setAreas] = useState<Array<Pick<Area, "_id" | "name">>>([]);

  const [detail, setDetail] = useState<DormApplication | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [suggest, setSuggest] = useState<{ room: Room; rules: string[] } | null>(null);
  const [datePreset, setDatePreset] = useState<"7d" | "14d" | "month">("14d");
  const [assignModal, setAssignModal] = useState<{ appId: string; rooms: Room[] } | null>(null);
  const [assignRoomId, setAssignRoomId] = useState<string>("");
  const [chosenRoomByAppId, setChosenRoomByAppId] = useState<Record<string, Room | null>>({});
  const [listStats, setListStats] = useState<{ pending: number; approved: number; total: number }>({ pending: 0, approved: 0, total: 0 });

  const presetDays = useCallback((): number => {
    if (datePreset === "7d") return 7;
    if (datePreset === "14d") return 14;
    // month: from start of current month to today (cap 90 to match backend validator)
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
    return Math.max(1, Math.min(90, diffDays));
  }, [datePreset]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const listRes = await applicationsApi.getAll({
        page,
        limit,
        sortOrder,
        ...(status ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(faculty.trim() ? { faculty: faculty.trim() } : {}),
        ...(enrollmentYear.trim() ? { enrollmentYear: Number(enrollmentYear.trim()) } : {}),
        ...(area ? { area } : {}),
        ...(priorityCategory ? { priorityCategory: priorityCategory as "none" | "ho_ngheo" | "con_thuong_binh" | "chinh_sach" } : {}),
        ...(presetDays() ? { days: presetDays() } : {}),
      });
      setRows(listRes.data.applications || []);
      setTotal(listRes.data.total || 0);
      setListStats(listRes.data.stats ?? { pending: 0, approved: 0, total: 0 });
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortOrder, status, search, faculty, enrollmentYear, area, priorityCategory, presetDays]);

  useEffect(() => {
    if (tab === "ktx") load();
  }, [load, tab]);

  useEffect(() => {
    if (tab !== "ktx") return;
    areasApi
      .getAll()
      .then((res) => setAreas((res.data?.areas ?? res.data ?? []) as Array<Pick<Area, "_id" | "name">>))
      .catch(() => setAreas([]));
  }, [tab]);

  const openDetail = async (id: string) => {
    setLoading(true);
    try {
      const { data } = await applicationsApi.getById(id);
      setDetail(data);
    } catch (e: unknown) {
      setErr(formatApiError(e) || "Lỗi tải chi tiết");
    } finally {
      setLoading(false);
    }
  };

  const onApprove = async (id: string) => {
    const chosen = chosenRoomByAppId[id];
    const msg = chosen
      ? `Duyệt đơn và xếp vào phòng ${chosen.roomNumber}?`
      : "Duyệt đơn và tự động phân phòng theo quy tắc hệ thống?";
    if (!window.confirm(msg)) return;
    setLoading(true);
    try {
      await applicationsApi.approve(id, chosen?._id ? { roomId: chosen._id } : undefined);
      setChosenRoomByAppId((m) => ({ ...m, [id]: null }));
      await load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Duyệt thất bại");
    } finally {
      setLoading(false);
    }
  };

  const openAssign = async (id: string) => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await applicationsApi.getCandidateRooms(id);
      const rooms = (data as { rooms?: Room[] })?.rooms || [];
      setAssignRoomId("");
      setAssignModal({ appId: id, rooms });
    } catch (e: unknown) {
      setErr(formatApiError(e) || "Không lấy được danh sách phòng");
    } finally {
      setLoading(false);
    }
  };

  const onChooseRoom = () => {
    if (!assignModal) return;
    if (!assignRoomId) {
      setErr("Vui lòng chọn phòng");
      return;
    }
    const room = assignModal.rooms.find((x) => String(x._id) === String(assignRoomId));
    if (!room) {
      setErr("Không tìm thấy phòng đã chọn");
      return;
    }
    setChosenRoomByAppId((m) => ({ ...m, [assignModal.appId]: room }));
    setAssignModal(null);
    setAssignRoomId("");
  };

  const onRejectSubmit = async () => {
    if (!rejectId) return;
    const note = rejectNote.trim();
    if (!note) {
      setErr("Vui lòng nhập lý do từ chối");
      return;
    }
    setLoading(true);
    try {
      await applicationsApi.reject(rejectId, note);
      setRejectId(null);
      setRejectNote("");
      await load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Từ chối thất bại");
    } finally {
      setLoading(false);
    }
  };

  const loadSuggest = async (id: string) => {
    setLoading(true);
    try {
      const { data } = await applicationsApi.getSuggestedRoom(id);
      setSuggest(data);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không lấy được gợi ý phòng");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="applications-bootstrap container-fluid px-0">
      <h4 className="mb-2">Xét duyệt đơn đăng ký KTX & nội trú</h4>
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${tab === "ktx" ? "active" : ""}`}
            onClick={() => setTab("ktx")}
          >
            Đơn KTX (duyệt + phân phòng)
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${tab === "registrations" ? "active" : ""}`}
            onClick={() => setTab("registrations")}
          >
            Chuyển phòng (chọn phòng)
          </button>
        </li>
      </ul>

      {tab === "registrations" ? (
        <RegistrationsPanel embedded />
      ) : (
        <>
      <div className="row g-2 mb-3">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm text-white" style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)" }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: "rgba(255,255,255,0.85)" }}>Đơn chờ duyệt</div>
              <div className="h5 mb-0 fw-semibold">{listStats.pending} đơn</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body py-3">
              <div className="small text-muted">Đã duyệt</div>
              <div className="h5 mb-0 fw-semibold">{listStats.approved} đơn</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body py-3">
              <div className="small text-muted">Tổng đơn</div>
              <div className="h5 mb-0 fw-semibold">{listStats.total} đơn</div>
            </div>
          </div>
        </div>
      </div>
      <p className="text-muted small mb-3">
        Số liệu trên theo bộ lọc ngày / khoa / khóa / khu / ưu tiên / tên (không áp dụng ô &quot;Trạng thái&quot; bên dưới).
      </p>

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-3">
          <label className="form-label small mb-0">Trạng thái</label>
          <select className="form-select form-select-sm" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">Tất cả</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-0">Lọc theo ngày</label>
          <select
            className="form-select form-select-sm"
            value={datePreset}
            onChange={(e) => {
              setPage(1);
              setDatePreset(e.target.value as "7d" | "14d" | "month");
              load();
            }}
          >
            <option value="7d">7 ngày gần nhất</option>
            <option value="14d">14 ngày gần nhất</option>
            <option value="month">Tháng này</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-0">Đối tượng ưu tiên</label>
          <select
            className="form-select form-select-sm"
            value={priorityCategory}
            onChange={(e) => {
              setPage(1);
              setPriorityCategory(e.target.value);
            }}
          >
            <option value="">Tất cả</option>
            <option value="none">Bình thường</option>
            <option value="ho_ngheo">Hộ nghèo</option>
            <option value="con_thuong_binh">Con thương binh</option>
            <option value="chinh_sach">Chính sách</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-0">Tìm theo tên sinh viên</label>
          <input
            className="form-control form-control-sm"
            placeholder="Họ tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <div className="col-md-2">
          <label className="form-label small mb-0">Sắp xếp ngày</label>
          <select className="form-select form-select-sm" value={sortOrder} onChange={(e) => { setPage(1); setSortOrder(e.target.value as "asc" | "desc"); }}>
            <option value="desc">Mới nhất trước</option>
            <option value="asc">Cũ nhất trước</option>
          </select>
        </div>
        <div className="col-md-2">
          <button type="button" className="btn btn-sm btn-primary w-100" onClick={() => { setPage(1); load(); }}>
            Tìm kiếm
          </button>
        </div>
      </div>

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-3">
          <label className="form-label small mb-0">Lọc theo khóa</label>
          <input
            className="form-control form-control-sm"
            placeholder="VD: IT"
            value={faculty}
            onChange={(e) => {
              setPage(1);
              setFaculty(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-0">Lọc theo Khóa (năm nhập học)</label>
          <input
            className="form-control form-control-sm"
            placeholder="VD: 2026"
            value={enrollmentYear}
            onChange={(e) => {
              setPage(1);
              setEnrollmentYear(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label small mb-0">Lọc theo Dãy nhà (Khu)</label>
          <select
            className="form-select form-select-sm"
            value={area}
            onChange={(e) => {
              setPage(1);
              setArea(e.target.value);
            }}
          >
            <option value="">Tất cả</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary w-100"
            onClick={() => {
              setPage(1);
              setFaculty("");
              setEnrollmentYear("");
              setArea("");
              setPriorityCategory("");
              load();
            }}
          >
            Xóa lọc
          </button>
        </div>
      </div>

      <p className="text-muted small mb-4">
        Phân phòng khi duyệt: cùng giới tính theo khu, còn chỗ, ưu tiên khu nguyện vọng và phòng gần đầy. Admin có thể chọn phòng thủ công trước khi duyệt.
      </p>

      {err && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {err}
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setErr(null)} />
        </div>
      )}

      <div className="position-relative">
        {loading && (
          <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75" style={{ zIndex: 2, minHeight: 120 }}>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-striped table-bordered table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ width: 60 }}>STT</th>
                <th>Tên sinh viên</th>
                <th>MSSV</th>
                <th>Email</th>
                <th>SĐT</th>
                <th>Đối tượng ưu tiên</th>
                <th>Ngày đăng ký</th>
                <th>Giới tính</th>
                <th>Trạng thái</th>
                <th>Phòng</th>
                <th style={{ width: 280 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((app, idx) => {
                const su = appStudentUser(app);
                const st = statusBadge[app.status] || { cls: "text-bg-secondary", text: app.status };
                const created = app.createdAt ? new Date(app.createdAt).toLocaleString("vi-VN") : "—";
                const g = formatGender(app.genderSnapshot);
                const chosen = chosenRoomByAppId[app._id];
                const stt = (page - 1) * limit + idx + 1;
                return (
                  <tr key={app._id}>
                    <td>{stt}</td>
                    <td>{studentName(app)}</td>
                    <td>{su?.studentId?.trim() ? su.studentId : "—"}</td>
                    <td className="text-break">{su?.email?.trim() ? su.email : "—"}</td>
                    <td>{su?.phone?.trim() ? su.phone : "—"}</td>
                    <td>{priorityLabel[String(app.priorityCategory || "none")] || "—"}</td>
                    <td>{created}</td>
                    <td>{g}</td>
                    <td>
                      <span className={`badge rounded-pill ${st.cls}`}>{st.text}</span>
                    </td>
                    <td>
                      {chosen ? (
                        <span className="badge text-bg-info">
                          {chosen.roomNumber}
                          {chosen.area && typeof chosen.area === "object" && "name" in chosen.area
                            ? ` (${String((chosen.area as { name?: string }).name || "")})`
                            : ""}
                          {Number(chosen.capacity || 0) > 0
                            ? ` - Trống ${Math.max(0, Number(chosen.capacity || 0) - Number(chosen.currentOccupancy || 0))}/${Number(chosen.capacity || 0)}`
                            : ""}
                        </span>
                      ) : (
                        roomLabel(app)
                      )}
                    </td>
                    <td>
                      <div className="btn-group btn-group-sm flex-wrap" role="group">
                        <button type="button" className="btn btn-outline-primary" onClick={() => openDetail(app._id)}>
                          Xem
                        </button>
                        {app.status === "pending" && (
                          <>
                            <button type="button" className="btn btn-outline-secondary" onClick={() => loadSuggest(app._id)}>
                              Gợi ý phòng
                            </button>
                            <button type="button" className="btn btn-outline-primary" onClick={() => openAssign(app._id)}>
                              Chọn phòng
                            </button>
                            <button type="button" className="btn btn-success" onClick={() => onApprove(app._id)}>
                              Duyệt
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => setRejectId(app._id)}>
                              Từ chối
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-muted py-4">
                    Không có đơn
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <nav aria-label="Phân trang">
        <ul className="pagination pagination-sm">
          <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
            <button type="button" className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Trước
            </button>
          </li>
          <li className="page-item disabled">
            <span className="page-link">
              Trang {page} / {Math.max(1, Math.ceil(total / limit))} ({total} đơn)
            </span>
          </li>
          <li className={`page-item ${page >= Math.ceil(total / limit) ? "disabled" : ""}`}>
            <button type="button" className="page-link" onClick={() => setPage((p) => p + 1)}>
              Sau
            </button>
          </li>
        </ul>
      </nav>

      {/* Chi tiết */}
      {detail && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết đơn</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setDetail(null)} />
              </div>
              <div className="modal-body">
                <h6>Sinh viên</h6>
                <p className="small">
                  {detail.user && typeof detail.user === "object"
                    ? `${(detail.user as { fullName?: string }).fullName} — ${(detail.user as { email?: string }).email}`
                    : "-"}
                </p>
                <h6>Đơn</h6>
                <ul className="small">
                  <li>Học kỳ: {detail.semester}</li>
                  <li>Năm học: {detail.schoolYear}</li>
                  <li>Ngày bắt đầu: {detail.startDate ? new Date(detail.startDate).toLocaleDateString("vi-VN") : "—"}</li>
                  <li>Nguyện vọng khu: {detail.preferenceArea && typeof detail.preferenceArea === "object" ? (detail.preferenceArea as { name?: string }).name : "Không chọn"}</li>
                  <li>Giới tính (snapshot): {formatGender(detail.genderSnapshot)}</li>
                </ul>
                <h6>Trạng thái</h6>
                <p>
                  <span className={`badge ${statusBadge[detail.status]?.cls || "text-bg-secondary"}`}>{statusBadge[detail.status]?.text}</span>
                </p>
                {detail.assignedRoom && typeof detail.assignedRoom === "object" && (
                  <p className="small">
                    Phòng: {(detail.assignedRoom as Room).roomNumber}
                    {(detail.assignedRoom as Room).area && typeof (detail.assignedRoom as Room).area === "object"
                      ? ` — ${((detail.assignedRoom as Room).area as { name?: string }).name}`
                      : ""}
                  </p>
                )}
                {detail.status === "rejected" && detail.note && (
                  <div className="alert alert-danger small mb-0">
                    <strong>Lý do từ chối:</strong> {detail.note}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Từ chối */}
      {rejectId && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Từ chối đơn</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setRejectId(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Lý do từ chối</label>
                <textarea className="form-control" rows={4} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRejectId(null)}>
                  Hủy
                </button>
                <button type="button" className="btn btn-danger" onClick={onRejectSubmit}>
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gợi ý phòng */}
      {suggest && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Gợi ý phòng (chưa giữ chỗ)</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setSuggest(null)} />
              </div>
              <div className="modal-body">
                <p className="fw-semibold">
                  Phòng {suggest.room.roomNumber}
                  {suggest.room.area && typeof suggest.room.area === "object"
                    ? ` — ${(suggest.room.area as { name?: string }).name}`
                    : ""}
                </p>
                <p className="small text-muted mb-2">Quy tắc áp dụng:</p>
                <ul className="small">
                  {suggest.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSuggest(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Xếp phòng thủ công */}
      {assignModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chọn phòng cho sinh viên</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setAssignModal(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label">Chọn phòng</label>
                <select className="form-select" value={assignRoomId} onChange={(e) => setAssignRoomId(e.target.value)}>
                  <option value="">-- Chọn phòng --</option>
                  {assignModal.rooms.map((r) => {
                    const areaName = r.area && typeof r.area === "object" && "name" in r.area ? String((r.area as { name?: string }).name || "") : "";
                    const occ = `${Number(r.currentOccupancy || 0)}/${Number(r.capacity || 0)}`;
                    return (
                      <option key={r._id} value={r._id}>
                        {r.roomNumber}{areaName ? ` (${areaName})` : ""} — {occ}
                      </option>
                    );
                  })}
                </select>
                {assignModal.rooms.length === 0 && <div className="text-muted small mt-2">Không có phòng phù hợp để chọn.</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAssignModal(null)}>
                  Hủy
                </button>
                <button type="button" className="btn btn-primary" onClick={onChooseRoom} disabled={!assignRoomId}>
                  Chọn phòng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default ApplicationsPage;
