/**
 * Trang xét duyệt đơn đăng ký KTX (module Application).
 * Giao diện Bootstrap 5 — phần còn lại của admin dùng Ant Design.
 * Dự án này là React; file Vue mẫu tương đương: `frontend/examples/ApplicationApprovalAdmin.example.vue`.
 */
import React, { useCallback, useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { applicationsApi } from "../../api";
import type { DormApplication, Room } from "../../types";

const statusBadge: Record<string, { cls: string; text: string }> = {
  pending: { cls: "text-bg-warning", text: "Chờ duyệt" },
  approved: { cls: "text-bg-success", text: "Đã duyệt" },
  rejected: { cls: "text-bg-danger", text: "Từ chối" },
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
  return areaName ? `${num} (${areaName})` : String(num || "—");
}

const ApplicationsPage: React.FC = () => {
  const [rows, setRows] = useState<DormApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<DormApplication | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [suggest, setSuggest] = useState<{ room: Room; rules: string[] } | null>(null);
  const [stats, setStats] = useState<{ date: string; count: number }[]>([]);

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
      });
      setRows(listRes.data.applications || []);
      setTotal(listRes.data.total || 0);
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
    try {
      const statsRes = await applicationsApi.statsByDay({ days: 14 });
      setStats(statsRes.data.series || []);
    } catch {
      setStats([]);
    }
  }, [page, limit, sortOrder, status, search]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!window.confirm("Duyệt đơn và tự động phân phòng theo quy tắc hệ thống?")) return;
    setLoading(true);
    try {
      await applicationsApi.approve(id);
      await load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Duyệt thất bại");
    } finally {
      setLoading(false);
    }
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
      <h4 className="mb-3">Xét duyệt đơn đăng ký KTX</h4>
      <p className="text-muted small mb-4">
        Phân phòng chỉ thực hiện khi duyệt: cùng giới tính theo khu, còn chỗ, ưu tiên khu nguyện vọng và phòng gần đầy.
      </p>

      {err && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {err}
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setErr(null)} />
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">Thống kê đơn theo ngày (14 ngày gần nhất)</div>
        <div className="card-body py-2">
          <div className="d-flex flex-wrap gap-2">
            {stats.length === 0 && <span className="text-muted small">Chưa có dữ liệu</span>}
            {stats.map((s) => (
              <span key={s.date} className="badge text-bg-secondary">
                {s.date}: {s.count}
              </span>
            ))}
          </div>
        </div>
      </div>

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
        <div className="col-md-4">
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
                <th>Tên sinh viên</th>
                <th>Ngày đăng ký</th>
                <th>Giới tính</th>
                <th>Trạng thái</th>
                <th>Phòng</th>
                <th style={{ width: 280 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((app) => {
                const st = statusBadge[app.status] || { cls: "text-bg-secondary", text: app.status };
                const created = app.createdAt ? new Date(app.createdAt).toLocaleString("vi-VN") : "—";
                const g = formatGender(app.genderSnapshot);
                return (
                  <tr key={app._id}>
                    <td>{studentName(app)}</td>
                    <td>{created}</td>
                    <td>{g}</td>
                    <td>
                      <span className={`badge rounded-pill ${st.cls}`}>{st.text}</span>
                    </td>
                    <td>{roomLabel(app)}</td>
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
                  <td colSpan={6} className="text-center text-muted py-4">
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
    </div>
  );
};

export default ApplicationsPage;
