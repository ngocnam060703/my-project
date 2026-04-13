/**
 * BQL: danh sách khai báo hư hỏng + cập nhật trạng thái (PATCH).
 */
import React, { useCallback, useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { isAxiosError } from "axios";
import { maintenanceReportsAdminApi } from "../../api";
import type { MaintenanceReport, MaintenanceIncidentType, MaintenanceReportStatus } from "../../types";

const INCIDENT_LABEL: Record<MaintenanceIncidentType, string> = {
  electricity: "Điện",
  water: "Nước",
  equipment: "Thiết bị",
  other: "Khác",
};

function statusBadge(st: string): { cls: string; label: string } {
  if (st === "resolved") return { cls: "text-bg-success", label: "Đã sửa xong" };
  if (st === "processing") return { cls: "text-bg-primary", label: "Đang xử lý" };
  return { cls: "text-bg-warning text-dark", label: "Chờ xử lý" };
}

const MaintenanceReportsAdminPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [items, setItems] = useState<MaintenanceReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await maintenanceReportsAdminApi.list({
        status: statusFilter,
        page,
        limit,
      });
      const body = data as { reports?: MaintenanceReport[]; total?: number };
      setItems(body.reports || []);
      setTotal(body.total || 0);
    } catch (e) {
      setErr(isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Lỗi tải" : "Lỗi tải");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = async (id: string, status: MaintenanceReportStatus, adminNote?: string) => {
    setErr(null);
    try {
      await maintenanceReportsAdminApi.patch(id, { status, adminNote });
      await load();
    } catch (e) {
      setErr(isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Cập nhật thất bại" : "Lỗi");
    }
  };

  return (
    <div className="container-fluid py-3">
      <h4 className="mb-3">Khai báo hư hỏng (BQL)</h4>
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <div className="row g-2 mb-3 align-items-end">
        <div className="col-auto">
          <label className="form-label small mb-0">Trạng thái</label>
          <select className="form-select form-select-sm" value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}>
            <option value="all">Tất cả</option>
            <option value="pending">Chờ xử lý</option>
            <option value="processing">Đang xử lý</option>
            <option value="resolved">Đã xong</option>
          </select>
        </div>
        <div className="col-auto small text-muted">Tổng: {total}</div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" />
        </div>
      ) : (
        <div className="table-responsive card shadow-sm">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Thời gian</th>
                <th>Sinh viên</th>
                <th>Phòng</th>
                <th>Loại</th>
                <th>Mô tả</th>
                <th>TT</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const st = statusBadge(r.status);
                const u = typeof r.user === "object" && r.user ? r.user : null;
                const room = typeof r.room === "object" && r.room ? r.room : null;
                const tk = r.incidentType as MaintenanceIncidentType;
                return (
                  <tr key={r._id}>
                    <td className="small text-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                    <td className="small">
                      {u?.fullName || "—"}
                      <br />
                      <span className="text-muted">{u?.studentId}</span>
                    </td>
                    <td>{room?.roomNumber || "—"}</td>
                    <td>{INCIDENT_LABEL[tk] || r.incidentType}</td>
                    <td className="small" style={{ maxWidth: 220 }}>
                      <span className="d-inline-block text-truncate w-100">{r.description}</span>
                    </td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="text-nowrap">
                      {r.status === "pending" && (
                        <button type="button" className="btn btn-sm btn-primary me-1" onClick={() => void patchRow(r._id, "processing")}>
                          Nhận xử lý
                        </button>
                      )}
                      {r.status === "processing" && (
                        <button type="button" className="btn btn-sm btn-success me-1" onClick={() => void patchRow(r._id, "resolved")}>
                          Hoàn thành
                        </button>
                      )}
                      {r.status !== "pending" && r.status !== "resolved" && (
                        <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => void patchRow(r._id, "pending")}>
                          Trả về chờ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    Không có bản ghi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="d-flex justify-content-between align-items-center mt-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </button>
          <span className="small text-muted">
            Trang {page} / {Math.max(1, Math.ceil(total / limit))}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
};

export default MaintenanceReportsAdminPage;
