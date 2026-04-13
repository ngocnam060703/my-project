/**
 * Sinh viên: hóa đơn & thanh toán (Bootstrap 5) — bổ sung /student/my-bills (Ant Design).
 */
import React, { useEffect, useState } from "react";
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

const StudentBillingPage: React.FC = () => {
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<Bill | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    billsApi
      .getMy()
      .then((res) => setRows((res.data as Bill[]) || []))
      .catch(() => setErr("Không tải được hóa đơn"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const payOnline = async (id: string) => {
    setBusy(id);
    try {
      await billsApi.payOnline(id);
      load();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Thanh toán thất bại");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  const monthly = rows.filter((b) => b.billType !== "penalty");

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <h4 className="mb-3">Hóa đơn của tôi</h4>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="table-responsive">
        <table className="table table-bordered table-sm">
          <thead className="table-light">
            <tr>
              <th>Kỳ</th>
              <th className="text-end">Số tiền</th>
              <th>Hạn</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {monthly.map((r) => {
              const st = statusBadge(r.status);
              return (
                <tr key={r._id} className={r.status === "overdue" ? "table-warning" : undefined}>
                  <td>
                    <strong>
                      {r.month}/{r.year}
                    </strong>
                  </td>
                  <td className="text-end fw-bold text-primary">{formatMoney(r.total)}</td>
                  <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString("vi-VN") : "—"}</td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.text}</span>
                    {r.status === "overdue" && <div className="small text-danger mt-1">Quá hạn thanh toán — vui lòng thanh toán sớm.</div>}
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => billsApi.getById(r._id).then((res) => setDetail(res.data as Bill))}>
                      Xem
                    </button>
                    {canPay(r.status) && (
                      <button type="button" className="btn btn-sm btn-success" disabled={busy === r._id} onClick={() => payOnline(r._id)}>
                        {busy === r._id ? "…" : "Pay online"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {monthly.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  Chưa có hóa đơn
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Hóa đơn {detail.month}/{detail.year}
                </h5>
                <button type="button" className="btn-close" onClick={() => setDetail(null)} />
              </div>
              <div className="modal-body small">
                <p className="fs-4 text-primary fw-bold mb-2">{formatMoney(detail.amount ?? detail.total)}</p>
                <p>Phòng: {(detail.room as { roomNumber?: string })?.roomNumber}</p>
                <h6>Lịch sử</h6>
                <ul>
                  {(detail.paymentHistory || []).map((h, i) => (
                    <li key={i}>
                      {h.action} — {formatMoney(h.amount)} — {h.note}
                    </li>
                  ))}
                </ul>
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
    </div>
  );
};

export default StudentBillingPage;
