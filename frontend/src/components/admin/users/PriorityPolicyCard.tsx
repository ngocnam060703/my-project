import React from "react";
import { Card, Descriptions, Empty } from "antd";
import { formatPriorityType, isPriorityProofRequired } from "../../../utils/priorityDisplay";

export interface PriorityPolicyCardProps {
  priorityType?: string | null;
  priorityProofUrl?: string | null;
}

const PriorityPolicyCard: React.FC<PriorityPolicyCardProps> = ({ priorityType, priorityProofUrl }) => {
  const type = priorityType || "normal";
  const label = formatPriorityType(type);
  const needsProof = isPriorityProofRequired(type);
  const proof = String(priorityProofUrl || "").trim();

  return (
    <Card size="small" title="Diện chính sách / ưu tiên" className="user-detail-section" style={{ borderRadius: 10 }}>
      {type === "normal" && !proof ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Sinh viên chưa khai báo diện ưu tiên — mặc định Bình thường"
        />
      ) : (
        <Descriptions column={{ xs: 1, sm: 1, md: 2 }} size="small">
          <Descriptions.Item label="Đối tượng ưu tiên">{label}</Descriptions.Item>
          <Descriptions.Item label="Diện ưu tiên">{label}</Descriptions.Item>
          <Descriptions.Item label="Minh chứng ưu tiên" span={2}>
            {proof ? (
              proof.startsWith("blob:") ? (
                <span className="user-detail-long-text" style={{ color: "#6b7280" }}>
                  Sinh viên đã chọn file minh chứng (chưa lưu URL công khai). Yêu cầu SV tải lại hoặc admin nhập URL minh chứng.
                </span>
              ) : (
                <a href={proof} target="_blank" rel="noreferrer">
                  Xem minh chứng
                </a>
              )
            ) : needsProof ? (
              <span style={{ color: "#dc2626" }}>Chưa có minh chứng</span>
            ) : (
              "—"
            )}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
};

export default PriorityPolicyCard;
