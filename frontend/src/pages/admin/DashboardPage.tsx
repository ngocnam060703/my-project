import React, { useState, useEffect } from "react";
import { Row, Col, Card, Statistic, Spin, Progress } from "antd";
import { HomeOutlined, TeamOutlined, FileAddOutlined, DollarOutlined } from "@ant-design/icons";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { dashboardApi } from "../../api";

interface DashboardStats {
  totalRooms?: number;
  availableRooms?: number;
  totalStudents?: number;
  pendingRegistrations?: number;
  roomByArea?: { _id: string; total: number; available: number }[];
  revenueByMonth?: { _id: { year: number; month: number }; total: number }[];
  occupancyRate?: number;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getStats().then((res) => setStats(res.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const s: DashboardStats = stats || {};
  const roomByArea = s.roomByArea || [];
  const revenueByMonth = (s.revenueByMonth || []).map((r) => ({ month: `${r._id.month}/${r._id.year}`, doanhThu: r.total }));

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Tổng phòng" value={s.totalRooms ?? 0} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Phòng trống" value={s.availableRooms ?? 0} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Sinh viên" value={s.totalStudents ?? 0} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Đơn chờ duyệt" value={s.pendingRegistrations ?? 0} prefix={<FileAddOutlined />} /></Card>
        </Col>
      </Row>
      <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Tỉ lệ phòng trống">
            <Progress type="circle" percent={100 - (s.occupancyRate ?? 0)} format={(p) => `${p}% trống`} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Thống kê phòng theo khu">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roomByArea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="_id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#0d9488" name="Tổng" />
                <Bar dataKey="available" fill="#059669" name="Trống" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Doanh thu theo tháng (đã thanh toán)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`${Number(v)?.toLocaleString("vi-VN")}đ`, "Doanh thu"]} />
                <Line type="monotone" dataKey="doanhThu" stroke="#0d9488" strokeWidth={2} name="Doanh thu" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
