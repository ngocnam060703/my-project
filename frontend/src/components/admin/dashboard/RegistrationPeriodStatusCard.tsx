import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Space, Tag } from "antd";
import dayjs from "dayjs";
import {
  buildRegistrationStatusDetail,
  formatCountdownTo,
  getRegistrationPeriodStatus,
  pickDisplayRegistrationPeriod,
  REGISTRATION_STATUS_COLOR,
  REGISTRATION_STATUS_LABEL,
  type RegistrationPeriodLike,
} from "../../../utils/registrationPeriodStatus";

export interface RegistrationPeriodStatusCardProps {
  periods: RegistrationPeriodLike[];
  loading: boolean;
  error: string | null;
  nowMs: number;
  onRetry: () => void;
  onCreateClick: () => void;
}

const RegistrationPeriodStatusCard: React.FC<RegistrationPeriodStatusCardProps> = ({
  periods,
  loading,
  error,
  nowMs,
  onRetry,
  onCreateClick,
}) => {
  const displayPeriod = useMemo(() => pickDisplayRegistrationPeriod(periods, nowMs), [periods, nowMs]);
  const status = displayPeriod ? getRegistrationPeriodStatus(displayPeriod, nowMs) : null;
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!displayPeriod || !status || status === "closed") {
      setCountdown("");
      return;
    }

    const target =
      status === "open" ? displayPeriod.endDate : displayPeriod.startDate;

    const tick = () => setCountdown(formatCountdownTo(target, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [displayPeriod?._id, displayPeriod?.startDate, displayPeriod?.endDate, status]);

  const detail = buildRegistrationStatusDetail(displayPeriod, nowMs, countdown || undefined);

  return (
    <Card
      title="Trạng thái đăng ký nội trú"
      loading={loading}
      extra={
        <Button type="link" onClick={onCreateClick}>
          Tạo đợt
        </Button>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={onRetry}>
              Thử lại
            </Button>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Đăng ký nội trú</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{detail}</div>
          </div>
          {status ? (
            <Tag color={REGISTRATION_STATUS_COLOR[status]} style={{ margin: 0, fontSize: 13, padding: "2px 10px" }}>
              {REGISTRATION_STATUS_LABEL[status]}
            </Tag>
          ) : (
            <Tag color="default">Chưa có đợt</Tag>
          )}
        </div>

        {displayPeriod ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Từ {dayjs(displayPeriod.startDate).format("DD/MM/YYYY HH:mm")} đến{" "}
            {dayjs(displayPeriod.endDate).format("DD/MM/YYYY HH:mm")} — trạng thái tự cập nhật theo thời gian.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Tạo đợt với thời gian bắt đầu và kết thúc; hệ thống tự mở/đóng, không cần bật/tắt thủ công.
          </div>
        )}
      </Space>
    </Card>
  );
};

export default RegistrationPeriodStatusCard;
