import React, { useState, useEffect } from "react";
import { Table, Tag, message } from "antd";

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: "green", text: "Đang hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã chấm dứt" },
};

const ContractsPage: React.FC = () => {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { client } = await import("../../api");
      const res = await client.get("/contracts");
      setData(res.data.contracts || []);
    } catch (err: unknown) {
      setData([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) message.error("Bạn không có quyền truy cập");
      else message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "contractNumber" },
    { title: "Sinh viên", dataIndex: ["user", "fullName"], key: "user" },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Từ ngày", dataIndex: "startDate", key: "startDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Đến ngày", dataIndex: "endDate", key: "endDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Quản lý hợp đồng</h2>
      <Table columns={columns} dataSource={data} rowKey="_id" loading={loading} />
    </div>
  );
};

export default ContractsPage;
