import React, { useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const LoginPage: React.FC = () => {
  useDocumentTitle("Đăng nhập");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const redirectFromQuery = searchParams.get("redirect");
  const redirectFromState = (location.state as { from?: { pathname?: string } } | null)?.from
    ?.pathname;
  const rawRedirect = redirectFromQuery || redirectFromState || "";

  /** Sau đăng nhập sinh viên: luôn vào cây `/student/...` */
  const normalizeStudentPostLogin = (path: string): string => {
    const p = (path || "").trim() || "/student";
    if (p.startsWith("/student")) return p;
    if (p.startsWith("/admin")) return "/student";
    if (p === "/" || p.startsWith("/login") || p.startsWith("/register")) return "/student";
    return `/student${p.startsWith("/") ? p : `/${p}`}`;
  };

  // const onFinish = async (v: { email: string; password: string }) => {
  //   setLoading(true);
  //   console.log("--- Bắt đầu đăng nhập ---");
  //   console.log("Dữ liệu gửi đi:", { email: v.email, password: "***" });
  //   try {
  //     await login(v.email, v.password);
  //     const user = JSON.parse(localStorage.getItem("user") || "{}");
  //     if (user.role === "admin") navigate("/admin");
  //     else if (user.role === "manager") navigate("/admin");
  //     else navigate(redirect);
  //   } catch (err: unknown) {
  //     message.error(
  //       (err as { response?: { data?: { message?: string } } })?.response?.data
  //         ?.message || "Đăng nhập thất bại",
  //     );
  //     console.log(err);
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(v.email, v.password);
      const userStr = localStorage.getItem("user");
      if (!userStr) throw new Error("Không lấy được thông tin người dùng sau đăng nhập");

      const user = JSON.parse(userStr);
      if (user.role === "admin" || user.role === "manager") {
        navigate("/admin");
      } else {
        navigate(normalizeStudentPostLogin(rawRedirect));
      }
      message.success("Đăng nhập thành công!");
    } catch (err: unknown) {
      const ax = err as {
        response?: {
          status?: number;
          data?: { message?: string; errors?: { msg?: string }[] };
        };
        message?: string;
        code?: string;
      };
      if (ax.code === "ERR_NETWORK" || ax.message === "Network Error") {
        message.error("Không kết nối được máy chủ. Kiểm tra backend đang chạy và REACT_APP_API_URL (phải có /api, ví dụ http://localhost:5000/api).");
        return;
      }
      if (ax.response?.status === 429) {
        message.error(ax.response?.data?.message || "Thử đăng nhập quá nhiều lần. Đợi vài phút rồi thử lại.");
        return;
      }
      const d = ax.response?.data as
        | { message?: string; errors?: { msg?: string }[] }
        | undefined;
      const fromMsg = typeof d?.message === "string" && d.message.trim() ? d.message.trim() : "";
      const fromValidator = d?.errors?.[0]?.msg;
      const fromApi = fromMsg || fromValidator;
      message.error(fromApi || ax.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--hero-gradient)",
        padding: 24,
      }}
    >
      <Card
        title="Đăng nhập"
        style={{
          maxWidth: 400,
          width: "100%",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
      >
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="email" rules={[{ required: true, type: "email" }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Đăng nhập
            </Button>
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
