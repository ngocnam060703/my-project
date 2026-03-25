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
const formatBillDate = (r: Bill) => {
  const created = (r as Bill & { createdAt?: string }).createdAt;
  if (created) return new Date(created).toLocaleDateString("vi-VN");
  return new Date(r.year, Math.max(0, (r.month || 1) - 1), 1).toLocaleDateString("vi-VN");
};
const normalizeBillingNote = (note?: string) =>
  String(note || "").replace(/dịch vụ chung/gi, "wifi");

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

  const monthlyBills = data.filter((b) => b.billType !== "penalty");
  const penaltyBills = data.filter((b) => b.billType === "penalty");
  const unpaidBills = data.filter((b) => b.status === "pending" || b.status === "overdue");
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.total ?? 0), 0);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const monthlyColumns = [
    { title: "Ngày tháng năm", key: "billDate", width: 120, render: (_: unknown, r: Bill) => <strong>{formatBillDate(r)}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    { title: "Tiền phòng", dataIndex: "roomFee", key: "roomFee", width: 110, render: (v: number) => formatMoney(v) },
    { title: "Điện", dataIndex: "electricityFee", key: "electricityFee", width: 90, render: (v: number) => formatMoney(v) },
    { title: "Nước", dataIndex: "waterFee", key: "waterFee", width: 90, render: (v: number) => formatMoney(v) },
    { title: "Wifi", dataIndex: "sharedCommonFee", key: "sharedCommonFee", width: 90, render: (v: number) => (v ? formatMoney(v) : "-") },
    { title: "Dịch vụ cá nhân", dataIndex: "personalServiceFee", key: "personalServiceFee", width: 120, render: (v: number) => (v ? formatMoney(v) : "-") },
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

  const penaltyColumns = [
    { title: "Ngày tháng năm", key: "billDate", width: 120, render: (_: unknown, r: Bill) => <strong>{formatBillDate(r)}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    {
      title: "Mục phạt / bồi thường",
      key: "pen",
      render: (_: unknown, r: Bill) => (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(r.penaltyBreakdown || []).map((line, i) => (
            <li key={i}>{line.label}: {formatMoney(line.amount)}</li>
          ))}
        </ul>
      ),
    },
    { title: "Tổng", dataIndex: "total", key: "total", width: 110, render: (v: number) => <strong style={{ color: "#cf1322" }}>{formatMoney(v)}</strong> },
    { title: "Hạn", dataIndex: "dueDate", key: "dueDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 200,
      render: (s: string, r: Bill) => (
        <>
          <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>
          {(s === "pending" || s === "overdue") && (
            <Button type="primary" size="small" icon={<DollarOutlined />} loading={payingId === r._id} onClick={() => handlePay(r._id)} style={{ marginLeft: 8 }}>
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
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Hóa đơn tháng (phòng, điện nước, dịch vụ) và hóa đơn phạt vi phạm (nếu có) hiển thị riêng.</p>
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

      <Card title="Hóa đơn phạt vi phạm" style={{ borderRadius: 12, marginBottom: 16 }}>
        {penaltyBills.length === 0 ? (
          <Empty description="Không có hóa đơn phạt" />
        ) : (
          <Table
            columns={penaltyColumns}
            dataSource={penaltyBills}
            rowKey="_id"
            pagination={{ pageSize: 5, showSizeChanger: false }}
            size="middle"
          />
        )}
      </Card>

      <Card title="Hóa đơn tháng (phòng & dịch vụ)" style={{ borderRadius: 12 }}>
        {monthlyBills.length === 0 ? (
          <Empty description="Chưa có hóa đơn tháng" />
        ) : (
          <Table
            columns={monthlyColumns}
            dataSource={monthlyBills}
            rowKey="_id"
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hóa đơn` }}
            size="middle"
          />
        )}
      </Card>

      <Modal title={`Chi tiết hóa đơn ${detailModal ? `${detailModal.month}/${detailModal.year}` : ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>]}>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Loại:</strong> {detailModal.billType === "penalty" ? <Tag color="red">Phạt vi phạm</Tag> : <Tag color="blue">Hóa đơn tháng</Tag>}</p>
            <p><strong>Ngày tháng năm:</strong> {formatBillDate(detailModal)}</p>
            <p><strong>Phòng:</strong> {typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</p>
            {detailModal.billType === "penalty" ? (
              <>
                <p><strong>Mục phạt:</strong></p>
                <ul style={{ margin: "0 0 12px 18px" }}>
                  {(detailModal.penaltyBreakdown || []).map((line, i) => (
                    <li key={i}>{line.label}: {formatMoney(line.amount)}</li>
                  ))}
                </ul>
                {typeof detailModal.violation === "object" && detailModal.violation?.ruleName && (
                  <p><strong>Vi phạm:</strong> {detailModal.violation.ruleName}</p>
                )}
                {typeof detailModal.violation === "object" && detailModal.violation?.description && (
                  <p><strong>Mô tả:</strong> {detailModal.violation.description}</p>
                )}
              </>
            ) : (
              <>
                <p><strong>Số người trong phòng:</strong> {detailModal.occupants || 1}</p>
                <p><strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}</p>
                <p><strong>Điện:</strong> {formatMoney(detailModal.electricityFee)}</p>
                <p><strong>Nước:</strong> {formatMoney(detailModal.waterFee)}</p>
                {detailModal.sharedCommonFee ? <p><strong>Wifi:</strong> {formatMoney(detailModal.sharedCommonFee)}</p> : null}
                {detailModal.otherFee != null && detailModal.otherFee > 0 && <p><strong>Khác:</strong> {formatMoney(detailModal.otherFee)}</p>}
                {detailModal.personalServiceFee ? <p><strong>Dịch vụ cá nhân:</strong> {formatMoney(detailModal.personalServiceFee)}</p> : null}
                {(detailModal.personalServiceBreakdown?.length || 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Chi tiết dịch vụ cá nhân:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {detailModal.personalServiceBreakdown?.map((it, idx) => (
                        <li key={`${it.service || it.name || "svc"}-${idx}`}>
                          {it.name || "Dịch vụ"}: {formatMoney(it.amount || 0)}
                          {it.unit === "once" ? ` (${it.quantity || 0} lần)` : " (/ tháng)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailModal.note ? <p style={{ color: "#6b7280" }}><strong>Cách tính:</strong> {normalizeBillingNote(detailModal.note)}</p> : null}
              </>
            )}
            <p><strong>Tổng:</strong> <span style={{ color: detailModal.billType === "penalty" ? "#cf1322" : "#0d9488", fontWeight: 600 }}>{formatMoney(detailModal.total)}</span></p>
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
