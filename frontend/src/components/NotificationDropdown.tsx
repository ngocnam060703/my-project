import React, { useState, useEffect } from "react";
import { Badge, Dropdown, List, Button, Empty, Spin } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../api";
import type { MenuProps } from "antd";

interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

const NotificationDropdown: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.getMy({ limit: 15 });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleRead = async (id: string, link?: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      setOpen(false);
      if (link) navigate(link);
    } catch {
      if (link) navigate(link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const content = (
    <div style={{ width: 360, maxHeight: 400, overflow: "auto" }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Thông báo</strong>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllRead}>Đánh dấu đã đọc</Button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center" }}><Spin /></div>
      ) : notifications.length === 0 ? (
        <Empty description="Không có thông báo" style={{ padding: 24 }} />
      ) : (
        <List
          size="small"
          dataSource={notifications}
          renderItem={(n) => (
            <List.Item
              style={{ cursor: "pointer", background: n.isRead ? undefined : "#f6ffed", padding: "12px 16px" }}
              onClick={() => handleRead(n._id, n.link)}
            >
              <List.Item.Meta
                title={n.title}
                description={<><span style={{ fontSize: 12 }}>{n.message}</span><br /><span style={{ color: "#999", fontSize: 11 }}>{new Date(n.createdAt).toLocaleString("vi-VN")}</span></>}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown dropdownRender={() => content} trigger={["click"]} open={open} onOpenChange={setOpen}>
      <Badge count={unreadCount} size="small">
        <Button type="text" icon={<BellOutlined />} style={{ color: "white" }} title="Thông báo" />
      </Badge>
    </Dropdown>
  );
};

export default NotificationDropdown;
