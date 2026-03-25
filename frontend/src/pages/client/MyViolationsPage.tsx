import React, { useEffect, useState, useCallback } from "react";
import { Card, Table, Tag, Statistic, Row, Col, Alert, Select, Space, Empty, Spin, message, Input } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { violationsApi } from "../../api";
import type { Violation } from "../../types";

const severityVi: Record<string, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
};

function defaultSchoolYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const MyViolationsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Violation[]>([]);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [semester, setSemester] = useState("HK1");
  const [stats, setStats] = useState<{ totalPoints: number; warning: { text: string; severity: string } } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, stRes] = await Promise.all([violationsApi.getMy(), violationsApi.getMyStats({ schoolYear, semester })]);
      setItems(listRes.data || []);
      setStats(stRes.data || null);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [schoolYear, semester]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const warnColor =
    stats?.warning?.severity === "critical"
      ? "error"
      : stats?.warning?.severity === "high"
        ? "warning"
        : stats?.warning?.severity === "medium"
          ? "warning"
          : "info";

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>
        <WarningOutlined /> Lịch sử vi phạm & điểm kỷ luật
      </h2>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>Điểm tích lũy theo học kỳ. Từ 7 điểm trở lên có thể bị xử lý buộc rời KTX theo quy định.</p>

      <Space style={{ marginBottom: 16 }} wrap align="center">
        <span>Năm học:</span>
        <Input style={{ width: 160 }} value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} placeholder="VD: 2025-2026" />
        <span>Học kỳ:</span>
        <Select style={{ width: 100 }} value={semester} onChange={setSemester} options={[{ value: "HK1", label: "HK1" }, { value: "HK2", label: "HK2" }, { value: "HK3", label: "HK3" }]} />
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={12}>
          <Card>
            <Statistic title="Tổng điểm vi phạm (kỳ đã chọn)" value={stats?.totalPoints ?? 0} suffix="điểm" />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <div style={{ color: "#64748b", fontSize: 13 }}>Mức xử lý gợi ý</div>
            <Tag color="blue" style={{ marginTop: 8, fontSize: 14, padding: "4px 10px" }}>
              {stats?.warning?.text || "—"}
            </Tag>
          </Card>
        </Col>
      </Row>

      {stats && stats.totalPoints >= 5 && (
        <Alert
          type={warnColor === "error" ? "error" : "warning"}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            stats.totalPoints >= 7
              ? "Bạn đã đạt ngưỡng 7 điểm — ban quản lý KTX sẽ xử lý theo quy định (có thể chấm dứt hợp đồng)."
              : `Bạn đang có ${stats.totalPoints} điểm. Nếu đạt 7 điểm có thể bị buộc rời KTX.`
          }
        />
      )}

      <Card title="Lịch sử vi phạm đã ghi nhận">
        {items.length === 0 ? (
          <Empty description="Chưa có vi phạm được ghi nhận" />
        ) : (
          <Table
            rowKey="_id"
            dataSource={items}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: "Ngày", key: "d", width: 170, render: (_: unknown, r: Violation) => (r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "-") },
              { title: "Vi phạm", dataIndex: "ruleName", ellipsis: true },
              { title: "Mức độ", dataIndex: "severity", width: 110, render: (s: string) => severityVi[s] || s },
              { title: "Điểm", dataIndex: "points", width: 70 },
              { title: "Phạt", dataIndex: "fineAmount", width: 110, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
              { title: "Bồi thường", dataIndex: "compensationAmount", width: 110, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
              {
                title: "Phòng",
                key: "room",
                width: 80,
                render: (_: unknown, r: Violation) => (typeof r.room === "object" ? r.room?.roomNumber : "-"),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
};

export default MyViolationsPage;
