/**
 * Module "Hóa đơn của tôi" — Bootstrap 5: danh sách, chi tiết, thanh toán (demo / online mô phỏng).
 * API: GET /api/my-bills | GET /api/bills/my, GET /api/bills/:id, PATCH /api/bills/:id/pay, PUT pay-online
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { isAxiosError } from "axios";
import { billsApi, paymentApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import type { Bill } from "../../types";

function fmtMoney(v: number | undefined): string {
  return `${Math.round(v ?? 0).toLocaleString("vi-VN")}đ`;
}

function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN");
}

function billPeriodLabel(b: Bill): string {
  return `${b.month}/${b.year}`;
}

function statusUi(s: string): { cls: string; label: string } {
  if (s === "paid") return { cls: "text-bg-success", label: "Đã thanh toán" };
  if (s === "overdue") return { cls: "text-bg-danger", label: "Quá hạn" };
  if (s === "unpaid" || s === "pending") return { cls: "text-bg-warning text-dark", label: "Chưa thanh toán" };
  return { cls: "text-bg-secondary", label: s };
}

function canPay(s: string): boolean {
  return s === "unpaid" || s === "pending" || s === "overdue";
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

/** Thanh toán VNPay sandbox/production — redirect sang cổng sau khi máy chủ trả paymentUrl. */
async function handlePayment(invoiceId: string, amount: number, returnPath?: string) {
  const res = await paymentApi.createVnpay({
    invoiceId,
    amount: Math.round(Number(amount)),
    ...(returnPath ? { returnPath } : {}),
  });
  const paymentUrl = (res.data as { paymentUrl?: string })?.paymentUrl;
  if (!paymentUrl) throw new Error("Không nhận được paymentUrl");
  window.location.href = paymentUrl;
}

