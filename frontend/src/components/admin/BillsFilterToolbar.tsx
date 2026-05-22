import React from "react";
import { Button, Input, InputNumber, Select, Space } from "antd";
import { DownloadOutlined, FilterOutlined, PlusOutlined } from "@ant-design/icons";

export type BillsFilterState = {
  status?: string;
  room?: string;
  month?: number;
  year?: number;
  billType?: string;
};

type Props = {
  filters: BillsFilterState;
  searchInput: string;
  currentMonth: number;
  currentYear: number;
  genMonth: number;
  genYear: number;
  onFiltersChange: (next: BillsFilterState) => void;
  onSearchChange: (v: string) => void;
  onPageReset: () => void;
  onClearFilters: () => void;
  onGenMonthChange: (v: number) => void;
  onGenYearChange: (v: number) => void;
  onGenerateMonth: () => void;
  onOpenCounter: () => void;
  onExportExcel: () => void;
  onOpenCreate: () => void;
};

const BillsFilterToolbar: React.FC<Props> = ({
  filters,
  searchInput,
  currentMonth,
  currentYear,
  genMonth,
  genYear,
  onFiltersChange,
  onSearchChange,
  onPageReset,
  onClearFilters,
  onGenMonthChange,
  onGenYearChange,
  onGenerateMonth,
  onOpenCounter,
  onExportExcel,
  onOpenCreate,
}) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
    <FilterOutlined style={{ color: "#6b7280" }} />
    <Select
      placeholder="Trạng thái"
      allowClear
      style={{ width: 150 }}
      value={filters.status}
      onChange={(v) => {
        onFiltersChange({ ...filters, status: v });
        onPageReset();
      }}
    >
      <Select.Option value="unpaid">Chưa thanh toán</Select.Option>
      <Select.Option value="paid">Đã thanh toán</Select.Option>
      <Select.Option value="overdue">Quá hạn</Select.Option>
    </Select>
    <Select
      placeholder="Loại HĐ"
      allowClear
      style={{ width: 140 }}
      value={filters.billType}
      onChange={(v) => {
        onFiltersChange({ ...filters, billType: v });
        onPageReset();
      }}
    >
      <Select.Option value="monthly">Hóa đơn tháng</Select.Option>
      <Select.Option value="penalty">Hóa đơn phạt VP</Select.Option>
      <Select.Option value="damage_reimbursement">Bồi thường HH</Select.Option>
    </Select>
    <InputNumber
      placeholder="Tháng"
      min={1}
      max={12}
      style={{ width: 90 }}
      value={filters.month}
      onChange={(v) => {
        onFiltersChange({ ...filters, month: v || undefined });
        onPageReset();
      }}
    />
    <InputNumber
      placeholder="Năm"
      min={2020}
      style={{ width: 100 }}
      value={filters.year}
      onChange={(v) => {
        onFiltersChange({ ...filters, year: v || undefined });
        onPageReset();
      }}
    />
    <Input
      placeholder="Tìm tên, MSSV hoặc mã HĐ"
      style={{ width: 220 }}
      value={searchInput}
      allowClear
      onChange={(e) => {
        onSearchChange(e.target.value);
        onPageReset();
      }}
    />
    <Button
      onClick={() => {
        onClearFilters();
        onFiltersChange({ month: currentMonth, year: currentYear });
      }}
    >
      Xóa bộ lọc
    </Button>
    <div style={{ flex: 1 }} />
    <Space wrap>
      <Button onClick={onOpenCounter}>Thu tại quầy</Button>
      <Button icon={<DownloadOutlined />} onClick={onExportExcel}>
        Xuất Excel
      </Button>
      <InputNumber value={genMonth} min={1} max={12} onChange={(v) => onGenMonthChange(Number(v || 1))} placeholder="Tháng" style={{ width: 90 }} />
      <InputNumber value={genYear} min={2020} onChange={(v) => onGenYearChange(Number(v || new Date().getFullYear()))} placeholder="Năm" style={{ width: 100 }} />
      <Button onClick={onGenerateMonth}>Tạo theo tháng</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={onOpenCreate}>
        Tạo hóa đơn
      </Button>
    </Space>
  </div>
);

export default BillsFilterToolbar;
