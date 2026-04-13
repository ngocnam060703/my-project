/**
 * Module "Đơn của tôi" — sinh viên tạo / theo dõi / hủy đơn đăng ký KTX (Bootstrap 5).
 * Backend: GET /api/my-applications | GET /api/applications/my, POST /api/applications,
 * GET /api/applications/:id, DELETE /api/applications/:id (chỉ pending + đúng chủ).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { isAxiosError } from "axios";
import { applicationsApi, areasApi, contractsApi, registrationPeriodsApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import type { Area, Contract, DormApplication, User } from "../../types";
import { isSchoolYearNotPast, schoolYearValidationMessage } from "../../utils/schoolYear";

function defaultSchoolYear(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function genderLabel(g?: string): string {
  const x = String(g || "").toLowerCase();
  if (x === "male" || x === "nam" || x === "m") return "Nam";
  if (x === "female" || x === "nữ" || x === "nu" || x === "f") return "Nữ";
  return "Chưa khai báo — vui lòng cập nhật Hồ sơ trước khi gửi đơn";
}

function roomDisplay(a: DormApplication): string {
  const r = a.assignedRoom;
  if (!r || typeof r !== "object") return "—";
  const areaName =
    r.area && typeof r.area === "object" && "name" in r.area ? String((r.area as { name?: string }).name || "") : "";
  const num = r.roomNumber || "";
  return areaName ? `${num} — ${areaName}` : num || "—";
}

function errText(e: unknown): string {
  if (isAxiosError(e)) {
    const st = e.response?.status;
    if (st === 401) return "Phiên đăng nhập hết hạn — vui lòng đăng nhập lại.";
    if (st === 404) return "API không tồn tại (404). Hãy khởi động lại backend bản mới nhất.";
    const m = (e.response?.data as { message?: string } | undefined)?.message;
    if (m) return m;
  }
  return "Có lỗi xảy ra";
}

const StudentApplicationsPage: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [mine, setMine] = useState<DormApplication[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "danger" | "info" | "warning"; text: string } | null>(null);
  const [activePeriod, setActivePeriod] = useState<unknown>(undefined);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detail, setDetail] = useState<DormApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [semester, setSemester] = useState("HK1");
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [startDate, setStartDate] = useState("");
  const [preferenceArea, setPreferenceArea] = useState("");

  const pending = useMemo(() => mine.find((a) => a.status === "pending"), [mine]);

  const hasActiveResidence = useMemo(
    () =>
      contracts.some((c) => {
        const st = String(c.status || "").toLowerCase();
        return st === "active" || st === "pending_payment";
      }),
    [contracts]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setAlert(null);
    try {
      /** Ưu tiên alias /my-applications; backend cũ không có route → fallback /applications/my */
      let mineList: DormApplication[] = [];
      try {
        const mineRes = await applicationsApi.getMyApplications();
        mineList = Array.isArray(mineRes.data) ? mineRes.data : [];
      } catch {
        const mineRes = await applicationsApi.getMine();
        mineList = Array.isArray(mineRes.data) ? mineRes.data : [];
      }
      const [areasRes, periodRes, ctrRes] = await Promise.all([
        areasApi.getAll().catch(() => ({ data: { areas: [] as Area[] } })),
        registrationPeriodsApi.getActive().catch(() => ({ data: null })),
        contractsApi.getMy().catch(() => ({ data: [] })),
      ]);
      setMine(mineList);
      setAreas((areasRes.data as { areas?: Area[] })?.areas || []);
      setActivePeriod(periodRes.data ?? null);
      setContracts(Array.isArray(ctrRes.data) ? ctrRes.data : []);
    } catch (e) {
      setAlert({ type: "danger", text: errText(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** Realtime: admin duyệt / từ chối → cập nhật danh sách (thông báo toast dùng SocketContext + Antd). */
  useEffect(() => {
    if (!socket || !user) return;
    const uid = String((user as { _id?: string })._id || (user as { id?: string }).id || "");
    if (!uid) return;
    const onUpd = (payload: { userId?: string }) => {
      if (payload.userId === uid) void loadAll();
    };
    socket.on("application:approved", onUpd);
    socket.on("application:rejected", onUpd);
    return () => {
      socket.off("application:approved", onUpd);
      socket.off("application:rejected", onUpd);
    };
  }, [socket, user, loadAll]);

  const openDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await applicationsApi.getById(id);
      setDetail(data);
    } catch (e) {
      setAlert({ type: "danger", text: errText(e) });
    } finally {
      setDetailLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);
    if (!startDate) {
      setAlert({ type: "danger", text: "Chọn ngày bắt đầu" });
      return;
    }
    if (!isSchoolYearNotPast(schoolYear)) {
      setAlert({ type: "danger", text: schoolYearValidationMessage });
      return;
    }
    setSubmitting(true);
    try {
      await applicationsApi.create({
        semester,
        schoolYear,
        startDate,
        ...(preferenceArea ? { preferenceArea } : {}),
      });
      setAlert({ type: "success", text: "Đã gửi đơn. Trạng thái: chờ duyệt." });
      setShowCreateModal(false);
      setPreferenceArea("");
      setStartDate("");
      await loadAll();
    } catch (e) {
      setAlert({ type: "danger", text: errText(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelApp = async (id: string) => {
    if (!window.confirm("Bạn có chắc muốn hủy đơn đang chờ duyệt? Hành động này không thể hoàn tác.")) return;
    setAlert(null);
    try {
      await applicationsApi.cancel(id);
      setAlert({ type: "success", text: "Đã hủy đơn." });
      if (detail?._id === id) setDetail(null);
      await loadAll();
    } catch (e) {
      setAlert({ type: "danger", text: errText(e) });
    }
  };

  const canOpenCreate = !pending && !hasActiveResidence;

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status" />
        <p className="text-muted small mt-2">Đang tải đơn của bạn…</p>
      </div>
    );
  }

  return (
    <div className="container pb-5" style={{ maxWidth: 1040 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 className="mb-0">Đơn của tôi</h4>
          <p className="text-muted small mb-0">Đăng ký KTX — chờ ban quản lý duyệt, phân phòng sau khi duyệt.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canOpenCreate}
          onClick={() => {
            setAlert(null);
            setShowCreateModal(true);
          }}
        >
          + Tạo đơn
        </button>
      </div>

      {alert && (
        <div
          className={`alert alert-${alert.type === "success" ? "success" : alert.type === "info" ? "info" : alert.type === "warning" ? "warning" : "danger"}`}
        >
          {alert.text}
        </div>
      )}

      {!canOpenCreate && (
        <div className="alert alert-info small">
          {pending && <span>Bạn đã có đơn đang chờ duyệt — không thể gửi thêm. Có thể hủy đơn chờ nếu cần.</span>}
          {!pending && hasActiveResidence && (
            <span>Bạn đang có hợp đồng KTX hiệu lực (hoặc chờ thanh toán) — không gửi đơn đăng ký mới.</span>
          )}
        </div>
      )}

      {activePeriod === null && (
        <div className="alert alert-warning small">
          Không có đợt đăng ký nào đang mở. Nếu ban quản lý đã bật đợt đăng ký, bạn chỉ gửi đơn khi đợt mở; nếu chưa cấu hình đợt, backend vẫn có thể chấp nhận đơn.
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Danh sách đơn</div>
        <div className="table-responsive">
          <table className="table table-hover table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Ngày đăng ký</th>
                <th>Trạng thái</th>
                <th>Phòng được phân</th>
                <th>Ghi chú</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((a) => (
                <tr key={a._id}>
                  <td>{a.createdAt ? new Date(a.createdAt).toLocaleString("vi-VN") : "—"}</td>
                  <td>
                    {a.status === "pending" && <span className="badge text-bg-warning">Chờ duyệt</span>}
                    {a.status === "approved" && <span className="badge text-bg-success">Đã duyệt</span>}
                    {a.status === "rejected" && <span className="badge text-bg-danger">Từ chối</span>}
                  </td>
                  <td>{roomDisplay(a)}</td>
                  <td className="small text-muted">{a.status === "rejected" ? a.note || "—" : "—"}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-outline-primary btn-sm me-1" onClick={() => void openDetail(a._id)}>
                      Xem
                    </button>
                    {a.status === "pending" && (
                      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void cancelApp(a._id)}>
                        Hủy đơn
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {mine.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-5">
                    Chưa có đơn nào. Nhấn &quot;Tạo đơn&quot; để gửi đăng ký KTX.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: tạo đơn */}
      {showCreateModal && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Tạo đơn đăng ký KTX</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setShowCreateModal(false)} />
              </div>
              <form onSubmit={submit}>
                <div className="modal-body">
                  <p className="small text-muted">
                    Sau khi gửi, đơn ở trạng thái <strong>Chờ duyệt</strong>. Bạn không chỉnh sửa được nội dung đơn; chỉ có thể{" "}
                    <strong>hủy</strong> khi vẫn đang chờ.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Giới tính (theo hồ sơ)</label>
                    <input className="form-control" readOnly value={genderLabel(user?.gender)} />
                    <div className="form-text">Hệ thống dùng giới tính trong tài khoản để xét khu / phòng. Cập nhật tại trang Hồ sơ nếu sai.</div>
                  </div>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label">Học kỳ</label>
                      <select className="form-select" value={semester} onChange={(e) => setSemester(e.target.value)} required>
                        <option value="HK1">HK1</option>
                        <option value="HK2">HK2</option>
                        <option value="HK3">HK3</option>
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Năm học</label>
                      <input className="form-control" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} placeholder="2026-2027" required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Ngày bắt đầu</label>
                      <input className="form-control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label">Nguyện vọng khu (tuỳ chọn)</label>
                      <select className="form-select" value={preferenceArea} onChange={(e) => setPreferenceArea(e.target.value)}>
                        <option value="">— Không chọn —</option>
                        {areas.map((ar) => (
                          <option key={ar._id} value={ar._id}>
                            {ar.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Đóng
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Đang gửi…" : "Gửi đơn"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: chi tiết */}
      {(detail || detailLoading) && (
        <div className="modal fade show d-block" tabIndex={-1} role="dialog" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết đơn</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Đóng"
                  onClick={() => {
                    setDetail(null);
                    setDetailLoading(false);
                  }}
                />
              </div>
              <div className="modal-body">
                {detailLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                )}
                {!detailLoading && detail && <DetailBody app={detail} onCancelPending={() => void cancelApp(detail._id)} />}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDetail(null);
                    setDetailLoading(false);
                  }}
                >
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

/** Nội dung modal chi tiết — tách nhỏ để đọc dễ */
function DetailBody({ app, onCancelPending }: { app: DormApplication; onCancelPending: () => void }) {
  const u = app.user as User | string | undefined;
  const student =
    u && typeof u === "object"
      ? u
      : ({ fullName: "—", email: "", studentId: "", phone: "", gender: "" } as User);

  return (
    <div>
      <h6 className="text-muted text-uppercase small">Thông tin sinh viên</h6>
      <ul className="list-unstyled small mb-4">
        <li>
          <strong>Họ tên:</strong> {student.fullName || "—"}
        </li>
        <li>
          <strong>Mã SV:</strong> {student.studentId || "—"}
        </li>
        <li>
          <strong>Email:</strong> {student.email || "—"}
        </li>
        <li>
          <strong>SĐT:</strong> {student.phone || "—"}
        </li>
        <li>
          <strong>Giới tính (snapshot đơn):</strong> {app.genderSnapshot === "male" ? "Nam" : app.genderSnapshot === "female" ? "Nữ" : "Chưa rõ"}
        </li>
      </ul>
      <h6 className="text-muted text-uppercase small">Đơn đăng ký</h6>
      <ul className="list-unstyled small mb-0">
        <li>
          <strong>Ngày gửi:</strong> {app.createdAt ? new Date(app.createdAt).toLocaleString("vi-VN") : "—"}
        </li>
        <li>
          <strong>Trạng thái:</strong>{" "}
          {app.status === "pending" && <span className="badge text-bg-warning">Chờ duyệt</span>}
          {app.status === "approved" && <span className="badge text-bg-success">Đã duyệt</span>}
          {app.status === "rejected" && <span className="badge text-bg-danger">Từ chối</span>}
        </li>
        <li>
          <strong>Học kỳ / năm học:</strong> {app.semester} — {app.schoolYear}
        </li>
        <li>
          <strong>Ngày bắt đầu dự kiến:</strong> {app.startDate ? new Date(app.startDate).toLocaleDateString("vi-VN") : "—"}
        </li>
        <li>
          <strong>Nguyện vọng khu:</strong>{" "}
          {app.preferenceArea && typeof app.preferenceArea === "object" ? (app.preferenceArea as Area).name : "Không chọn"}
        </li>
        <li>
          <strong>Phòng được phân:</strong> {roomDisplay(app)}
        </li>
        {app.status === "rejected" && (
          <li className="mt-2">
            <strong>Lý do từ chối:</strong> <span className="text-danger">{app.note || "—"}</span>
          </li>
        )}
        {app.linkedContract && typeof app.linkedContract === "object" && (
          <li className="mt-2">
            <strong>Hợp đồng liên kết:</strong>{" "}
            {(app.linkedContract as Contract).contractNumber || (app.linkedContract as Contract)._id}
            {` (${(app.linkedContract as Contract).status || ""})`}
          </li>
        )}
      </ul>
      {app.status === "pending" && (
        <div className="mt-3 pt-3 border-top">
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={onCancelPending}>
            Hủy đơn này
          </button>
        </div>
      )}
    </div>
  );
}

export default StudentApplicationsPage;
