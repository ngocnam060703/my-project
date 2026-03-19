import React, { useState, useEffect } from "react";
import { Table, Button, Space, Modal, Form, Input, Select, message, Tag } from "antd";
import { PlusOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { usersApi } from "../../api";

const UsersPage: React.FC = () => {
  const [data, setData] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    const res = await usersApi.getAll({ page, limit: 10 });
    setData(res.data.users);
    setTotal(res.data.total);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      await usersApi.create(v);
      message.success("Thêm thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const columns = [
    { title: "Họ tên", dataIndex: "fullName", key: "fullName" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Vai trò", dataIndex: "role", key: "role", render: (r: string) => <Tag>{r}</Tag> },
    { title: "SĐT", dataIndex: "phone", key: "phone" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Quản lý người dùng</h2>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => exportToExcel((data as { fullName?: string; email?: string; role?: string; phone?: string }[]).map((u) => ({ "Họ tên": u.fullName, Email: u.email, "Vai trò": u.role, "SĐT": u.phone })), "danh-sach-nguoi-dung")}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Thêm</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="_id"
        loading={loading}
        pagination={{ total, current: page, onChange: setPage }}
      />
      <Modal title="Thêm người dùng" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}><Input /></Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
          <Form.Item name="role" label="Vai trò" initialValue="user">
            <Select><Select.Option value="user">User</Select.Option><Select.Option value="manager">Manager</Select.Option><Select.Option value="admin">Admin</Select.Option></Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">Thêm</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
