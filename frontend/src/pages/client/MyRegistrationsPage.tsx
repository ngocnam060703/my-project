import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message } from "antd";
import { registrationsApi } from "../../api";
import type { Registration } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chờ duyệt" },
  approved: { color: "green", text: "Đã duyệt" },
  rejected: { color: "red", text: "Từ chối" },
};

const MyRegistrationsPage: React.FC = () => {
  const [data, setData] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    registrationsApi.getMy().then((res) => setData(res.data)).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;
  if (data.length === 0) return <Empty description="Chưa có đơn đăng ký nào" />;

  const columns = [
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area" },
    { title: "Học kỳ", dataIndex: "semester", key: "semester" },
    { title: "Năm học", dataIndex: "schoolYear", key: "schoolYear" },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: "Ngày đăng ký", dataIndex: "createdAt", key: "createdAt", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
  ];

  return <Table columns={columns} dataSource={data} rowKey="_id" />;
};

export default MyRegistrationsPage;
