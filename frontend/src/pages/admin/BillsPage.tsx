import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Select, InputNumber, message, Tag, Space } from "antd";
import { PlusOutlined, CheckOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { billsApi } from "../../api";
import type { Bill } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const BillsPage: React.FC = () => {
  const [data, setData] = useState<Bill[]>([]);
  const [contracts, setContracts] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const { client } = await import("../../api");
    const [billsRes, contractsRes] = await Promise.all([
      billsApi.getAll(),
      client.get("/contracts?status=active"),
    ]);
    setData(billsRes.data.bills || []);
    setContracts(contractsRes.data.contracts || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      await billsApi.create(v as { contract: string; month: number; year: number; roomFee?: number; electricityFee?: number; waterFee?: number });
      message.success("Tạo hóa đơn thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await billsApi.markPaid(id);
      message.success("Đã cập nhật");
      load();
    } catch {
      message.error("Lỗi");
    }
  };

  const cols = [
    { title: "Tháng/Năm", key: "my", render: (_: unknown, r: Bill) => `${r.month}/${r.year}` },
    { title: "Sinh viên", dataIndex: ["user", "fullName"], key: "user" },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room" },
    { title: "Tiền phòng", dataIndex: "roomFee", key: "roomFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Điện", dataIndex: "electricityFee", key: "electricityFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Nước", dataIndex: "waterFee", key: "waterFee", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Tổng", dataIndex: "total", key: "total", render: (v: number) => v?.toLocaleString("vi-VN") + "đ" },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
    {
      title: "Thao tác",
      key: "action",
      render: (_: unknown, r: Bill) =>
        r.status === "pending" ? <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleMarkPaid(r._id)}>Đã thanh toán</Button> : null,
    },
  ];

  const now = new Date();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Quản lý hóa đơn</h2>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => exportToExcel((data as Bill[]).map((b) => ({ "Tháng/Năm": `${b.month}/${b.year}`, "Sinh viên": (b.user as { fullName?: string })?.fullName, "Phòng": (b.room as { roomNumber?: string })?.roomNumber, "Tổng": b.total, "Trạng thái": b.status })), "danh-sach-hoa-don")}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Tạo hóa đơn</Button>
        </Space>
      </div>
      <Table columns={cols} dataSource={data} rowKey="_id" loading={loading} />
      <Modal title="Tạo hóa đơn" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ month: now.getMonth() + 1, year: now.getFullYear() }}>
          <Form.Item name="contract" label="Hợp đồng" rules={[{ required: true }]}>
            <Select placeholder="Chọn hợp đồng">
              {(contracts as { _id: string; contractNumber?: string; user?: { fullName: string }; room?: { roomNumber: string } }[]).map((c) => (
                <Select.Option key={c._id} value={c._id}>{c.contractNumber} - {c.user?.fullName} - {c.room?.roomNumber}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="month" label="Tháng" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="year" label="Năm" rules={[{ required: true }]}><InputNumber min={2020} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="electricityFee" label="Tiền điện"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="waterFee" label="Tiền nước"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">Tạo</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BillsPage;
