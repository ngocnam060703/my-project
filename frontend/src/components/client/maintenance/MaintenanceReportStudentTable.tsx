import React from "react";
import { Button, Empty, Popconfirm, Space, Table, Tag } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { formatDateTimeVi } from "../../../utils/formatDateTime";
import {
  canPayMaintenanceCompensation,
  damagedItemDisplay,
  requestCodeDisplay,
  STATUS_MAP,
} from "../../../utils/maintenanceReportDisplay";
import type { MaintenanceReport, MaintenanceReportStatus, Room } from "../../../types";

type Props = {
  items: MaintenanceReport[];
  loading: boolean;
  page: number;
  limit: number;
  total: number;
  onPageChange: (p: number) => void;
  onView: (r: MaintenanceReport) => void;
  onCancel: (r: MaintenanceReport) => void;
  onPayCompensation?: (r: MaintenanceReport) => void;
  payingId?: string | null;
};

const roomOf = (r: MaintenanceReport): Room | null =>
  typeof r.room === "object" && r.room ? (r.room as Room) : null;

const MaintenanceReportStudentTable: React.FC<Props> = ({
  items,
  loading,
  page,
  limit,
  total,
  onPageChange,
  onView,
  onCancel,
  onPayCompensation,
  payingId = null,
}) => {
  const columns = [
    {
      title: "STT",
      key: "stt",
      width: 56,
      render: (_: unknown, __: MaintenanceReport, index: number) => (page - 1) * limit + index + 1,
    },
    {
      title: "Mã yêu cầu",
      key: "requestCode",
      width: 130,
      render: (_: unknown, r: MaintenanceReport) => requestCodeDisplay(r),
    },
    {
      title: "Phòng",
      key: "room",
      width: 80,
      render: (_: unknown, r: MaintenanceReport) => roomOf(r)?.roomNumber || "—",
    },
    {
      title: "Thiết bị / vật tư",
      key: "damagedItem",
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: MaintenanceReport) => damagedItemDisplay(r),
    },
    {
      title: "Mô tả",
      key: "description",
      width: 200,
      ellipsis: true,
      render: (_: unknown, r: MaintenanceReport) => r.description || "—",
    },
    {
      title: "Ngày khai báo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => formatDateTimeVi(v),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (st: MaintenanceReportStatus) => {
        const m = STATUS_MAP[st] || { color: "default", label: st };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: "Thao tác",
      key: "action",
      width: 220,
      fixed: "right" as const,
      render: (_: unknown, r: MaintenanceReport) => (
        <Space size={4} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => onView(r)}>
            Chi tiết
          </Button>
          {canPayMaintenanceCompensation(r) && onPayCompensation ? (
            <Button
              size="small"
              type="primary"
              loading={payingId === r._id}
              onClick={() => onPayCompensation(r)}
            >
              VNPay
            </Button>
          ) : null}
          {r.status === "pending" && (
            <Popconfirm
              title="Hủy khai báo này?"
              description="Chỉ áp dụng khi trạng thái còn «Chờ kiểm tra»."
              okText="Hủy yêu cầu"
              cancelText="Không"
              onConfirm={() => onCancel(r)}
            >
              <Button size="small" danger>
                Hủy
              </Button>
            </Popconfirm>
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
      scroll={{ x: 1100 }}
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

export default MaintenanceReportStudentTable;
