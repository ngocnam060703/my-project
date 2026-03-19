import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { areasApi, usersApi } from "../../api";

const AreasPage: React.FC = () => {
  const [data, setData] = useState<unknown[]>([]);
  const [managers, setManagers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const [areasRes, usersRes] = await Promise.all([areasApi.getAll(), usersApi.getAll({ role: "manager" })]);
    setData(areasRes.data);
    setManagers(usersRes.data.users || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      await areasApi.create(v);
      message.success("Thêm thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const columns = [
    { title: "Tên khu", dataIndex: "name", key: "name" },
    { title: "Mô tả", dataIndex: "description", key: "description" },
    { title: "Quản lý", dataIndex: ["manager", "fullName"], key: "manager" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Quản lý khu</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Thêm khu</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="_id" loading={loading} />
      <Modal title="Thêm khu" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="name" label="Tên khu" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input.TextArea /></Form.Item>
          <Form.Item name="manager" label="Quản lý">
            <Select allowClear><Select.Option value={null}>Không</Select.Option>
              {(managers as { _id: string; fullName: string }[]).map((m) => <Select.Option key={m._id} value={m._id}>{m.fullName}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">Thêm</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AreasPage;
