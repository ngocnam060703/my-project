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
    { key: "/admin/registrations", icon: <FileAddOutlined />, label: "Đơn đăng ký" },
    { key: "/admin/contracts", icon: <FileTextOutlined />, label: "Hợp đồng" },
    { key: "/admin/bills", icon: <DollarOutlined />, label: "Hóa đơn" },
  ];

  const userMenu: MenuProps["items"] = [
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => { logout(); navigate("/"); } },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>
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
          background: "#001529",
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
        <Content style={{ margin: 24, padding: 24, background: "#fff", borderRadius: 8, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
