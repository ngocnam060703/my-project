import React, { useState, useEffect, useMemo } from "react";
import { Card, Form, Input, Select, Button, message, Table, Tag, Spin, Empty, Row, Col, Statistic, Alert } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { contractsApi, facilityReportsApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";

const statusMap: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  fixing: "Đang sửa",
  done: "Đã sửa xong",
  rejected: "Từ chối",
};
const statusColor: Record<string, string> = { pending: "gold", approved: "blue", fixing: "processing", done: "green", rejected: "red" };

type RoomLeaderRef = string | { _id?: string } | null | undefined;

const DamageReportPage: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [contracts, setContracts] = useState<
    { _id: string; room: { _id: string; roomNumber: string; area?: { name: string }; roomLeader?: RoomLeaderRef } }[]
  >([]);
  const [reports, setReports] = useState<
    { _id: string; room: { roomNumber: string }; facility?: { _id?: string; name?: string; code?: string }; description: string; status: string; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [roomFacilities, setRoomFacilities] = useState<{ _id: string; name: string; code?: string; roomId?: string }[]>([]);
  const selectedRoomId = Form.useWatch("room", form);

  const uid = String(user?.id || user?._id || "");

  const leaderContracts = useMemo(() => {
    if (!uid) return [];
    return contracts.filter((c) => {
      const room = c.room as { roomLeader?: RoomLeaderRef } | undefined;
      if (!room || typeof room !== "object") return false;
      const leader = room.roomLeader;
      const leaderId = typeof leader === "object" && leader?._id != null ? leader._id : leader;
      return leaderId != null && String(leaderId) === uid;
    });
  }, [contracts, uid]);

  useEffect(() => {
    contractsApi.getMy().then((res) => {
      const active = (res.data || []).filter((c: { status: string }) => c.status === "active" || c.status === "pending_payment");
      setContracts(active);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadReports = () => {
    facilityReportsApi.getMy().then((res) => setReports(res.data || [])).catch(() => {});
  };
  useEffect(() => { loadReports(); }, []);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoomFacilities([]);
      form.setFieldValue("facilityId", undefined);
      return;
    }
    facilityReportsApi
      .getRoomFacilities(String(selectedRoomId))
      .then((res) => {
        const list = (res.data?.facilities || []) as { _id: string; name: string; code?: string }[];
        setRoomFacilities(list);
        const current = String(form.getFieldValue("facilityId") || "");
        if (current && !list.some((x) => x._id === current)) {
          form.setFieldValue("facilityId", undefined);
        }
      })
      .catch((err: unknown) => {
        setRoomFacilities([]);
        form.setFieldValue("facilityId", undefined);
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (msg) message.error(msg);
      });
  }, [selectedRoomId, form]);

  const onFinish = async (v: { room: string; facilityId: string; description: string }) => {
    setSubmitting(true);
    try {
      await facilityReportsApi.create({ roomId: v.room, facilityId: v.facilityId, description: v.description });
      message.success("Đã gửi khai báo");
      form.resetFields();
      loadReports();
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
        {leaderContracts.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="Bạn không phải trưởng phòng"
            description="Khi admin chỉ định bạn là trưởng phòng, biểu mẫu gửi khai báo sẽ hiển thị tại đây."
          />
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="room" label="Phòng" rules={[{ required: true, message: "Chọn phòng" }]}>
              <Select placeholder="Chọn phòng của bạn">
                {leaderContracts.map((c) => {
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
            <Form.Item name="facilityId" label="Thiết bị" rules={[{ required: true, message: "Chọn thiết bị trong phòng" }]}>
              <Select
                placeholder={selectedRoomId ? "Chọn thiết bị trong phòng" : "Chọn phòng trước"}
                disabled={!selectedRoomId}
                options={roomFacilities.map((d) => ({ label: `${d.name}${d.code ? ` (${d.code})` : ""}`, value: d._id }))}
              />
            </Form.Item>
            {selectedRoomId && roomFacilities.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="Phòng này chưa có thiết bị được cấu hình"
                description="Vui lòng liên hệ admin cập nhật danh mục CSVC của phòng trước khi khai báo."
              />
            ) : null}
            <Form.Item name="description" label="Mô tả lỗi" rules={[{ required: true }]}>
              <Input.TextArea rows={4} placeholder="Mô tả chi tiết lỗi hư hỏng" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Gửi khai báo
              </Button>
            </Form.Item>
          </Form>
        )}
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
              { title: "Thiết bị", key: "device", width: 180, render: (_: unknown, r: { facility?: { name?: string; code?: string } }) => `${r.facility?.name || "-"}${r.facility?.code ? ` (${r.facility.code})` : ""}` },
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
