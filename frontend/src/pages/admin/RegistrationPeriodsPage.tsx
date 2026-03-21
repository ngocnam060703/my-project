import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, DatePicker, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { client } from "../../api";
import dayjs from "dayjs";

interface Period {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const RegistrationPeriodsPage: React.FC = () => {
  const [data, setData] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get("/registration-periods");
      setData(res.data || []);
    } catch {
      message.error("Không tải được");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onFinish = async (v: { name: string; startDate: ReturnType<typeof dayjs>; endDate: ReturnType<typeof dayjs> }) => {
    try {
      await client.post("/registration-periods", {
        name: v.name,
        startDate: v.startDate.toISOString(),
        endDate: v.endDate.toISOString(),
      });
      message.success("Đã tạo đợt đăng ký");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Quản lý đợt đăng ký nội trú</h2>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>
        Thêm đợt đăng ký
      </Button>
      <Table
        loading={loading}
        dataSource={data}
        rowKey="_id"
        columns={[
          { title: "Tên", dataIndex: "name", key: "name" },
          { title: "Từ ngày", dataIndex: "startDate", key: "startDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
          { title: "Đến ngày", dataIndex: "endDate", key: "endDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
          { title: "Trạng thái", dataIndex: "isActive", key: "isActive", render: (v: boolean) => (v ? "Đang mở" : "Đã đóng") },
        ]}
      />
      <Modal title="Thêm đợt đăng ký" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true }]}>
            <Input placeholder="VD: Đợt 1 năm 2025" />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Tạo</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RegistrationPeriodsPage;
