import React from "react";
import { Card, Statistic, Skeleton } from "antd";
import type { StatisticProps } from "antd";
import { useNavigate } from "react-router-dom";
import "./dashboard-stat-card.css";

export interface DashboardStatCardProps {
  title: string;
  value: number;
  to: string;
  prefix?: React.ReactNode;
  formatter?: StatisticProps["formatter"];
  loading?: boolean;
  /** Dòng phụ dưới số liệu (vd. phân loại đơn chờ duyệt) */
  description?: string;
}

const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  title,
  value,
  to,
  prefix,
  formatter,
  loading = false,
  description,
}) => {
  const navigate = useNavigate();

  return (
    <Card
      hoverable
      className="dashboard-stat-card"
      onClick={() => navigate(to)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : (
        <>
          <Statistic title={title} value={value} prefix={prefix} formatter={formatter} />
          {description ? (
            <div className="small text-muted mt-2" style={{ lineHeight: 1.35 }}>
              {description}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
};

export default DashboardStatCard;
