import React, { useState, useEffect } from "react";
import { Layout, Menu, Dropdown, Button, Space } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  HomeOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  FileAddOutlined,
  DollarOutlined,
  BulbOutlined,
  CalendarOutlined,
  ToolOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import NotificationDropdown from "../components/NotificationDropdown";
import Footer from "../components/Footer";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { clearBlockingOverlays } from "../utils/clearBlockingOverlays";
import type { MenuProps } from "antd";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "/student", icon: <HomeOutlined />, label: "Trang chủ" },
  { key: "/student/rooms", icon: <UnorderedListOutlined />, label: "Danh sách phòng" },
  { key: "/student/dorm-registration", icon: <FileTextOutlined />, label: "Đăng ký nội trú" },
  { key: "/student/my-applications", icon: <FileAddOutlined />, label: "Đơn của tôi (KTX)" },
  { key: "/student/my-registrations", icon: <HistoryOutlined />, label: "Chuyển phòng (cũ)" },
  { key: "/student/my-contracts", icon: <FileTextOutlined />, label: "Hợp đồng" },
  { key: "/student/my-bills", icon: <DollarOutlined />, label: "Hóa đơn" },
  { key: "/student/my-violations", icon: <ExclamationCircleOutlined />, label: "Vi phạm của tôi" },
  { key: "/student/regulations", icon: <SafetyCertificateOutlined />, label: "Nội quy KTX" },
  { key: "/student/services", icon: <FileTextOutlined />, label: "Dịch vụ" },
  { key: "/student/damage-report", icon: <ToolOutlined />, label: "Khai báo hư hỏng" },
  { key: "/student/calendar", icon: <CalendarOutlined />, label: "Lịch" },
];

const ClientLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "Thông tin cá nhân", onClick: () => navigate("/student/profile") },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => { logout(); navigate("/student"); } },
  ];

  const selectedMenuKey =
    menuItems
      .map((m) => m.key)
      .sort((a, b) => b.length - a.length)
      .find((k) => location.pathname === k || location.pathname.startsWith(`${k}/`)) || "/student";

  useEffect(() => {
    clearBlockingOverlays();
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>
          {collapsed ? "FDORM" : "KTX FDORM"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--header-bg-solid)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: "rgba(255,255,255,0.85)" }}
            />
            <Button
              type="text"
              icon={<BulbOutlined />}
              onClick={toggleTheme}
              style={{ color: "rgba(255,255,255,0.85)" }}
              title={theme === "light" ? "Chế độ tối" : "Chế độ sáng"}
              aria-label="Đổi giao diện"
            />
          </Space>
          <Space size="small">
            {user && <NotificationDropdown />}
            {user ? (
              <Dropdown menu={{ items: userMenu }} placement="bottomRight">
                <Button type="text" style={{ color: "#fff" }}>
                  <Space size={4}>
                    <UserOutlined />
                    <span className="user-name">{user.fullName}</span>
                  </Space>
                </Button>
              </Dropdown>
            ) : (
              <Button type="primary" ghost size="small" onClick={() => navigate("/login")}>
                Đăng nhập
              </Button>
            )}
          </Space>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: "var(--admin-content-bg)", borderRadius: 12, minHeight: 280, position: "relative" }}>
          <Outlet key={location.pathname} />
        </Content>
        <Footer />
      </Layout>
    </Layout>
  );
};

export default ClientLayout;
