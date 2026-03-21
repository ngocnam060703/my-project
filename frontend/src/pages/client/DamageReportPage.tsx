import React, { useState, useEffect } from "react";
import { Card, Form, Input, Select, Button, message, Table, Tag, Spin, Empty, Row, Col, Statistic } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { contractsApi, damageReportsApi } from "../../api";

const DEVICE_OPTIONS = [
  "Điều hòa", "Quạt", "Bàn", "Ghế", "Giường", "Tủ", "Vòi nước", "Bồn cầu",
  "Cửa", "Cửa sổ", "Ổ điện", "Đèn", "Wifi", "Khác",
];

const statusMap: Record<string, string> = { pending: "Chờ xử lý", processing: "Đang xử lý", resolved: "Đã xử lý" };
const statusColor: Record<string, string> = { pending: "gold", processing: "blue", resolved: "green" };

const DamageReportPage: React.FC = () => {
  const [form] = Form.useForm();
  const [contracts, setContracts] = useState<{ _id: string; room: { _id: string; roomNumber: string; area?: { name: string } } }[]>([]);
  const [reports, setReports] = useState<{ _id: string; room: { roomNumber: string }; device: string; description: string; status: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    contractsApi.getMy().then((res) => {
      const active = (res.data || []).filter((c: { status: string }) => c.status === "active");
      setContracts(active);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    damageReportsApi.getMy().then((res) => setReports(res.data || [])).catch(() => {});
  }, []);

  const onFinish = async (v: { room: string; device: string; description: string }) => {
    setSubmitting(true);
    try {
      await damageReportsApi.create({ room: v.room, device: v.device, description: v.description });
      message.success("Đã gửi khai báo");
      form.resetFields();
      damageReportsApi.getMy().then((res) => setReports(res.data || []));
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><ToolOutlined /> Khai báo hư hỏng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Gửi khai báo hư hỏng cơ sở vật chất (chỉ trưởng phòng)</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Chờ xử lý</span>} value={pendingCount} suffix="khai báo" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title="Tổng khai báo" value={reports.length} suffix="khai báo" />
          </Card>
        </Col>
      </Row>

      <Card title="Gửi khai báo (chỉ trưởng phòng)" style={{ marginBottom: 24, borderRadius: 12 }}>
        <p style={{ color: "#6b7280", marginBottom: 16, fontSize: 14 }}>Chỉ trưởng phòng mới được phép khai báo hư hỏng cơ sở vật chất.</p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="room" label="Phòng" rules={[{ required: true, message: "Chọn phòng" }]}>
            <Select placeholder="Chọn phòng của bạn">
              {contracts.map((c) => {
                const room = c.room as { _id?: string; roomNumber?: string; area?: { name?: string } } | string | undefined;
                const roomId = typeof room === "object" && room ? room._id : typeof room === "string" ? room : undefined;
                const roomNum = typeof room === "object" && room ? room.roomNumber : "";
                const areaName = typeof room === "object" && room?.area && typeof room.area === "object" ? room.area.name : "";
                if (!roomId) return null;
                return (
                  <Select.Option key={c._id} value={roomId}>
                    Phòng {roomNum} {areaName ? `- Khu ${areaName}` : ""}
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item name="device" label="Thiết bị" rules={[{ required: true }]}>
            <Select placeholder="Chọn thiết bị" options={DEVICE_OPTIONS.map((d) => ({ label: d, value: d }))} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả lỗi" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Mô tả chi tiết lỗi hư hỏng" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>Gửi khai báo</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Lịch sử khai báo" style={{ borderRadius: 12 }}>
        {reports.length === 0 ? (
          <Empty description="Chưa có khai báo nào" />
        ) : (
          <Table
            dataSource={reports}
            rowKey="_id"
            columns={[
              { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80, render: (v: string, r: { room: { roomNumber: string } }) => (typeof r.room === "object" ? r.room?.roomNumber : v) || "-" },
              { title: "Thiết bị", dataIndex: "device", key: "device", width: 100 },
              { title: "Mô tả", dataIndex: "description", key: "description", ellipsis: true },
              { title: "Trạng thái", dataIndex: "status", key: "status", width: 110, render: (s: string) => <Tag color={statusColor[s]}>{statusMap[s] || s}</Tag> },
              { title: "Ngày", dataIndex: "createdAt", key: "createdAt", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
            ]}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} khai báo` }}
            size="middle"
          />
        )}
      </Card>
    </div>
  );
};

export default DamageReportPage;
