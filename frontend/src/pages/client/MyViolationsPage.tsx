import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { billsApi, violationsApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";

export type ViolationStatus = "unpaid" | "paid" | "resolved";

export interface Violation {
  id: string;
  recordedAt: string;
  violationName: string;
  penaltyText: string;
  isFinancialPenalty: boolean;
  status: ViolationStatus;
  billId: string | null;
}

type ApiViolation = {
  _id?: string;
  createdAt?: string;
  ruleName?: string;
  rule?: { name?: string } | string;
  fineAmount?: number;
  compensationAmount?: number;
  bill?: string | { _id?: string };
  status?: string;
  points?: number;
  schoolYear?: string;
  semester?: string;
  description?: string;
};

type BillLookup = { _id?: string; status?: string; violation?: string | { _id?: string } };

type ViewViolation = Violation & {
  points: number;
  schoolYear: string;
  semester: string;
  description: string;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeBillId(input: ApiViolation["bill"]): string | null {
  if (!input) return null;
  if (typeof input === "string") return input;
  return input._id ? String(input._id) : null;
}

function buildPenaltyText(fine: number, compensation: number): string {
  const total = Math.max(0, fine || 0) + Math.max(0, compensation || 0);
  if (total <= 0) return "Nhắc nhở / xử lý nội quy";
  return `Phạt ${total.toLocaleString("vi-VN")}đ`;
}

function mapViolation(row: ApiViolation, billStatusMap: Map<string, string>): ViewViolation {
  const id = String(row._id || "");
  const billId = normalizeBillId(row.bill);
  const fine = Number(row.fineAmount || 0);
  const compensation = Number(row.compensationAmount || 0);
  const isFinancialPenalty = fine + compensation > 0 || !!billId;

  let status: ViolationStatus = "resolved";
  if (isFinancialPenalty) {
    const billStatus = billId ? billStatusMap.get(billId) : undefined;
    status = billStatus === "paid" ? "paid" : "unpaid";
  }

  return {
    id,
    recordedAt: String(row.createdAt || ""),
    violationName:
      String(row.ruleName || (typeof row.rule === "object" && row.rule ? row.rule.name : "") || "Vi phạm nội quy"),
    penaltyText: buildPenaltyText(fine, compensation),
    isFinancialPenalty,
    status,
    billId,
    points: Number(row.points || 0),
    schoolYear: String(row.schoolYear || "Không xác định"),
    semester: String(row.semester || "Không xác định"),
    description: String(row.description || ""),
  };
}

const FilterBar: React.FC<{
  schoolYears: string[];
  semesters: string[];
  selectedYear: string;
  selectedSemester: string;
  onYearChange: (value: string) => void;
  onSemesterChange: (value: string) => void;
}> = ({ schoolYears, semesters, selectedYear, selectedSemester, onYearChange, onSemesterChange }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Năm học</span>
        <select
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-emerald-500 focus:ring-2"
          value={selectedYear}
          onChange={(e) => onYearChange(e.target.value)}
        >
          {schoolYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Học kỳ</span>
        <select
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-emerald-500 focus:ring-2"
          value={selectedSemester}
          onChange={(e) => onSemesterChange(e.target.value)}
        >
          {semesters.map((semester) => (
            <option key={semester} value={semester}>
              {semester}
            </option>
          ))}
        </select>
      </label>
    </div>
  </div>
);

const SummaryCards: React.FC<{
  pendingCount: number;
  totalCount: number;
  totalPoints: number;
}> = ({ pendingCount, totalCount, totalPoints }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs uppercase tracking-wide text-amber-700">Vi phạm chờ xử lý</p>
      <p className="mt-1 text-2xl font-bold text-amber-700">{pendingCount}</p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Tổng vi phạm đã ghi</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount}</p>
    </div>
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="text-xs uppercase tracking-wide text-indigo-700">Điểm kỷ luật tích lũy</p>
      <p className="mt-1 text-2xl font-bold text-indigo-700">{totalPoints}</p>
    </div>
  </div>
);

const StatusBadge: React.FC<{ row: Violation }> = ({ row }) => {
  if (!row.isFinancialPenalty) {
    return <span className="inline-flex rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">Đã xử lý</span>;
  }
  if (row.status === "paid") {
    return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Đã đóng phạt</span>;
  }
  return <span className="inline-flex rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">Chờ thanh toán</span>;
};

const ViolationsTable: React.FC<{
  rows: ViewViolation[];
  onView: (row: ViewViolation) => void;
  onPay: (row: ViewViolation) => void;
}> = ({ rows, onView, onPay }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">STT</th>
            <th className="px-4 py-3">Ngày ghi nhận</th>
            <th className="px-4 py-3">Loại vi phạm</th>
            <th className="px-4 py-3">Hình thức xử lý</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
              <td className="px-4 py-3">{index + 1}</td>
              <td className="px-4 py-3">{formatDateTime(row.recordedAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.violationName}</td>
              <td className="px-4 py-3">{row.penaltyText}</td>
              <td className="px-4 py-3">
                <StatusBadge row={row} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onView(row)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Xem
                  </button>
                  {row.status === "unpaid" && row.billId && (
                    <button
                      type="button"
                      onClick={() => onPay(row)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Thanh toán
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                Không có dữ liệu vi phạm theo bộ lọc đã chọn.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const ViolationDetailModal: React.FC<{
  row: ViewViolation | null;
  open: boolean;
  onClose: () => void;
}> = ({ row, open, onClose }) => {
  if (!open || !row) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Chi tiết vi phạm</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
          <InfoLine label="Ngày ghi nhận" value={formatDateTime(row.recordedAt)} />
          <InfoLine label="Loại vi phạm" value={row.violationName} />
          <InfoLine label="Hình thức xử lý" value={row.penaltyText} />
          <InfoLine label="Trạng thái" value={row.status === "paid" ? "Đã đóng phạt" : row.status === "unpaid" ? "Chờ thanh toán" : "Đã xử lý"} />
          <InfoLine label="Năm học / Học kỳ" value={`${row.schoolYear} / ${row.semester}`} />
          <InfoLine label="Điểm kỷ luật" value={String(row.points)} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Mô tả</p>
            <p>{row.description || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 p-3">
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-medium text-slate-900">{value || "—"}</p>
  </div>
);

const MyViolationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ViewViolation[]>([]);
  const [selectedYear, setSelectedYear] = useState("Tất cả");
  const [selectedSemester, setSelectedSemester] = useState("Tất cả");
  const [detailRow, setDetailRow] = useState<ViewViolation | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let violationsRaw: ApiViolation[] = [];
      try {
        const res = await violationsApi.getMyViolations();
        violationsRaw = Array.isArray(res.data) ? (res.data as ApiViolation[]) : [];
      } catch {
        const res = await violationsApi.getMy();
        violationsRaw = Array.isArray(res.data) ? (res.data as ApiViolation[]) : [];
      }

      let billsRaw: BillLookup[] = [];
      try {
        const billsRes = await billsApi.getMyBills();
        billsRaw = Array.isArray(billsRes.data) ? (billsRes.data as BillLookup[]) : [];
      } catch {
        const billsRes = await billsApi.getMy();
        billsRaw = Array.isArray(billsRes.data) ? (billsRes.data as BillLookup[]) : [];
      }

      const billStatusMap = new Map<string, string>();
      for (const bill of billsRaw) {
        if (bill._id) billStatusMap.set(String(bill._id), String(bill.status || ""));
      }

      const mapped = violationsRaw.map((row) => mapViolation(row, billStatusMap));
      mapped.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      setRows(mapped);
    } catch (e) {
      setRows([]);
      setError(apiErrorMessage(e, "Không tải được dữ liệu vi phạm."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const schoolYearOptions = useMemo(() => {
    const set = new Set(rows.map((row) => row.schoolYear).filter(Boolean));
    return ["Tất cả", ...Array.from(set)];
  }, [rows]);

  const semesterOptions = useMemo(() => {
    const set = new Set(rows.map((row) => row.semester).filter(Boolean));
    return ["Tất cả", ...Array.from(set)];
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const yearOk = selectedYear === "Tất cả" || row.schoolYear === selectedYear;
        const semesterOk = selectedSemester === "Tất cả" || row.semester === selectedSemester;
        return yearOk && semesterOk;
      }),
    [rows, selectedYear, selectedSemester],
  );

  const pendingCount = useMemo(() => filteredRows.filter((row) => row.status === "unpaid").length, [filteredRows]);
  const totalPoints = useMemo(() => filteredRows.reduce((sum, row) => sum + row.points, 0), [filteredRows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vi phạm của tôi</h1>
        <p className="text-sm text-slate-500">Theo dõi vi phạm nội quy, trạng thái xử lý và thanh toán phạt nếu có.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <FilterBar
        schoolYears={schoolYearOptions}
        semesters={semesterOptions}
        selectedYear={selectedYear}
        selectedSemester={selectedSemester}
        onYearChange={setSelectedYear}
        onSemesterChange={setSelectedSemester}
      />

      <SummaryCards pendingCount={pendingCount} totalCount={filteredRows.length} totalPoints={totalPoints} />

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">Đang tải dữ liệu vi phạm…</div>
      ) : (
        <ViolationsTable
          rows={filteredRows}
          onView={(row) => setDetailRow(row)}
          onPay={(row) => {
            if (!row.billId) return;
            navigate(`/student/my-bills?billId=${encodeURIComponent(row.billId)}`);
          }}
        />
      )}

      <ViolationDetailModal row={detailRow} open={!!detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
};

export default MyViolationsPage;
