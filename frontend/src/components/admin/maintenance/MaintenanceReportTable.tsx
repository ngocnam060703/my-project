import React from "react";
import { Button, Empty, Space, Table, Tag, Tooltip } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { formatDateTimeVi } from "../../../utils/formatDateTime";
import {
  DAMAGE_CAUSE_LABEL,
  formatMoney,
  incidentAreaLabel,
  MAINTENANCE_STATUS_LABEL,
  requestCodeDisplay,
  RESOLUTION_LABEL,
  SEVERITY_LABEL,
  STATUS_MAP,
} from "../../../utils/maintenanceReportDisplay";
import type { Bill, MaintenanceReport, MaintenanceReportStatus, Room, User } from "../../../types";

type Props = {
  items: MaintenanceReport[];
  loading: boolean;
  page: number;
  limit: number;
  total: number;
  onPageChange: (p: number) => void;
  onReceive: (r: MaintenanceReport) => void;
  onProcess: (r: MaintenanceReport) => void;
  onView: (r: MaintenanceReport) => void;
};

const userOf = (r: MaintenanceReport): User | null =>
  typeof r.user === "object" && r.user ? (r.user as User) : null;

const roomOf = (r: MaintenanceReport): Room | null =>
  typeof r.room === "object" && r.room ? (r.room as Room) : null;

const billOf = (r: MaintenanceReport): Bill | null =>
  typeof r.bill === "object" && r.bill ? (r.bill as Bill) : null;

const MaintenanceReportTable: React.FC<Props> = ({
  items,
  loading,
  page,
  limit,
  total,
  onPageChange,
  onReceive,
  onProcess,
  onView,
}) => {
  const columns = [
    {
      title: "STT",
      key: "stt",
      width: 56,
      fixed: "left" as const,
      render: (_: unknown, __: MaintenanceReport, index: number) => (page - 1) * limit + index + 1,
    },
    {
      title: "MSSV",
      key: "studentId",
      width: 100,
      render: (_: unknown, r: MaintenanceReport) => userOf(r)?.studentId || "—",
    },
    {
      title: "Mã yêu cầu",
      key: "requestCode",
      width: 130,
      render: (_: unknown, r: MaintenanceReport) => requestCodeDisplay(r),
    },
    {
      title: "Tên sinh viên",
      key: "fullName",
      width: 150,
      ellipsis: true,
      render: (_: unknown, r: MaintenanceReport) => userOf(r)?.fullName || "—",
    },
    {
      title: "Phòng",
      key: "room",
      width: 80,
      render: (_: unknown, r: MaintenanceReport) => roomOf(r)?.roomNumber || "—",
    },
    {
      title: "Khu vực HH",
      key: "incidentType",
      width: 100,
      render: (_: unknown, r: MaintenanceReport) => incidentAreaLabel(r.incidentType),
    },
    {
      title: "Mức độ HH",
      key: "severity",
      width: 100,
      render: (_: unknown, r: MaintenanceReport) =>
        r.severity ? SEVERITY_LABEL[r.severity] || r.severity : "—",
    },
    {
      title: "Nguyên nhân HH",
      key: "damageCause",
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: MaintenanceReport) =>
        r.damageCause ? DAMAGE_CAUSE_LABEL[r.damageCause] || r.damageCause : "—",
    },
    {
      title: "Loại xử lý",
      key: "resolutionType",
      width: 130,
      render: (_: unknown, r: MaintenanceReport) => {
        if (!r.resolutionType) return "—";
        const color = r.resolutionType === "compensation" ? "volcano" : "cyan";
        return <Tag color={color}>{RESOLUTION_LABEL[r.resolutionType]}</Tag>;
      },
    },
    {
      title: "Chi phí BT",
      key: "compensationAmount",
      width: 110,
      align: "right" as const,
      render: (_: unknown, r: MaintenanceReport) =>
        r.resolutionType === "compensation" ? formatMoney(r.compensationAmount) : "—",
    },
    {
      title: "Ngày khai báo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => formatDateTimeVi(v),
    },
    {
      title: "Ngày xử lý",
      dataIndex: "processedAt",
      key: "processedAt",
      width: 170,
      render: (v: string) => formatDateTimeVi(v),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (st: MaintenanceReportStatus, r: MaintenanceReport) => {
        const m = STATUS_MAP[st] || { color: "default", label: st };
        return (
          <Space direction="vertical" size={0}>
            <Tag color={m.color}>{m.label}</Tag>
            {r.resolutionType === "maintenance" && r.maintenanceStatus ? (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {MAINTENANCE_STATUS_LABEL[r.maintenanceStatus]}
              </span>
            ) : null}
            {billOf(r)?.billCode ? (
              <Tooltip title="Mã hóa đơn bồi thường">
                <span style={{ fontSize: 11, color: "#64748b" }}>{billOf(r)?.billCode}</span>
              </Tooltip>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      fixed: "right" as const,
      render: (_: unknown, r: MaintenanceReport) => (
        <Space size={4} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => onView(r)}>
            Chi tiết
          </Button>
          {r.status === "pending" && (
            <Button size="small" type="primary" onClick={() => onReceive(r)}>
              Nhận xử lý
            </Button>
          )}
          {r.status === "processing" && (
            <Button size="small" type="primary" onClick={() => onProcess(r)}>
              Xử lý đơn
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="_id"
      loading={loading}
      columns={columns}
      dataSource={items}
      scroll={{ x: 1800 }}
      locale={{ emptyText: <Empty description="Chưa có khai báo hư hỏng" /> }}
      pagination={{
        current: page,
        pageSize: limit,
        total,
        showSizeChanger: false,
        showTotal: (t) => `Tổng ${t} khai báo`,
        onChange: onPageChange,
      }}
    />
  );
};

export default MaintenanceReportTable;
