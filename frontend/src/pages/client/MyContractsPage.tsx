import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message } from "antd";
import { contractsApi } from "../../api";
import type { Contract } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: "green", text: "Đang hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã chấm dứt" },
};

const MyContractsPage: React.FC = () => {
  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contractsApi.getMy().then((res) => setData(res.data)).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;
  if (data.length === 0) return <Empty description="Chưa có hợp đồng nào" />;

  const columns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "contractNumber" },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area" },
    { title: "Từ ngày", dataIndex: "startDate", key: "startDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Đến ngày", dataIndex: "endDate", key: "endDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
  ];

  return <Table columns={columns} dataSource={data} rowKey="_id" />;
};

export default MyContractsPage;
