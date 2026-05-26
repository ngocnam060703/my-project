import React, { useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { App, Form, Input, Button, Card } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api";

function sanitizeRegisterErrorMessage(msg: string): string {
  if (!msg || !/E11000/i.test(msg)) return msg;
  if (/email/i.test(msg)) return "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.";
  if (/studentId/i.test(msg)) return "MSSV này đã được đăng ký. Vui lòng đăng nhập hoặc dùng MSSV khác.";
  return "Thông tin đăng ký đã trùng với tài khoản khác. Vui lòng kiểm tra email và MSSV.";
}

const RegisterPage: React.FC = () => {
  useDocumentTitle("Đăng ký");
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: {
    studentId: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => {
    setLoading(true);
    try {
      await authApi.register(v);
      message.success("Tài khoản đang chờ admin phê duyệt.");
      navigate("/login?pending=1", { replace: true });
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: { message?: string; errors?: { msg?: string }[] } };
        message?: string;
        code?: string;
      };
      if (ax.code === "ECONNABORTED" || String(ax.message || "").toLowerCase().includes("timeout")) {
        message.error("Máy chủ phản hồi quá chậm, vui lòng thử lại sau ít phút.");
        return;
      }
      if (ax.code === "ERR_NETWORK" || ax.message === "Network Error") {
        message.error("Không kết nối được máy chủ. Kiểm tra backend đang chạy và cấu hình API.");
        return;
      }
      const raw =
        ax.response?.data?.message ||
        (Array.isArray(ax.response?.data?.errors) ? ax.response?.data?.errors?.[0]?.msg : "");
      message.error(sanitizeRegisterErrorMessage(raw || "") || "Đăng ký thất bại");
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
      <Card title="Đăng ký tài khoản" style={{ maxWidth: 400, width: "100%", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="studentId" rules={[{ required: true, message: "Vui lòng nhập MSSV" }]}>
            <Input prefix={<UserOutlined />} placeholder="MSSV" />
          </Form.Item>
          <Form.Item name="fullName" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} placeholder="Họ tên" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: "email" }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6, message: "Mật khẩu tối thiểu 6 ký tự" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu (tối thiểu 6 ký tự)" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Vui lòng xác nhận mật khẩu" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("Mật khẩu không khớp"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Xác nhận mật khẩu" />
          </Form.Item>
          <Form.Item
            name="phone"
            rules={[{ required: true, message: "Vui lòng nhập số điện thoại" }]}
          >
            <Input placeholder="Số điện thoại" />
          </Form.Item>
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
