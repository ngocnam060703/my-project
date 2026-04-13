/**
 * Module "Vi phạm của tôi" — Bootstrap 5: danh sách, điểm kỷ luật, chi tiết (chỉ xem).
 * API: GET /api/my-violations | /violations/my, GET /violations/:id (sinh viên chỉ bản ghi của mình).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { violationsApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import { useAuth } from "../../contexts/AuthContext";
import type { User, Violation, ViolationResolution } from "../../types";

/** User từ AuthContext (khác nhẹ so với `types.User` — chỉ dùng fallback hiển thị). */
type AuthUserLite = {
  fullName?: string;
  studentId?: string;
  email?: string;
};

type DisciplineStats = {
  schoolYear: string;
  semester: string;
  totalPoints: number;
  warning: { text: string; severity: string; key?: string };
};

function defaultSchoolYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function severityBadge(sev: string): { cls: string; label: string } {
  if (sev === "heavy") return { cls: "text-bg-danger", label: "Nghiêm trọng" };
  if (sev === "medium") return { cls: "text-bg-warning text-dark", label: "Trung bình" };
  return { cls: "text-bg-success", label: "Nhẹ" };
}

function statusBadge(st?: string): { cls: string; label: string } {
  const s = st || "pending";
  if (s === "resolved") return { cls: "text-bg-success", label: "Đã xử lý" };
  return { cls: "text-bg-warning text-dark", label: "Chờ xử lý" };
}

function actionLabel(a?: string): string {
  if (a === "fine") return "Phạt tiền";
  if (a === "expulsion") return "Buộc rời KTX";
  if (a === "warning") return "Nhắc nhở / cảnh cáo";
  return "—";
}

