import React, { useState, useEffect } from "react";
import { Table, Button, Tag, Space, message, Modal, Input } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { registrationsApi, client } from "../../api";
import type { Registration } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chờ duyệt" },
  approved: { color: "green", text: "Đã duyệt" },
  rejected: { color: "red", text: "Từ chối" },
};

const RegistrationsPage: React.FC = () => {
  const [data, setData] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await client.get("/registrations");
    setData(res.data.registrations || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    try {
      await registrationsApi.approve(id);
      message.success("Đã duyệt");
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await registrationsApi.reject(rejectModal.id, rejectReason);
      message.success("Đã từ chối");
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const columns = [
    { title: "Sinh viên", dataIndex: ["user", "fullName"], key: "user" },
    { title: "MSSV", dataIndex: ["user", "studentId"], key: "studentId" },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area" },
    { title: "Học kỳ", dataIndex: "semester", key: "semester" },
    { title: "Năm học", dataIndex: "schoolYear", key: "schoolYear" },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
    {
      title: "Thao tác",
      key: "action",
      render: (_: unknown, r: Registration) =>
        r.status === "pending" ? (
          <Space>
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(r._id)}>Duyệt</Button>
            <Button danger size="small" icon={<CloseOutlined />} onClick={() => setRejectModal({ id: r._id })}>Từ chối</Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Đơn đăng ký</h2>
      <Table columns={columns} dataSource={data} rowKey="_id" loading={loading} />
      <Modal title="Lý do từ chối" open={!!rejectModal} onOk={handleReject} onCancel={() => setRejectModal(null)}>
        <Input.TextArea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Nhập lý do (tùy chọn)" />
      </Modal>
    </div>
  );
};

export default RegistrationsPage;
