import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message, Button, Card, Row, Col, Statistic, Modal } from "antd";
import { DollarOutlined, FileTextOutlined, EyeOutlined } from "@ant-design/icons";
import { billsApi } from "../../api";
import type { Bill } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "gold", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const formatMoney = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN") + "đ";

const MyBillsPage: React.FC = () => {
  const [data, setData] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<Bill | null>(null);

  const load = () => {
    billsApi.getMy().then((res) => setData(res.data || [])).catch(() => message.error("Không tải được")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handlePay = async (id: string) => {
    setPayingId(id);
    try {
      await billsApi.markPaid(id);
      message.success("Đã thanh toán thành công");
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Thanh toán thất bại");
    } finally {
      setPayingId(null);
    }
  };

  const unpaidBills = data.filter((b) => b.status === "pending" || b.status === "overdue");
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.total ?? 0), 0);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const columns = [
    { title: "Tháng/Năm", key: "monthYear", width: 90, render: (_: unknown, r: Bill) => <strong>{r.month}/{r.year}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    { title: "Tiền phòng", dataIndex: "roomFee", key: "roomFee", width: 110, render: (v: number) => formatMoney(v) },
    { title: "Điện", dataIndex: "electricityFee", key: "electricityFee", width: 90, render: (v: number) => formatMoney(v) },
    { title: "Nước", dataIndex: "waterFee", key: "waterFee", width: 90, render: (v: number) => formatMoney(v) },
    { title: "Tổng", dataIndex: "total", key: "total", width: 110, render: (v: number) => <strong style={{ color: "#0d9488" }}>{formatMoney(v)}</strong> },
    { title: "Hạn", dataIndex: "dueDate", key: "dueDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 220,
      render: (s: string, r: Bill) => (
        <>
          <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>
          {(s === "pending" || s === "overdue") && (
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              loading={payingId === r._id}
              onClick={() => handlePay(r._id)}
              style={{ marginLeft: 8 }}
            >
              Thanh toán
            </Button>
          )}
        </>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 90,
      render: (_: unknown, r: Bill) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>,
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><FileTextOutlined /> Hóa đơn của tôi</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Xem và thanh toán hóa đơn tiền phòng, điện nước</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Chưa thanh toán</span>} value={unpaidBills.length} suffix="đơn" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title="Tổng tiền nợ" value={unpaidTotal} formatter={(v) => formatMoney(Number(v))} />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        {data.length === 0 ? (
          <Empty description="Bạn chưa có hóa đơn cần thanh toán" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="_id"
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hóa đơn` }}
            size="middle"
          />
        )}
      </Card>

      <Modal title={`Chi tiết hóa đơn ${detailModal ? `${detailModal.month}/${detailModal.year}` : ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>]}>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Tháng/Năm:</strong> {detailModal.month}/{detailModal.year}</p>
            <p><strong>Phòng:</strong> {typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</p>
            <p><strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}</p>
            <p><strong>Điện:</strong> {formatMoney(detailModal.electricityFee)}</p>
            <p><strong>Nước:</strong> {formatMoney(detailModal.waterFee)}</p>
            {detailModal.otherFee != null && detailModal.otherFee > 0 && <p><strong>Khác:</strong> {formatMoney(detailModal.otherFee)}</p>}
            <p><strong>Tổng:</strong> <span style={{ color: "#0d9488", fontWeight: 600 }}>{formatMoney(detailModal.total)}</span></p>
            <p><strong>Hạn thanh toán:</strong> {new Date(detailModal.dueDate).toLocaleDateString("vi-VN")}</p>
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
            {(detailModal.status === "pending" || detailModal.status === "overdue") && (
              <Button type="primary" icon={<DollarOutlined />} onClick={() => { handlePay(detailModal._id); setDetailModal(null); }} style={{ marginTop: 12 }}>Thanh toán</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyBillsPage;
