import React, { useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { useAuth } from "../contexts/AuthContext";

const LoginPage: React.FC = () => {
  useDocumentTitle("Đăng nhập");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const redirect = searchParams.get("redirect") || "/";

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.email, v.password);
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.role === "admin") navigate("/admin");
      else if (user.role === "manager") navigate("/admin");
      else navigate(redirect);
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--hero-gradient)",
      padding: 24,
    }}>
      <Card title="Đăng nhập" style={{ maxWidth: 400, width: "100%", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="email" rules={[{ required: true, type: "email" }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Đăng nhập</Button>
          </Form.Item>
          <div style={{ textAlign: "center" }}>
            Chưa có tài khoản? <a href="/register">Đăng ký</a>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
