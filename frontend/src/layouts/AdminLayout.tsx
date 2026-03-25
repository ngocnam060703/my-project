import React, { useState } from "react";
import { Layout, Menu, Dropdown, Button, Space } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  BankOutlined,
  HomeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  DollarOutlined,
  ToolOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import type { MenuProps } from "antd";

const { Header, Sider, Content } = Layout;

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const menuItems = [
    { key: "/admin", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/admin/users", icon: <TeamOutlined />, label: "Quản lý người dùng" },
    { key: "/admin/areas", icon: <BankOutlined />, label: "Quản lý khu" },
    { key: "/admin/rooms", icon: <HomeOutlined />, label: "Quản lý phòng" },
    { key: "/admin/registrations", icon: <FileAddOutlined />, label: "Xét duyệt đơn" },
    { key: "/admin/contracts", icon: <FileTextOutlined />, label: "Hợp đồng" },
    { key: "/admin/bills", icon: <DollarOutlined />, label: "Hóa đơn" },
    { key: "/admin/violations", icon: <ExclamationCircleOutlined />, label: "Vi phạm kỷ luật" },
    { key: "/admin/services", icon: <AppstoreOutlined />, label: "Dịch vụ" },
    { key: "/admin/facilities", icon: <ToolOutlined />, label: "Quản lý CSVC" },
  ];

  const userMenu: MenuProps["items"] = [
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => { logout(); navigate("/student"); } },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>
          {collapsed ? "FDORM" : "KTX FDORM"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--header-bg-solid)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}>
          <Space>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} style={{ color: "rgba(255,255,255,0.85)" }} />
            <Button type="text" icon={<BulbOutlined />} onClick={toggleTheme} title={theme === "light" ? "Chế độ tối" : "Chế độ sáng"} style={{ color: "rgba(255,255,255,0.85)" }} />
          </Space>
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Button type="text" style={{ color: "#fff" }}>
              <Space>
                <UserOutlined />
                {user?.fullName} ({user?.role})
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: "var(--admin-content-bg)", borderRadius: 12, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
