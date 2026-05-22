import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { CheckCircleFilled, CloseCircleFilled, EyeOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDateTimeVi, formatDateVi } from "../../utils/formatDateTime";
import { billPaymentMethodLabel, billPaymentPayerLabel } from "../../utils/billPaymentLabels";
import { billsApi } from "../../api";

export type BillStatus = "unpaid" | "paid" | "overdue";
export type PaymentMethod = "vnpay" | "cash" | null;

export interface Bill {
  id: string;
  billCode: string;
  month: number;
  year: number;
  amount: number;
  dueDate: string | null;
  status: BillStatus;
  createdAt: string | null;
  notes: string;
  paidAt: string | null;
  paymentMethod: PaymentMethod;
  paymentMethodRaw: string | null;
  payerLabel: string;
}

type ApiBill = {
  _id?: string;
  billCode?: string;
  month?: number;
  year?: number;
  total?: number;
  amount?: number;
  dueDate?: string | null;
  createdAt?: string | null;
  note?: string;
  notes?: string;
  paidAt?: string | null;
  status?: string;
  paymentMethod?: string | null;
  paidBy?: { fullName?: string; role?: string } | string | null;
};

const formatMoney = (value: number): string => `${Math.round(value || 0).toLocaleString("vi-VN")}đ`;

const formatDate = (value?: string | null): string => formatDateVi(value);

const formatDateTime = (value?: string | null): string => formatDateTimeVi(value);

const normalizePaymentMethod = (method?: string | null): PaymentMethod => {
  if (!method) return null;
  if (method === "vnpay" || method === "online") return "vnpay";
  if (method === "cash" || method === "counter" || method === "manual") return "cash";
  return null;
};

const normalizeStatus = (status?: string): BillStatus => {
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  return "unpaid";
};

const paymentMethodLabel = (method?: string | null): string => billPaymentMethodLabel(method);

const resolvePayerLabel = (row: ApiBill): string =>
  billPaymentPayerLabel({
    status: row.status || "unpaid",
    paymentMethod: row.paymentMethod ?? undefined,
    paidBy: row.paidBy,
  });

const mapApiBill = (row: ApiBill): Bill => {
  const id = String(row._id || "");
  const status = normalizeStatus(row.status);
  const rawMethod = row.paymentMethod || null;
  return {
    id,
    billCode: String(row.billCode || "—"),
    month: Number(row.month || 0),
    year: Number(row.year || 0),
    amount: Number(row.amount ?? row.total ?? 0),
    dueDate: row.dueDate || null,
    status,
    createdAt: row.createdAt || null,
    notes: String(row.notes || row.note || ""),
    paidAt: row.paidAt || null,
    paymentMethod: normalizePaymentMethod(rawMethod),
    paymentMethodRaw: rawMethod,
    payerLabel: resolvePayerLabel(row),
  };
};

const canPay = (status: BillStatus): boolean => status === "unpaid" || status === "overdue";

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const responseMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (responseMessage) return responseMessage;
    if (error.response?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  return "Không thể tải dữ liệu hóa đơn.";
};

const statusBadge = (status: BillStatus) => {
  if (status === "paid") {
    return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Đã thanh toán</span>;
  }
  if (status === "overdue") {
    return <span className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">Quá hạn</span>;
  }
  return <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Chưa thanh toán</span>;
};

