import React, { useState, useEffect } from "react";
import { Row, Col, Card, Typography, Button, Spin, Tag, Statistic } from "antd";
import {
  HomeOutlined,
  UnorderedListOutlined,
  FileAddOutlined,
  TeamOutlined,
  FileTextOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { studentDashboardApi } from "../../api";

const { Title, Paragraph, Text } = Typography;

interface DashboardData {
  studentStatus: string;
  memberStatusLabel?: string;
  room: {
    roomNumber: string;
    area?: string | { name?: string };
    floor: number;
    roomType: string;
    sectionTitle?: string;
    contextLabel?: string;
  } | null;
  contract: { startDate: string; endDate: string; daysLeft: number } | null;
  unpaidTotal: number;
  unpaidCount: number;
  registrationPeriod: {
    isOpen: boolean;
    startDate?: string;
    endDate?: string;
    name?: string;
    nextPeriod?: { name: string; startDate: string; endDate: string } | null;
  } | null;
}

const DEFAULT_DATA: DashboardData = {
  studentStatus: "not_registered",
  room: null,
  contract: null,
  unpaidTotal: 0,
  unpaidCount: 0,
  registrationPeriod: { isOpen: false },
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    studentDashboardApi
      .get()
      .then((res) => setData(res.data))
      .catch(() => setData(DEFAULT_DATA))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!data?.registrationPeriod?.isOpen || !data.registrationPeriod.endDate) return;
    const end = new Date(data.registrationPeriod.endDate);
    const tick = () => {
      const now = new Date();
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown("Đã kết thúc");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${d} ngày ${h} giờ ${m} phút`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [data?.registrationPeriod?.isOpen, data?.registrationPeriod?.endDate]);

  if (!user) {
    return (
      <div>
        <div
          style={{
            background: "var(--hero-gradient)",
            padding: 60,
            borderRadius: 16,
            marginBottom: 32,
            color: "white",
            textAlign: "center",
            boxShadow: "0 20px 40px rgba(13, 148, 136, 0.2)",
          }}
        >
          <Title level={1} style={{ color: "white", marginBottom: 16, fontWeight: 700 }}>
            KTX FDORM
          </Title>
          <Paragraph style={{ fontSize: 18, color: "rgba(255,255,255,0.95)", maxWidth: 600, margin: "0 auto" }}>
            Hệ thống quản lý KTX FDORM. Đăng nhập để xem Dashboard cá nhân.
          </Paragraph>
        </div>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Card hoverable onClick={() => navigate("/student/rooms")} style={{ textAlign: "center", cursor: "pointer", borderRadius: 12 }}>
              <HomeOutlined style={{ fontSize: 48, color: "var(--card-accent-1)", marginBottom: 16 }} />
              <Title level={4}>Xem phòng</Title>
              <Button type="primary" onClick={() => navigate("/login")}>Đăng nhập</Button>
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }
  const dashboardData = data || DEFAULT_DATA;

  const statusText: Record<string, string> = {
    not_registered: "Bạn chưa đăng ký nội trú",
    pending: "Đơn của bạn đang chờ duyệt",
    approved_waiting_payment: "Đơn đã duyệt, vui lòng thanh toán",
    member: "Bạn đã là thành viên KTX",
  };

  return (
    <div>
      <div
        style={{
          background: "var(--hero-gradient)",
          padding: 40,
          borderRadius: 16,
          marginBottom: 24,
          color: "white",
          boxShadow: "0 20px 40px rgba(13, 148, 136, 0.2)",
        }}
      >
        <Title level={2} style={{ color: "white", marginBottom: 8 }}>
          Dashboard
        </Title>
        <Tag color={dashboardData.studentStatus === "member" ? "green" : dashboardData.studentStatus === "pending" ? "gold" : "default"} style={{ marginBottom: 16 }}>
          {statusText[dashboardData.studentStatus] || dashboardData.studentStatus}
        </Tag>
        {dashboardData.registrationPeriod?.isOpen ? (
          <div style={{ marginTop: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.9)" }}>Đăng ký nội trú đang mở — Còn lại: </Text>
            <Text strong style={{ color: "white", fontSize: 16 }}>{countdown || "Đang tính..."}</Text>
          </div>
        ) : (
          <Text style={{ color: "rgba(255,255,255,0.9)" }}>Đăng ký nội trú đã đóng</Text>
        )}
      </div>

      <Row gutter={[16, 16]}>
        {dashboardData.room && (
          <Col xs={24} md={12}>
            <Card
              title={(dashboardData.room as { sectionTitle?: string }).sectionTitle || "Phòng ở"}
              style={{ borderRadius: 12 }}
            >
              {(dashboardData.room as { contextLabel?: string }).contextLabel && (
                <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
                  {(dashboardData.room as { contextLabel?: string }).contextLabel}
                </p>
              )}
              <p><strong>Mã phòng:</strong> {dashboardData.room.roomNumber}</p>
              <p>
                <strong>Khu:</strong>{" "}
                {typeof dashboardData.room.area === "object" && dashboardData.room.area != null && "name" in dashboardData.room.area
                  ? String((dashboardData.room.area as { name?: string }).name ?? "—")
                  : String(dashboardData.room.area ?? "—")}
              </p>
              <p><strong>Tầng:</strong> {dashboardData.room.floor}</p>
              <p><strong>Loại phòng:</strong> {dashboardData.room.roomType}</p>
            </Card>
          </Col>
        )}
        {dashboardData.contract && (
          <Col xs={24} md={12}>
            <Card title="Hợp đồng" style={{ borderRadius: 12 }}>
              <p><strong>Ngày bắt đầu:</strong> {new Date(dashboardData.contract.startDate).toLocaleDateString("vi-VN")}</p>
              <p><strong>Ngày kết thúc:</strong> {new Date(dashboardData.contract.endDate).toLocaleDateString("vi-VN")}</p>
              <Statistic title="Số ngày còn lại" value={dashboardData.contract.daysLeft} suffix="ngày" />
              <Button type="link" onClick={() => navigate("/student/my-contracts")} style={{ padding: 0 }}>Xem chi tiết</Button>
            </Card>
          </Col>
        )}
        <Col xs={24} md={12}>
          <Card title="Hóa đơn" style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng chưa thanh toán"
              value={dashboardData.unpaidTotal}
              formatter={(v) => `${Number(v)?.toLocaleString("vi-VN")}đ`}
            />
            <p><Tag color={dashboardData.unpaidCount > 0 ? "gold" : "green"}>{dashboardData.unpaidCount > 0 ? "Chưa thanh toán" : "Đã thanh toán"}</Tag></p>
            <Button type="primary" onClick={() => navigate("/student/my-bills")}>Xem hóa đơn</Button>
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/student/rooms")} style={{ textAlign: "center", cursor: "pointer", borderRadius: 12 }}>
            <UnorderedListOutlined style={{ fontSize: 48, color: "var(--card-accent-1)", marginBottom: 16 }} />
            <Title level={4}>Xem phòng trống</Title>
            <Paragraph>Danh sách phòng và đăng ký</Paragraph>
            <Button type="primary">Xem danh sách</Button>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/student/my-registrations")} style={{ textAlign: "center", cursor: "pointer", borderRadius: 12 }}>
            <FileAddOutlined style={{ fontSize: 48, color: "var(--card-accent-2)", marginBottom: 16 }} />
            <Title level={4}>Đăng ký của tôi</Title>
            <Paragraph>Đơn đăng ký nội trú</Paragraph>
            <Button type="primary" ghost>Xem đơn</Button>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/student/my-bills")} style={{ textAlign: "center", cursor: "pointer", borderRadius: 12 }}>
            <DollarOutlined style={{ fontSize: 48, color: "var(--card-accent-3)", marginBottom: 16 }} />
            <Title level={4}>Hóa đơn</Title>
            <Paragraph>Thanh toán hóa đơn</Paragraph>
            <Button type="primary" ghost>Xem hóa đơn</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default HomePage;
