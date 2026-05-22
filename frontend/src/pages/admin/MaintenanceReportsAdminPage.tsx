/**
 * BQL: quản lý khai báo hư hỏng — layout đồng bộ trang Hóa đơn Admin.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Card, message } from "antd";
import { isAxiosError } from "axios";
import { maintenanceReportsAdminApi } from "../../api";
import MaintenanceReportStatsCards from "../../components/admin/maintenance/MaintenanceReportStatsCards";
import MaintenanceReportFilterBar, {
  type MaintenanceFilterState,
} from "../../components/admin/maintenance/MaintenanceReportFilterBar";
import MaintenanceReportTable from "../../components/admin/maintenance/MaintenanceReportTable";
import MaintenanceReportDetailModal, {
  type ProcessFormValues,
} from "../../components/admin/maintenance/MaintenanceReportDetailModal";
import type { MaintenanceReport } from "../../types";

const LIMIT = 15;

const MaintenanceReportsAdminPage: React.FC = () => {
  const [filters, setFilters] = useState<MaintenanceFilterState>({ status: "all" });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<MaintenanceReport[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    totalAll: 0,
    pendingCount: 0,
    resolvedCount: 0,
    cancelledCount: 0,
    processingCount: 0,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "process">("view");
  const [selected, setSelected] = useState<MaintenanceReport | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.status, filters.month, filters.year, filters.date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        status: filters.status || "all",
        page,
        limit: LIMIT,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.date) params.date = filters.date;
      else if (filters.month && filters.year) {
        params.month = filters.month;
        params.year = filters.year;
      }
      const { data } = await maintenanceReportsAdminApi.list(params);
      const body = data as {
        reports?: MaintenanceReport[];
        total?: number;
        summary?: typeof summary;
      };
      setItems(body.reports || []);
      setTotal(body.total || 0);
      setSummary({
        totalAll: body.summary?.totalAll ?? 0,
        pendingCount: body.summary?.pendingCount ?? 0,
        resolvedCount: body.summary?.resolvedCount ?? 0,
        cancelledCount: body.summary?.cancelledCount ?? 0,
        processingCount: body.summary?.processingCount ?? 0,
      });
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Lỗi tải dữ liệu" : "Lỗi tải dữ liệu"
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.month, filters.year, filters.date, page, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const openView = (r: MaintenanceReport) => {
    setSelected(r);
    setModalMode("view");
    setModalOpen(true);
  };

  const openProcess = (r: MaintenanceReport) => {
    setSelected(r);
    setModalMode("process");
    setModalOpen(true);
  };

  const receiveRow = async (r: MaintenanceReport) => {
    try {
      await maintenanceReportsAdminApi.patch(r._id, { status: "processing" });
      message.success("Đã nhận xử lý đơn");
      await load();
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Cập nhật thất bại" : "Lỗi"
      );
    }
  };

  const submitProcess = async (vals: ProcessFormValues) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await maintenanceReportsAdminApi.patch(selected._id, {
        status: "resolved",
        severity: vals.severity,
        damageCause: vals.damageCause,
        resolutionType: vals.resolutionType,
        compensationAmount: vals.resolutionType === "compensation" ? vals.compensationAmount : 0,
        maintenanceStatus: vals.resolutionType === "maintenance" ? vals.maintenanceStatus : "",
        adminNote: vals.adminNote,
      });
      message.success(
        vals.resolutionType === "compensation"
          ? "Đã xử lý và tạo hóa đơn bồi thường hư hỏng"
          : "Đã xử lý yêu cầu bảo trì"
      );
      setModalOpen(false);
      setSelected(null);
      await load();
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Xử lý thất bại" : "Lỗi"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setFilters({ status: "all" });
    setSearchInput("");
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý khai báo hư hỏng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Tiếp nhận, phân loại và xử lý yêu cầu từ sinh viên (bảo trì hoặc bồi thường hư hỏng)
        </p>
      </div>

      <MaintenanceReportStatsCards summary={summary} />

      <Card style={{ borderRadius: 12 }}>
        <MaintenanceReportFilterBar
          filters={filters}
          searchInput={searchInput}
          onFiltersChange={setFilters}
          onSearchChange={setSearchInput}
          onPageReset={() => setPage(1)}
          onClearFilters={clearFilters}
          onReload={() => void load()}
        />

        <MaintenanceReportTable
          items={items}
          loading={loading}
          page={page}
          limit={LIMIT}
          total={total}
          onPageChange={setPage}
          onReceive={(r) => void receiveRow(r)}
          onProcess={openProcess}
          onView={openView}
        />
      </Card>

      <MaintenanceReportDetailModal
        open={modalOpen}
        mode={modalMode}
        report={selected}
        submitting={submitting}
        onClose={() => {
          setModalOpen(false);
          setSelected(null);
        }}
        onSubmit={(vals) => void submitProcess(vals)}
      />
    </div>
  );
};

export default MaintenanceReportsAdminPage;