const MyBillsPage: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Bill | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payingOnlineId, setPayingOnlineId] = useState<string | null>(null);
  const [payingVnpayId, setPayingVnpayId] = useState<string | null>(null);
  const [vnpayBanner, setVnpayBanner] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      /** Ưu tiên /my-bills; backend cũ → GET /bills/my */
      let list: Bill[] = [];
      try {
        const { data } = await billsApi.getMyBills();
        list = Array.isArray(data) ? data : [];
      } catch {
        const { data } = await billsApi.getMy();
        list = Array.isArray(data) ? data : [];
      }
      setRows(list);
    } catch (e) {
      setErr(errText(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("vnpay");
    if (!v) return;
    const labels: Record<string, { kind: "ok" | "bad"; text: string }> = {
      success: { kind: "ok", text: "Thanh toán VNPay thành công." },
      failed: { kind: "bad", text: "Thanh toán VNPay chưa hoàn tất hoặc bị từ chối." },
      invalid: { kind: "bad", text: "Phản hồi VNPay không hợp lệ (chữ ký)." },
      not_found: { kind: "bad", text: "Không tìm thấy hóa đơn tương ứng." },
      amount_mismatch: { kind: "bad", text: "Số tiền không khớp hóa đơn." },
      already_paid: { kind: "ok", text: "Hóa đơn đã được thanh toán trước đó." },
      config_error: { kind: "bad", text: "Cấu hình VNPay trên máy chủ chưa đủ." },
      server_error: { kind: "bad", text: "Lỗi máy chủ khi xử lý callback VNPay." },
    };
    setVnpayBanner(labels[v] || { kind: "bad", text: `Kết quả VNPay: ${v}` });
    sp.delete("vnpay");
    sp.delete("invoiceId");
    sp.delete("code");
    const rest = sp.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket || !user) return;
    const uid = String((user as { _id?: string })._id || (user as { id?: string }).id || "");
    const onMine = (data: { userId?: string }) => {
      if (data.userId === uid) void load();
    };
    socket.on("bill:new", onMine);
    socket.on("bill:paid", onMine);
    return () => {
      socket.off("bill:new", onMine);
      socket.off("bill:paid", onMine);
    };
  }, [socket, user, load]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await billsApi.getById(id);
      setDetail(data);
    } catch (e) {
      setErr(errText(e));
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

  const payDemo = async (id: string) => {
    setPayingId(id);
    setErr(null);
    try {
      await billsApi.patchPay(id);
      await load();
      if (detailId === id) await openDetail(id);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setPayingId(null);
    }
  };

  const payOnlineDemo = async (id: string) => {
    setPayingOnlineId(id);
    setErr(null);
    try {
      await billsApi.payOnline(id);
      await load();
      if (detailId === id) await openDetail(id);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setPayingOnlineId(null);
    }
  };

  const payVnpay = async (id: string, amount: number) => {
    setPayingVnpayId(id);
    setErr(null);
    try {
      await handlePayment(id, amount, "/student/my-bills");
    } catch (e) {
      setErr(errText(e));
      setPayingVnpayId(null);
    }
  };

  const monthly = useMemo(() => rows.filter((b) => b.billType !== "penalty"), [rows]);
  const penalty = useMemo(() => rows.filter((b) => b.billType === "penalty"), [rows]);
  const overdueList = useMemo(() => rows.filter((b) => b.status === "overdue"), [rows]);
  const unpaidTotal = useMemo(
    () => rows.filter((b) => canPay(b.status)).reduce((s, b) => s + (b.total || 0), 0),
    [rows]
  );

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="container pb-5" style={{ maxWidth: 1100 }}>
      <h4 className="mb-1">Hóa đơn của tôi</h4>
      <p className="text-muted small mb-3">Theo dõi hạn thanh toán, trạng thái và thanh toán (VNPay / xác nhận demo / online mô phỏng).</p>

      {vnpayBanner && (
        <div className={`alert py-2 ${vnpayBanner.kind === "ok" ? "alert-success" : "alert-danger"}`}>
          {vnpayBanner.text}
        </div>
      )}

      {err && <div className="alert alert-danger py-2">{err}</div>}

      {overdueList.length > 0 && (
        <div className="alert alert-danger d-flex align-items-start gap-2" role="alert">
          <span className="fw-bold">Cảnh báo:</span>
          <span>
            Bạn có {overdueList.length} hóa đơn quá hạn. Vui lòng thanh toán sớm để tránh ảnh hưởng hồ sơ nội trú.
          </span>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card border-warning h-100">
            <div className="card-body">
              <div className="text-muted small">Tổng tiền chưa thanh toán</div>
              <div className="fs-3 fw-bold text-warning">{fmtMoney(unpaidTotal)}</div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small">Số hóa đơn chưa trả / quá hạn</div>
              <div className="fs-4 fw-semibold">{rows.filter((b) => canPay(b.status)).length}</div>
            </div>
          </div>
        </div>
      </div>

      {penalty.length > 0 && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold text-danger">Hóa đơn phạt / vi phạm</div>
          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Kỳ / loại</th>
                  <th className="text-end">Số tiền</th>
                  <th>Hạn thanh toán</th>
                  <th>Trạng thái</th>
                  <th className="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {penalty.map((b) => (
                  <BillRow
                    key={b._id}
                    b={b}
                    onView={() => void openDetail(b._id)}
                    onPay={() => void payDemo(b._id)}
                    onPayOnline={() => void payOnlineDemo(b._id)}
                    onPayVnpay={() => void payVnpay(b._id, b.total)}
                    paying={payingId === b._id}
                    payingOnline={payingOnlineId === b._id}
                    payingVnpay={payingVnpayId === b._id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Hóa đơn tháng</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Tháng</th>
                <th className="text-end">Số tiền</th>
                <th>Hạn thanh toán</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((b) => (
                <BillRow
                  key={b._id}
                  b={b}
                  onView={() => void openDetail(b._id)}
                  onPay={() => void payDemo(b._id)}
                  onPayOnline={() => void payOnlineDemo(b._id)}
                  onPayVnpay={() => void payVnpay(b._id, b.total)}
                  paying={payingId === b._id}
                  payingOnline={payingOnlineId === b._id}
                  payingVnpay={payingVnpayId === b._id}
                />
              ))}
              {monthly.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Chưa có hóa đơn tháng.
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
                <h5 className="modal-title">Chi tiết hóa đơn</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={closeDetail} />
              </div>
              <div className="modal-body">
                {detailLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                )}
                {!detailLoading && detail && <BillDetailBody b={detail} />}
              </div>
              <div className="modal-footer flex-wrap gap-2">
                {detail && canPay(detail.status) && (
                  <>
                    <button type="button" className="btn btn-primary" disabled={!!payingId} onClick={() => void payDemo(detail._id)}>
                      {payingId === detail._id ? "Đang xử lý…" : "Thanh toán (xác nhận)"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={!!payingOnlineId}
                      onClick={() => void payOnlineDemo(detail._id)}
                    >
                      {payingOnlineId === detail._id ? "Đang xử lý…" : "Thanh toán online (demo)"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-success"
                      disabled={!!payingVnpayId}
                      onClick={() => void payVnpay(detail._id, detail.total)}
                    >
                      {payingVnpayId === detail._id ? "Đang chuyển…" : "Thanh toán VNPay"}
                    </button>
                  </>
                )}
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

function BillRow({
  b,
  onView,
  onPay,
  onPayOnline,
  onPayVnpay,
  paying,
  payingOnline,
  payingVnpay,
}: {
  b: Bill;
  onView: () => void;
  onPay: () => void;
  onPayOnline: () => void;
  onPayVnpay: () => void;
  paying: boolean;
  payingOnline: boolean;
  payingVnpay: boolean;
}) {
  const st = statusUi(b.status);
  return (
    <tr className={b.status === "overdue" ? "table-danger" : undefined}>
      <td>
        <strong>{billPeriodLabel(b)}</strong>
        {b.billType === "penalty" && <div className="small text-muted">Phạt vi phạm</div>}
      </td>
      <td className="text-end fw-semibold text-primary">{fmtMoney(b.total)}</td>
      <td>{fmtDate(b.dueDate)}</td>
      <td>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </td>
      <td className="text-end text-nowrap">
        <button type="button" className="btn btn-outline-secondary btn-sm me-1" onClick={onView}>
          Xem
        </button>
        {canPay(b.status) && (
          <>
            <button type="button" className="btn btn-success btn-sm me-1" disabled={paying} onClick={onPay}>
              {paying ? "…" : "Pay"}
            </button>
            <button type="button" className="btn btn-outline-success btn-sm me-1" disabled={payingOnline} onClick={onPayOnline}>
              {payingOnline ? "…" : "Online"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={payingVnpay} onClick={onPayVnpay}>
              {payingVnpay ? "…" : "VNPay"}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function BillDetailBody({ b }: { b: Bill }) {
  const st = statusUi(b.status);
  const u = b.user;
  const student = typeof u === "object" && u ? u : null;
  const c = b.contract;
  const contract = typeof c === "object" && c ? c : null;
  const room = typeof b.room === "object" ? b.room : null;

  const servicesTotal =
    (b.electricityFee || 0) + (b.waterFee || 0) + (b.sharedCommonFee || 0) + (b.personalServiceFee || 0) + (b.otherFee || 0);

  return (
    <div className="small">
      <h6 className="text-muted text-uppercase">Thông tin sinh viên</h6>
      <ul className="list-unstyled mb-3">
        <li>
          <strong>Họ tên:</strong> {student?.fullName || "—"}
        </li>
        <li>
          <strong>Mã SV:</strong> {student?.studentId || "—"}
        </li>
        <li>
          <strong>Email:</strong> {student?.email || "—"}
        </li>
      </ul>

      <h6 className="text-muted text-uppercase">Hợp đồng</h6>
      <ul className="list-unstyled mb-3">
        <li>
          <strong>Số HĐ:</strong> {contract?.contractNumber || "—"}
        </li>
        <li>
          <strong>Trạng thái HĐ:</strong> {contract?.status || "—"}
        </li>
        <li>
          <strong>Phòng:</strong> {room?.roomNumber || "—"}
        </li>
      </ul>

      <h6 className="text-muted text-uppercase">Khoản phí</h6>
      {b.billType === "penalty" ? (
        <ul>
          {(b.penaltyBreakdown || []).map((line, i) => (
            <li key={i}>
              {line.label}: {fmtMoney(line.amount)}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="list-unstyled">
          <li>
            <strong>Tiền phòng:</strong> {fmtMoney(b.roomFee)}
          </li>
          <li>
            <strong>Điện:</strong> {fmtMoney(b.electricityFee)}
          </li>
          <li>
            <strong>Nước:</strong> {fmtMoney(b.waterFee)}
          </li>
          {(b.sharedCommonFee || 0) > 0 && (
            <li>
              <strong>Dịch vụ chung (wifi…):</strong> {fmtMoney(b.sharedCommonFee)}
            </li>
          )}
          {(b.otherFee || 0) > 0 && (
            <li>
              <strong>Khác:</strong> {fmtMoney(b.otherFee)}
            </li>
          )}
          {(b.personalServiceFee || 0) > 0 && (
            <li>
              <strong>Dịch vụ cá nhân:</strong> {fmtMoney(b.personalServiceFee)}
            </li>
          )}
          <li className="mt-2">
            <strong>Tổng dịch vụ (ước lược):</strong> {fmtMoney(servicesTotal)}
          </li>
        </ul>
      )}

      <div className="border-top pt-3 mt-2">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Tổng thanh toán</span>
          <span className="fs-4 fw-bold text-primary">{fmtMoney(b.amount ?? b.total)}</span>
        </div>
        <p className="mb-1 mt-2">
          <strong>Hạn thanh toán:</strong> {fmtDate(b.dueDate)}
        </p>
        <p className="mb-1">
          <strong>Trạng thái:</strong> <span className={`badge ${st.cls}`}>{st.label}</span>
        </p>
        {b.status === "paid" && (
          <>
            <p className="mb-1">
              <strong>Ngày thanh toán:</strong> {fmtDate(b.paidAt)}
            </p>
            {b.paymentMethod && (
              <p className="mb-0">
                <strong>Phương thức:</strong>{" "}
                {b.paymentMethod === "vnpay"
                  ? "VNPay"
                  : b.paymentMethod === "online"
                    ? "Online (demo)"
                    : b.paymentMethod === "counter"
                      ? "Quầy"
                      : "Xác nhận"}
                {b.paymentReference ? ` — ${b.paymentReference}` : ""}
              </p>
            )}
            {b.vnpayTransactionNo ? (
              <p className="mb-0">
                <strong>Mã GD VNPay:</strong> {b.vnpayTransactionNo}
              </p>
            ) : null}
          </>
        )}
      </div>

      {(b.paymentHistory?.length || 0) > 0 && (
        <div className="mt-3">
          <h6 className="text-muted text-uppercase">Lịch sử thanh toán / ghi nhận</h6>
          <ul className="list-unstyled small mb-0">
            {b.paymentHistory!.slice(-8).map((h, i) => (
              <li key={i} className="border-bottom py-1">
                {fmtDate(h.at)} — {h.action}: {fmtMoney(h.amount)}{h.note ? ` (${h.note})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MyBillsPage;