const BillDetailModal: React.FC<{
  bill: Bill | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
}> = ({ bill, open, loading, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Chi tiết hóa đơn</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
          {loading && <div className="py-4 text-center text-slate-500">Đang tải chi tiết hóa đơn…</div>}
          {!loading && bill && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InfoRow label="Mã hóa đơn" value={bill.billCode} />
                <InfoRow label="Kỳ hóa đơn" value={`${bill.month}/${bill.year}`} />
                <InfoRow label="Số tiền" value={formatMoney(bill.amount)} />
                <InfoRow label="Hạn thanh toán" value={formatDate(bill.dueDate)} />
                <InfoRow label="Ngày tạo hóa đơn" value={formatDateTime(bill.createdAt)} />
                <InfoRow label="Trạng thái" value={bill.status === "paid" ? "Đã thanh toán" : bill.status === "overdue" ? "Quá hạn" : "Chưa thanh toán"} />
                <InfoRow label="Ngày đã thanh toán" value={formatDateTime(bill.paidAt)} />
                <InfoRow label="Phương thức thanh toán" value={paymentMethodLabel(bill.paymentMethodRaw)} />
                <InfoRow label="Người thanh toán" value={bill.payerLabel} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Ghi chú hóa đơn</p>
                <p className="text-sm text-slate-700">{bill.notes || "—"}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 p-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-medium text-slate-900">{value || "—"}</p>
  </div>
);

const BillsTable: React.FC<{
  rows: Bill[];
  payingId: string | null;
  onView: (id: string) => void;
  onPay: (id: string) => void;
}> = ({ rows, payingId, onView, onPay }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">STT</th>
            <th className="px-4 py-3">Mã hóa đơn</th>
            <th className="px-4 py-3">Tháng</th>
            <th className="px-4 py-3">Số tiền</th>
            <th className="px-4 py-3">Hạn thanh toán</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((bill, index) => (
            <tr key={bill.id} className="border-t border-slate-100 text-slate-700">
              <td className="px-4 py-3">{index + 1}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{bill.billCode}</td>
              <td className="px-4 py-3">{`${bill.month}/${bill.year}`}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(bill.amount)}</td>
              <td className="px-4 py-3">{formatDate(bill.dueDate)}</td>
              <td className="px-4 py-3">{statusBadge(bill.status)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {(bill.status === "unpaid" || bill.status === "overdue") && (
                    <button
                      type="button"
                      onClick={() => onPay(bill.id)}
                      disabled={payingId === bill.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {payingId === bill.id ? "Đang chuyển…" : "Thanh toán online VNPay"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onView(bill.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <EyeOutlined />
                    Xem
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                Chưa có hóa đơn nào.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const MyBillsPage: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Bill | null>(null);
  const openedFromQueryRef = useRef(false);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let raw: ApiBill[] = [];
      try {
        const { data } = await billsApi.getMyBills();
        raw = Array.isArray(data) ? (data as ApiBill[]) : [];
      } catch {
        const { data } = await billsApi.getMy();
        raw = Array.isArray(data) ? (data as ApiBill[]) : [];
      }
      setRows(raw.map(mapApiBill));
    } catch (err) {
      setError(getErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);

  useEffect(() => {
    const vnpay = searchParams.get("vnpay");
    const responseCode = searchParams.get("vnp_ResponseCode");
    const txnRef = searchParams.get("vnp_TxnRef");
    const success = vnpay === "success" || responseCode === "00";
    const cancel = vnpay === "cancel" || responseCode === "24";
    const hasVnpCallback = vnpay !== null || responseCode !== null;

    if (!hasVnpCallback) return;

    if (success) {
      message.success({
        content: "Thanh toán thành công!",
        icon: <CheckCircleFilled style={{ color: "#16a34a" }} />,
      });
      if (txnRef) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === txnRef || row.billCode === txnRef
              ? {
                  ...row,
                  status: "paid",
                  paidAt: new Date().toISOString(),
                  paymentMethod: "vnpay",
                  paymentMethodRaw: "online",
                  payerLabel: "Sinh viên",
                }
              : row,
          ),
        );
      }
      void loadBills();
    } else if (cancel) {
      message.warning({
        content: "Đã hủy giao dịch thanh toán",
        icon: <CloseCircleFilled style={{ color: "#f97316" }} />,
      });
    }

    navigate("/student/my-bills", { replace: true });
  }, [searchParams, message, navigate, loadBills]);

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const { data } = await billsApi.getById(id);
      setDetail(mapApiBill((data || {}) as ApiBill));
    } catch (err) {
      setError(getErrorMessage(err));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const billId = searchParams.get("billId");
    if (!billId || openedFromQueryRef.current) return;
    openedFromQueryRef.current = true;
    void openDetail(billId);
    navigate("/student/my-bills", { replace: true });
  }, [searchParams, navigate, openDetail]);

  const totalNeedPay = useMemo(() => rows.filter((row) => canPay(row.status)).reduce((sum, row) => sum + row.amount, 0), [rows]);

  const payOnline = async (id: string) => {
    setPayingId(id);
    setError(null);
    try {
      const response = await billsApi.payOnline(id);
      const paymentUrl = (response.data as { paymentUrl?: string } | undefined)?.paymentUrl;
      if (!paymentUrl) {
        setError("Không tạo được đường dẫn thanh toán VNPay.");
        return;
      }
      window.location.href = paymentUrl;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Hóa đơn của tôi</h1>
        <p className="text-sm text-slate-500">Theo dõi trạng thái hóa đơn và thanh toán online VNPay.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Tổng cần thanh toán</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{formatMoney(totalNeedPay)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Số hóa đơn chưa thanh toán / quá hạn</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{rows.filter((r) => canPay(r.status)).length}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">Đang tải hóa đơn…</div>
      ) : (
        <BillsTable rows={rows} payingId={payingId} onView={openDetail} onPay={payOnline} />
      )}

      <BillDetailModal bill={detail} open={detailOpen} loading={detailLoading} onClose={() => setDetailOpen(false)} />
    </div>
  );
};

export default MyBillsPage;
