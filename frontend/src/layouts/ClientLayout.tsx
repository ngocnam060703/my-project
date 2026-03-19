import React from "react";
import { Layout, Menu, Dropdown, Button, Space } from "antd";
import { UserOutlined, LogoutOutlined, HomeOutlined, UnorderedListOutlined, FileTextOutlined, DollarOutlined, BulbOutlined, CalendarOutlined } from "@ant-design/icons";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import type { MenuProps } from "antd";

const { Header, Content } = Layout;

const ClientLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const menuItems = [
    { key: "/", icon: <HomeOutlined />, label: "Trang chủ" },
    { key: "/rooms", icon: <UnorderedListOutlined />, label: "Danh sách phòng" },
    { key: "/my-registrations", icon: <FileTextOutlined />, label: "Đăng ký của tôi" },
    { key: "/my-contracts", icon: <FileTextOutlined />, label: "Hợp đồng" },
    { key: "/my-bills", icon: <DollarOutlined />, label: "Hóa đơn" },
    { key: "/calendar", icon: <CalendarOutlined />, label: "Lịch" },
    { key: "/profile", icon: <UserOutlined />, label: "Tài khoản" },
  ];

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "Thông tin cá nhân", onClick: () => navigate("/profile") },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => { logout(); navigate("/"); } },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#001529" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h2 style={{ color: "white", margin: 0 }}>KTX FDORM</h2>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 400 }}
          />
        </div>
        <Button type="text" icon={<BulbOutlined />} onClick={toggleTheme} style={{ color: "white" }} title={theme === "light" ? "Chế độ tối" : "Chế độ sáng"} />
        {user ? (
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Button type="text" style={{ color: "white" }}>
              <Space>
                <UserOutlined />
                {user.fullName}
              </Space>
            </Button>
          </Dropdown>
        ) : (
          <Button type="primary" ghost onClick={() => navigate("/login")}>Đăng nhập</Button>
        )}
      </Header>
      <Content style={{ padding: 24, background: "#f0f2f5" }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default ClientLayout;
