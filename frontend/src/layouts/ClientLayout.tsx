import React, { useState } from "react";
import { Layout, Menu, Dropdown, Button, Space, Drawer } from "antd";
import { UserOutlined, LogoutOutlined, HomeOutlined, UnorderedListOutlined, FileTextOutlined, DollarOutlined, BulbOutlined, CalendarOutlined, MenuOutlined, ToolOutlined } from "@ant-design/icons";
import NotificationDropdown from "../components/NotificationDropdown";
import Footer from "../components/Footer";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import type { MenuProps } from "antd";

const { Header, Content } = Layout;

const menuItems = [
  { key: "/student", icon: <HomeOutlined />, label: "Trang chủ" },
  { key: "/student/rooms", icon: <UnorderedListOutlined />, label: "Danh sách phòng" },
  { key: "/student/dorm-registration", icon: <FileTextOutlined />, label: "Đăng ký nội trú" },
  { key: "/student/my-registrations", icon: <FileTextOutlined />, label: "Đơn của tôi" },
  { key: "/student/my-contracts", icon: <FileTextOutlined />, label: "Hợp đồng" },
  { key: "/student/my-bills", icon: <DollarOutlined />, label: "Hóa đơn" },
  { key: "/student/damage-report", icon: <ToolOutlined />, label: "Khai báo hư hỏng" },
  { key: "/student/calendar", icon: <CalendarOutlined />, label: "Lịch" },
];

const ClientLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "Thông tin cá nhân", onClick: () => navigate("/student/profile") },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => { logout(); navigate("/student"); } },
  ];

  const handleMenuClick = (key: string) => {
    navigate(key);
    setMobileMenuOpen(false);
  };

  const selectedMenuKey =
    menuItems.map((m) => m.key).find((k) => location.pathname === k || location.pathname.startsWith(`${k}/`)) ||
    location.pathname;

  return (
    <Layout style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--header-bg)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", padding: "0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileMenuOpen(true)}
            style={{ color: "white", display: "block" }}
            className="mobile-menu-btn"
          />
          <h2 style={{ color: "white", margin: 0, fontWeight: 700, fontSize: 18 }}>KTX FDORM</h2>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[selectedMenuKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 320, borderBottom: "none" }}
            className="desktop-menu"
          />
        </div>
        <Space size="small">
          <Button type="text" icon={<BulbOutlined />} onClick={toggleTheme} style={{ color: "white" }} title={theme === "light" ? "Chế độ tối" : "Chế độ sáng"} aria-label="Đổi giao diện" />
          {user && <NotificationDropdown />}
          {user ? (
            <Dropdown menu={{ items: userMenu }} placement="bottomRight">
              <Button type="text" style={{ color: "white" }}>
                <Space size={4}>
                  <UserOutlined />
                  <span className="user-name">{user.fullName}</span>
                </Space>
              </Button>
            </Dropdown>
          ) : (
            <Button type="primary" ghost size="small" onClick={() => navigate("/login")}>Đăng nhập</Button>
          )}
        </Space>
      </Header>
      <Content style={{ padding: "16px 24px", background: "var(--bg-content)", flex: 1 }}>
        <Outlet />
      </Content>
      <Footer />
      <Drawer
        title="Menu"
        placement="left"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
          style={{ height: "100%", borderRight: "none" }}
        />
      </Drawer>
    </Layout>
  );
};

export default ClientLayout;
