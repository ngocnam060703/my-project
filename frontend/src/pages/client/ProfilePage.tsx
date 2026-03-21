import React, { useState, useEffect } from "react";
import { Card, Form, Input, Button, message } from "antd";
import { authApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.getProfile().then((res) => {
      const u = res.data;
      form.setFieldsValue({ fullName: u.fullName, phone: u.phone, address: u.address });
    });
  }, [form]);

  const onFinish = async (v: { fullName: string; phone: string; address: string }) => {
    setLoading(true);
    try {
      const res = await authApi.updateProfile(v);
      setUser(res.data);
      localStorage.setItem("user", JSON.stringify(res.data));
      message.success("Cập nhật thành công");
    } catch {
      message.error("Cập nhật thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Thông tin cá nhân" style={{ borderRadius: 12 }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item label="Họ tên" name="fullName" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Email">{user?.email}</Form.Item>
        <Form.Item label="SĐT" name="phone"><Input /></Form.Item>
        <Form.Item label="Địa chỉ" name="address"><Input.TextArea /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" loading={loading}>Cập nhật</Button></Form.Item>
      </Form>
    </Card>
  );
};

export default ProfilePage;
