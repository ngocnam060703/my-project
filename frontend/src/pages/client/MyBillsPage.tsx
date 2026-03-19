import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message } from "antd";
import { billsApi } from "../../api";
import type { Bill } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const MyBillsPage: React.FC = () => {
  const [data, setData] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    billsApi.getMy().then((res) => setData(res.data)).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;
  if (data.length === 0) return <Empty description="Chưa có hóa đơn nào" />;

  const columns = [
    { title: "Tháng/Năm", key: "monthYear", render: (_: unknown, r: Bill) => `${r.month}/${r.year}` },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Tiền phòng", dataIndex: "roomFee", key: "roomFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Điện", dataIndex: "electricityFee", key: "electricityFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Nước", dataIndex: "waterFee", key: "waterFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Tổng", dataIndex: "total", key: "total", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Hạn", dataIndex: "dueDate", key: "dueDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
  ];

  return <Table columns={columns} dataSource={data} rowKey="_id" />;
};

export default MyBillsPage;
