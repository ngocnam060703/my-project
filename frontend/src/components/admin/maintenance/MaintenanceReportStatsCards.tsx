import React from "react";
import { Card, Col, Row, Statistic } from "antd";

export type MaintenanceSummary = {
  totalAll?: number;
  pendingCount?: number;
  resolvedCount?: number;
  cancelledCount?: number;
  processingCount?: number;
};

type Props = {
  summary: MaintenanceSummary;
};

const cardStyle = (from: string, to: string): React.CSSProperties => ({
  background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  color: "white",
  border: "none",
});

const titleStyle: React.CSSProperties = { color: "rgba(255,255,255,0.9)" };
const valueStyle: React.CSSProperties = { color: "#fff", fontSize: 22 };

const MaintenanceReportStatsCards: React.FC<Props> = ({ summary }) => (
  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={cardStyle("#0d9488", "#134e4a")}>
        <Statistic
          title={<span style={titleStyle}>Tổng khai báo</span>}
          value={summary.totalAll ?? 0}
          suffix="đơn"
          valueStyle={valueStyle}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={cardStyle("#d97706", "#92400e")}>
        <Statistic
          title={<span style={titleStyle}>Chờ kiểm tra</span>}
          value={summary.pendingCount ?? 0}
          suffix="đơn"
          valueStyle={valueStyle}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={cardStyle("#059669", "#047857")}>
        <Statistic
          title={<span style={titleStyle}>Đã khắc phục</span>}
          value={summary.resolvedCount ?? 0}
          suffix="đơn"
          valueStyle={valueStyle}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card bordered={false} style={cardStyle("#64748b", "#334155")}>
        <Statistic
          title={<span style={titleStyle}>Đơn đã hủy</span>}
          value={summary.cancelledCount ?? 0}
          suffix="đơn"
          valueStyle={valueStyle}
        />
      </Card>
    </Col>
  </Row>
);

export default MaintenanceReportStatsCards;