const MyViolationsPage: React.FC = () => {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Violation[]>([]);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [semester, setSemester] = useState("HK1");
  const [stats, setStats] = useState<DisciplineStats | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Violation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      let list: Violation[] = [];
      try {
        const r = await violationsApi.getMyViolations();
        list = Array.isArray(r.data) ? (r.data as Violation[]) : [];
      } catch {
        const r = await violationsApi.getMy();
        list = Array.isArray(r.data) ? (r.data as Violation[]) : [];
      }
      setItems(list);
      try {
        const st = await violationsApi.getMyStats({ schoolYear, semester });
        setStats((st.data as DisciplineStats) || null);
      } catch {
        setStats(null);
      }
    } catch (e) {
      setErr(apiErrorMessage(e, "Không tải được dữ liệu"));
      setItems([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [schoolYear, semester]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await violationsApi.getById(id);
      setDetail(data as Violation);
    } catch (e) {
      setErr(apiErrorMessage(e, "Không tải được dữ liệu"));
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setDetailLoading(false);
  };

  const heavyCount = useMemo(() => items.filter((v) => v.severity === "heavy").length, [items]);
  const hasImmediate = useMemo(() => items.some((v) => v.immediateExpulsion), [items]);
  const pendingViolationCount = useMemo(() => items.filter((v) => (v.status || "pending") === "pending").length, [items]);

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="container pb-5" style={{ maxWidth: 1040 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h4 className="mb-1">Vi phạm của tôi</h4>
          <p className="text-muted small mb-0">
            Theo dõi vi phạm kỷ luật, trạng thái xử lý và điểm tích lũy theo học kỳ. Bạn chỉ xem được dữ liệu của chính mình.
          </p>
        </div>
      </div>

      {err && <div className="alert alert-danger py-2">{err}</div>}

      {(heavyCount > 0 || hasImmediate) && (
        <div className="alert alert-danger border-danger">
          <strong>Cảnh báo:</strong>{" "}
          {hasImmediate
            ? "Có vi phạm được đánh dấu xử lý nghiêm (có thể liên quan buộc rời KTX). Liên hệ ban quản lý."
            : `Bạn có ${heavyCount} vi phạm mức nghiêm trọng. Hãy chấn chỉnh hành vi và làm việc với BQL KTX.`}
        </div>
      )}

      {items.length >= 3 && heavyCount === 0 && (
        <div className="alert alert-warning small">Bạn đã có nhiều lần vi phạm được ghi nhận — hãy tuân thủ nội quy để tránh tích lũy điểm kỷ luật.</div>
      )}

      <div className="card shadow-sm mb-3">
        <div className="card-body row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label small mb-0">Năm học</label>
            <input className="form-control form-control-sm" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} placeholder="2025-2026" />
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-0">Học kỳ</label>
            <select className="form-select form-select-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
              <option value="HK1">HK1</option>
              <option value="HK2">HK2</option>
              <option value="HK3">HK3</option>
            </select>
          </div>
          <div className="col-md-5 text-md-end small text-muted">Điểm &amp; mức cảnh báo tính theo năm học / học kỳ đã chọn.</div>
        </div>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-sm-6 col-md-4">
          <div className="card h-100 border-secondary">
            <div className="card-body py-2">
              <div className="text-muted small">Chờ xử lý</div>
              <div className="fs-5 fw-semibold text-warning">{pendingViolationCount}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-md-4">
          <div className="card h-100 border-secondary">
            <div className="card-body py-2">
              <div className="text-muted small">Tổng vi phạm (đã ghi)</div>
              <div className="fs-5 fw-semibold">{items.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card h-100 border-secondary">
            <div className="card-body py-2">
              <div className="text-muted small">Điểm kỷ luật (kỳ đã chọn)</div>
              <div className="fs-5 fw-semibold text-primary">{stats?.totalPoints ?? "—"}</div>
              <div className="small fw-semibold text-muted mt-1">{stats?.warning?.text || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {stats && stats.totalPoints >= 5 && (
        <div className={`alert ${stats.totalPoints >= 7 ? "alert-danger" : "alert-warning"} small`}>
          {stats.totalPoints >= 7
            ? "Bạn đạt ngưỡng 7 điểm — BQL KTX có thể xử lý theo quy định (kể cả chấm dứt hợp đồng)."
            : `Bạn đang có ${stats.totalPoints} điểm. Từ 7 điểm có thể bị buộc rời KTX theo quy định.`}
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Danh sách vi phạm</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Ngày ghi nhận</th>
                <th>Loại vi phạm</th>
                <th>Mức độ</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const sev = severityBadge(r.severity);
                const st = statusBadge(r.status);
                return (
                  <tr key={r._id} className={r.severity === "heavy" ? "table-danger" : undefined}>
                    <td className="small">{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                    <td>{r.ruleName || (typeof r.rule === "object" && r.rule ? (r.rule as { name?: string }).name : "—")}</td>
                    <td>
                      <span className={`badge ${sev.cls}`}>{sev.label}</span>
                    </td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="text-end">
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void openDetail(r._id)}>
                        Xem
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Chưa có vi phạm được ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(detailId || detailLoading) && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết vi phạm</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={closeDetail} />
              </div>
              <div className="modal-body">
                {detailLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                )}
                {!detailLoading && detail && <ViolationDetailBody v={detail} authUser={authUser as AuthUserLite | null} />}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeDetail}>
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

function ViolationDetailBody({ v, authUser }: { v: Violation; authUser: AuthUserLite | null }) {
  const student = typeof v.user === "object" && v.user ? (v.user as User) : null;
  const room = typeof v.room === "object" && v.room ? v.room : null;
  const area = room?.area && typeof room.area === "object" ? (room.area as { name?: string }).name : "";
  const st = statusBadge(v.status);
  const sev = severityBadge(v.severity);
  const res = v.resolution as ViolationResolution | null | undefined;

  return (
    <div className="small">
      <h6 className="text-muted text-uppercase">Sinh viên</h6>
      <ul className="list-unstyled mb-3">
        <li>
          <strong>Họ tên:</strong> {student?.fullName || authUser?.fullName || "—"}
        </li>
        <li>
          <strong>Mã SV:</strong> {student?.studentId || authUser?.studentId || "—"}
        </li>
        <li>
          <strong>Email:</strong> {student?.email || authUser?.email || "—"}
        </li>
      </ul>

      <h6 className="text-muted text-uppercase">Phòng & kỳ</h6>
      <ul className="list-unstyled mb-3">
        <li>
          <strong>Phòng:</strong> {room?.roomNumber || "—"}
          {area ? ` — ${area}` : ""}
        </li>
        <li>
          <strong>Học kỳ / năm:</strong> {v.semester} / {v.schoolYear}
        </li>
      </ul>

      <h6 className="text-muted text-uppercase">Nội dung vi phạm</h6>
      <p>
        <strong>Loại:</strong> {v.ruleName || "—"}
      </p>
      <p>
        <strong>Mô tả:</strong> {v.description?.trim() ? v.description : "—"}
      </p>
      <p className="mb-2">
        <strong>Mức độ:</strong> <span className={`badge ${sev.cls}`}>{sev.label}</span>
        {v.immediateExpulsion && <span className="badge text-bg-danger ms-1">Xử lý nghiêm</span>}
      </p>
      <p>
        <strong>Điểm trừ (ghi nhận):</strong> {v.points ?? 0}
      </p>
      <p>
        <strong>Phạt / bồi thường (ghi nhận):</strong> {(v.fineAmount || 0).toLocaleString("vi-VN")}đ /{" "}
        {(v.compensationAmount || 0).toLocaleString("vi-VN")}đ
      </p>

      <h6 className="text-muted text-uppercase mt-3">Trạng thái & xử lý</h6>
      <p>
        <strong>Trạng thái:</strong> <span className={`badge ${st.cls}`}>{st.label}</span>
      </p>
      {res ? (
        <>
          <p>
            <strong>Hình thức xử lý:</strong> {actionLabel(res.actionType)}
          </p>
          {res.penaltyAmount != null && res.penaltyAmount > 0 && (
            <p>
              <strong>Số tiền phạt (quyết định):</strong> {res.penaltyAmount.toLocaleString("vi-VN")}đ
            </p>
          )}
          <p>
            <strong>Ghi chú từ BQL:</strong> {res.note?.trim() ? res.note : "—"}
          </p>
          <p className="text-muted mb-0">
            <small>
              Xử lý lúc: {res.resolvedAt ? new Date(res.resolvedAt).toLocaleString("vi-VN") : "—"}
            </small>
          </p>
        </>
      ) : (
        <p className="text-muted mb-0">Chưa có quyết định kỷ luật chính thức.</p>
      )}
    </div>
  );
}

export default MyViolationsPage;
