/**
 * Quản lý hóa đơn & thanh toán (Bootstrap 5).
 * Bổ sung cho trang Bills (Ant Design); dùng chung API /api/bills.
 */
import React, { useCallback, useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { billsApi } from "../../api";
import type { Bill } from "../../types";

function formatMoney(v: number | undefined) {
  return `${(v ?? 0).toLocaleString("vi-VN")}đ`;
}

function canPay(s: string) {
  return s === "unpaid" || s === "pending" || s === "overdue";
}

function statusBadge(s: string) {
  if (s === "paid") return { cls: "text-bg-success", text: "Đã thanh toán" };
  if (s === "overdue") return { cls: "text-bg-danger", text: "Quá hạn" };
  if (s === "unpaid" || s === "pending") return { cls: "text-bg-warning", text: "Chưa thanh toán" };
  return { cls: "text-bg-secondary", text: s };
}

const BillingManagementPage: React.FC = () => {
  const [rows, setRows] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Bill | null>(null);
  const [revenue, setRevenue] = useState<{ year: number; yearTotal: number; byMonth: { _id: number; total: number }[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const y = new Date().getFullYear();
      const [listRes, revRes] = await Promise.all([
        billsApi.getAll({
          page,
          limit: 12,
          ...(status ? { status } : {}),
          ...(month !== "" ? { month } : {}),
          ...(year !== "" ? { year } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          billType: "monthly",
        }),
        billsApi.revenueSummary({ year: year !== "" ? Number(year) : y }).catch(() => ({ data: null })),
      ]);
      setRows((listRes.data as { bills?: Bill[] }).bills || []);
      setTotal((listRes.data as { total?: number }).total || 0);
      setRevenue(revRes.data as typeof revenue);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, [page, status, month, year, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    setLoading(true);
    try {
      const { data } = await billsApi.getById(id);
      setDetail(data as Bill);
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi tải chi tiết");
    } finally {
      setLoading(false);
    }
  };

  const confirmPay = async (id: string) => {
    if (!window.confirm("Xác nhận đã thu tiền (thủ công / quầy)?")) return;
    setLoading(true);
    try {
      await billsApi.patchPay(id, { paymentMethod: "counter", paymentReference: "Thu tại quầy" });
      await load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi thanh toán");
    } finally {
      setLoading(false);
    }
  };

  const runOverdue = async () => {
    setLoading(true);
    try {
      await billsApi.refreshOverdue();
      await load();
    } catch {
      setErr("Không làm mới quá hạn được");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      <h4 className="mb-2">Hóa đơn & thanh toán</h4>
      <p className="text-muted small mb-3">
        Hạn mặc định theo cấu hình backend (BILL_DUE_DAY, mặc định ngày 10). Trạng thái quá hạn được cập nhật khi tải danh sách.
      </p>

      {err && (
        <div className="alert alert-danger alert-dismissible fade show">
          {err}
          <button type="button" className="btn-close float-end" aria-label="close" onClick={() => setErr(null)} />
        </div>
      )}

      {revenue && (
        <div className="card mb-3 border-success">
          <div className="card-header bg-success text-white">Doanh thu đã thu (hóa đơn tháng) — năm {revenue.year}</div>
          <div className="card-body py-2">
            <p className="mb-1 fw-bold fs-5">{formatMoney(revenue.yearTotal)}</p>
            <div className="d-flex flex-wrap gap-1 small">
              {(revenue.byMonth || []).map((m) => (
                <span key={m._id} className="badge text-bg-light text-dark border">
                  T{m._id}: {formatMoney(m.total)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-2">
          <label className="form-label small mb-0">Trạng thái</label>
          <select className="form-select form-select-sm" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">Tất cả</option>
            <option value="unpaid">Chưa TT (unpaid)</option>
            <option value="pending">Chưa TT (legacy)</option>
            <option value="overdue">Quá hạn</option>
            <option value="paid">Đã thanh toán</option>
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label small mb-0">Tháng</label>
          <select className="form-select form-select-sm" value={month} onChange={(e) => { setPage(1); setMonth(e.target.value === "" ? "" : Number(e.target.value)); }}>
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label small mb-0">Năm</label>
          <input
            className="form-control form-control-sm"
            type="number"
            value={year}
            onChange={(e) => { setPage(1); setYear(e.target.value === "" ? "" : Number(e.target.value)); }}
            placeholder="2026"
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-0">Tìm sinh viên</label>
          <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Họ tên..." />
        </div>
        <div className="col-md-3 d-flex gap-2">
          <button type="button" className="btn btn-sm btn-primary flex-grow-1" onClick={() => { setPage(1); load(); }}>
            Tìm
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={runOverdue}>
            Cập nhật quá hạn
          </button>
        </div>
      </div>

      <div className="position-relative">
        {loading && (
          <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75" style={{ zIndex: 2, minHeight: 100 }}>
            <div className="spinner-border text-primary" role="status" />
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-bordered table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>Sinh viên</th>
                <th>Tháng</th>
                <th className="text-end">Số tiền</th>
                <th>Hạn TT</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = statusBadge(r.status);
                const u = r.user as { fullName?: string } | undefined;
                const overdueWarn = r.status === "overdue";
                return (
                  <tr key={r._id} className={overdueWarn ? "table-danger" : undefined}>
                    <td>{u?.fullName || "—"}</td>
                    <td>
                      <strong>
                        {r.month}/{r.year}
                      </strong>
                    </td>
                    <td className="text-end fw-bold text-primary">{formatMoney(r.total)}</td>
                    <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString("vi-VN") : "—"}</td>
                    <td>
                      <span className={`badge rounded-pill ${st.cls}`}>{st.text}</span>
                    </td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-primary" onClick={() => openDetail(r._id)}>
                          Xem
                        </button>
                        {canPay(r.status) && (
                          <button type="button" className="btn btn-success" onClick={() => confirmPay(r._id)}>
                            Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    Không có hóa đơn
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <nav>
        <ul className="pagination pagination-sm">
          <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
            <button type="button" className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Trước
            </button>
          </li>
          <li className="page-item disabled">
            <span className="page-link">
              Trang {page} ({total} hóa đơn)
            </span>
          </li>
          <li className={`page-item ${page * 12 >= total ? "disabled" : ""}`}>
            <button type="button" className="page-link" onClick={() => setPage((p) => p + 1)}>
              Sau
            </button>
          </li>
        </ul>
      </nav>

      {detail && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết hóa đơn</h5>
                <button type="button" className="btn-close" onClick={() => setDetail(null)} aria-label="close" />
              </div>
              <div className="modal-body small">
                <p>
                  <strong>Sinh viên:</strong> {(detail.user as { fullName?: string })?.fullName}
                </p>
                <p>
                  <strong>Hợp đồng:</strong>{" "}
                  {detail.contract && typeof detail.contract === "object"
                    ? (detail.contract as { contractNumber?: string }).contractNumber || String((detail.contract as { _id?: string })._id)
                    : "—"}
                </p>
                <p>
                  <strong>Tổng:</strong> <span className="fs-5 text-primary fw-bold">{formatMoney(detail.amount ?? detail.total)}</span>
                </p>
                <p>
                  <strong>Trạng thái:</strong> <span className={`badge ${statusBadge(detail.status).cls}`}>{statusBadge(detail.status).text}</span>
                </p>
                <h6 className="mt-3">Lịch sử thanh toán / ghi nhận</h6>
                <ul className="list-group list-group-flush">
                  {(detail.paymentHistory || []).length === 0 && <li className="list-group-item text-muted">Chưa có</li>}
                  {(detail.paymentHistory || []).map((h, i) => (
                    <li key={i} className="list-group-item">
                      {(h.at && new Date(h.at).toLocaleString("vi-VN")) || "—"} — {h.action} — {h.method || "-"} — {formatMoney(h.amount)}{" "}
                      {h.note ? `(${h.note})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
                  Đóng
                </button>
                {canPay(detail.status) && (
                  <button type="button" className="btn btn-success" onClick={() => confirmPay(detail._id).then(() => setDetail(null))}>
                    Xác nhận Pay
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingManagementPage;
