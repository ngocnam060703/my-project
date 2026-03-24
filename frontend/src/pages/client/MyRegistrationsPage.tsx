import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message, Button, Space, Card, Row, Col, Statistic, Modal } from "antd";
import { EyeOutlined, StopOutlined, FormOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { registrationsApi } from "../../api";
import type { Registration } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chờ duyệt" },
  approved: { color: "green", text: "Đã duyệt" },
  rejected: { color: "red", text: "Từ chối" },
};
const typeMap: Record<string, { color: string; text: string }> = {
  dorm: { color: "blue", text: "Nội trú mới" },
  transfer: { color: "purple", text: "Chuyển phòng" },
};

const MyRegistrationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Registration | null>(null);

  const load = () => {
    registrationsApi.getMy().then((res) => setData(res.data || [])).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCancel = (id: string) => {
    Modal.confirm({
      title: "Hủy đơn đăng ký?",
      content: "Bạn sẽ không thể hoàn tác. Chỉ hủy được khi đơn đang ở trạng thái Chờ duyệt.",
      okText: "Hủy đơn",
      okType: "danger",
      cancelText: "Đóng",
      onOk: async () => {
        try {
          await registrationsApi.cancel(id);
          message.success("Đã hủy đơn");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Hủy đơn thất bại");
        }
      },
    });
  };

  const pendingCount = data.filter((r) => r.status === "pending").length;
  const approvedCount = data.filter((r) => r.status === "approved").length;
  const rejectedCount = data.filter((r) => r.status === "rejected").length;

  const columns = [
    { title: "Mã đơn", dataIndex: "_id", key: "_id", width: 100, render: (id: string) => <strong>{id?.slice(-8).toUpperCase()}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    {
      title: "Loại đơn",
      key: "registrationType",
      width: 120,
      render: (_: unknown, r: Registration) => {
        const t = r.registrationType || "dorm";
        return <Tag color={typeMap[t]?.color}>{typeMap[t]?.text || t}</Tag>;
      },
    },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area", width: 90 },
    { title: "Học kỳ", dataIndex: "semester", key: "semester", width: 80 },
    { title: "Năm học", dataIndex: "schoolYear", key: "schoolYear", width: 100 },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: "Ngày đăng ký", dataIndex: "createdAt", key: "createdAt", width: 110, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    {
      title: "Hành động",
      key: "action",
      width: 180,
      render: (_: unknown, r: Registration) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          <Button type="link" size="small" onClick={() => navigate(`/student/rooms/${typeof r.room === "object" ? r.room?._id : r.room}`)}>Xem phòng</Button>
          {r.status === "pending" && (
            <Button type="link" danger size="small" icon={<StopOutlined />} onClick={() => handleCancel(r._id)}>
              Hủy đơn
            </Button>
          )}
        </Space>
      ),
    },
  ];

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><FormOutlined /> Đăng ký của tôi</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Xem lịch sử đơn đăng ký nội trú và trạng thái duyệt</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Chờ duyệt</span>} value={pendingCount} suffix="đơn" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Đã duyệt" value={approvedCount} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng đơn" value={data.length} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        {data.length === 0 ? (
          <Empty description="Chưa có đơn đăng ký nào" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="_id"
            expandable={{
              expandedRowRender: (r: Registration) =>
                r.status === "rejected" && r.rejectionReason ? (
                  <p style={{ margin: 0, color: "#cf1322" }}><strong>Lý do từ chối:</strong> {r.rejectionReason}</p>
                ) : null,
              rowExpandable: (r: Registration) => r.status === "rejected" && !!r.rejectionReason,
            }}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} đơn` }}
            size="middle"
          />
        )}
      </Card>

      <Modal title={`Chi tiết đơn ${detailModal ? (detailModal._id?.slice(-8).toUpperCase()) : ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>]}>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Mã đơn:</strong> {detailModal._id?.slice(-8).toUpperCase()}</p>
            <p><strong>Phòng:</strong> {typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</p>
            {(detailModal.registrationType || "dorm") === "transfer" && (
              <p><strong>Phòng hiện tại:</strong> {typeof detailModal.fromRoom === "object" ? detailModal.fromRoom?.roomNumber : "-"}</p>
            )}
            <p><strong>Loại đơn:</strong> <Tag color={typeMap[detailModal.registrationType || "dorm"]?.color}>{typeMap[detailModal.registrationType || "dorm"]?.text}</Tag></p>
            <p><strong>Khu:</strong> {typeof detailModal.room === "object" && detailModal.room?.area && typeof detailModal.room.area === "object" ? detailModal.room.area.name : "-"}</p>
            <p><strong>Học kỳ:</strong> {detailModal.semester}</p>
            <p><strong>Năm học:</strong> {detailModal.schoolYear}</p>
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
            <p><strong>Ngày đăng ký:</strong> {detailModal.createdAt ? new Date(detailModal.createdAt).toLocaleDateString("vi-VN") : "-"}</p>
            {detailModal.status === "rejected" && detailModal.rejectionReason && (
              <p style={{ color: "#cf1322" }}><strong>Lý do từ chối:</strong> {detailModal.rejectionReason}</p>
            )}
            {detailModal.note && String(detailModal.note).trim() !== "" && (
              <p style={{ color: "#ad6800" }}><strong>Ghi chú hệ thống:</strong> {detailModal.note}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyRegistrationsPage;
