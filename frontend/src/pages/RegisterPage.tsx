import React, { useState } from "react";
import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: { email: string; password: string; fullName: string; phone?: string }) => {
    setLoading(true);
    try {
      await authApi.register(v);
      message.success("Đăng ký thành công! Vui lòng đăng nhập.");
      navigate("/login");
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <Card title="Đăng ký tài khoản">
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="fullName" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Họ tên" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: "email" }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu (tối thiểu 6 ký tự)" />
          </Form.Item>
          <Form.Item name="phone"><Input placeholder="Số điện thoại" /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Đăng ký</Button>
          </Form.Item>
          <div style={{ textAlign: "center" }}>
            Đã có tài khoản? <a href="/login">Đăng nhập</a>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
