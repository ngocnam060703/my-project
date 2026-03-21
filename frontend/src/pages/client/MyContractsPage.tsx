import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message, Button, Card, Row, Col, Statistic, Modal } from "antd";
import { ReloadOutlined, FileTextOutlined, EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { contractsApi } from "../../api";
import type { Contract } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: "green", text: "Đang hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã chấm dứt" },
};

const MyContractsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Contract | null>(null);

  useEffect(() => {
    contractsApi.getMy().then((res) => setData(res.data || [])).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  }, []);

  const activeCount = data.filter((c) => c.status === "active").length;

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const columns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "contractNumber", width: 140, render: (v: string) => <strong>{v || "-"}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area", width: 90 },
    { title: "Từ ngày", dataIndex: "startDate", key: "startDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Đến ngày", dataIndex: "endDate", key: "endDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Trạng thái", dataIndex: "status", key: "status", width: 120, render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
    {
      title: "Hành động",
      key: "action",
      width: 180,
      render: (_: unknown, r: Contract) => (
        <>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          {r.status === "active" && (
            <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => navigate(`/contract-renewal/${r._id}`)}>Gia hạn</Button>
          )}
        </>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><FileTextOutlined /> Hợp đồng của tôi</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Xem hợp đồng thuê phòng và gia hạn khi cần</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Đang hiệu lực</span>} value={activeCount} suffix="hợp đồng" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title="Tổng hợp đồng" value={data.length} suffix="hợp đồng" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        {data.length === 0 ? (
          <Empty description="Chưa có hợp đồng nào" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="_id"
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hợp đồng` }}
            size="middle"
          />
        )}
      </Card>

      <Modal title={`Chi tiết HĐ ${detailModal?.contractNumber || ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={
        <>
          <Button onClick={() => setDetailModal(null)}>Đóng</Button>
          {detailModal?.status === "active" && (
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => { setDetailModal(null); navigate(`/contract-renewal/${detailModal._id}`); }} style={{ marginLeft: 8 }}>Gia hạn</Button>
          )}
        </>
      }>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Số HĐ:</strong> {detailModal.contractNumber}</p>
            <p><strong>Phòng:</strong> {typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</p>
            <p><strong>Khu:</strong> {typeof detailModal.room === "object" && detailModal.room?.area && typeof detailModal.room.area === "object" ? detailModal.room.area.name : "-"}</p>
            <p><strong>Từ ngày:</strong> {new Date(detailModal.startDate).toLocaleDateString("vi-VN")}</p>
            <p><strong>Đến ngày:</strong> {new Date(detailModal.endDate).toLocaleDateString("vi-VN")}</p>
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyContractsPage;
