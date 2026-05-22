import React from "react";
import { Button, DatePicker, Input, InputNumber, Select } from "antd";
import { FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";

export type MaintenanceFilterState = {
  status?: string;
  month?: number;
  year?: number;
  date?: string;
};

type Props = {
  filters: MaintenanceFilterState;
  searchInput: string;
  onFiltersChange: (next: MaintenanceFilterState) => void;
  onSearchChange: (v: string) => void;
  onPageReset: () => void;
  onClearFilters: () => void;
  onReload: () => void;
};

const MaintenanceReportFilterBar: React.FC<Props> = ({
  filters,
  searchInput,
  onFiltersChange,
  onSearchChange,
  onPageReset,
  onClearFilters,
  onReload,
}) => {
  const dateValue = filters.date ? dayjs(filters.date) : null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
      <FilterOutlined style={{ color: "#6b7280" }} />
      <Select
        placeholder="Trạng thái"
        allowClear
        style={{ width: 160 }}
        value={filters.status === "all" ? undefined : filters.status}
        onChange={(v) => {
          onFiltersChange({ ...filters, status: v || "all" });
          onPageReset();
        }}
      >
        <Select.Option value="pending">Chờ xử lý</Select.Option>
        <Select.Option value="processing">Đang xử lý</Select.Option>
        <Select.Option value="resolved">Đã xử lý</Select.Option>
        <Select.Option value="cancelled">Đã hủy</Select.Option>
      </Select>
      <DatePicker
        placeholder="Lọc theo ngày"
        format="DD/MM/YYYY"
        value={dateValue}
        onChange={(d: Dayjs | null) => {
          onFiltersChange({
            ...filters,
            date: d ? d.format("YYYY-MM-DD") : undefined,
            month: undefined,
            year: undefined,
          });
          onPageReset();
        }}
        allowClear
      />
      <InputNumber
        placeholder="Tháng"
        min={1}
        max={12}
        style={{ width: 90 }}
        value={filters.month}
        onChange={(v) => {
          onFiltersChange({
            ...filters,
            month: v ?? undefined,
            date: undefined,
            year: filters.year ?? new Date().getFullYear(),
          });
          onPageReset();
        }}
      />
      <InputNumber
        placeholder="Năm"
        min={2020}
        max={2100}
        style={{ width: 100 }}
        value={filters.year}
        onChange={(v) => {
          onFiltersChange({ ...filters, year: v ?? undefined, date: undefined });
          onPageReset();
        }}
      />
      <Input
        placeholder="Tên SV, MSSV, mã yêu cầu"
        allowClear
        style={{ width: 240 }}
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <Button onClick={onClearFilters}>Xóa lọc</Button>
      <Button icon={<ReloadOutlined />} onClick={onReload}>
        Làm mới
      </Button>
    </div>
  );
};

export default MaintenanceReportFilterBar;
