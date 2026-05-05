import React, { useState, useEffect } from "react";
import { Table, Button, Tag, Space, message, Modal, Input, Select, Card, Row, Col, Statistic } from "antd";
import { CheckOutlined, CloseOutlined, DownloadOutlined, FilterOutlined, EyeOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { registrationsApi, client } from "../../api";
import type { Registration } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "orange", text: "Chờ duyệt" },
  approved: { color: "green", text: "Đã duyệt" },
  rejected: { color: "red", text: "Từ chối" },
};
const typeMap: Record<string, { color: string; text: string }> = {
  dorm: { color: "blue", text: "Nội trú mới" },
  transfer: { color: "purple", text: "Chuyển phòng" },
};

type RegistrationsPageProps = { embedded?: boolean };

const RegistrationsPage: React.FC<RegistrationsPageProps> = ({ embedded = false }) => {
  const [data, setData] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [rooms, setRooms] = useState<{ _id: string; roomNumber: string; area?: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ status?: string; room?: string }>({ status: "all" });
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detailModal, setDetailModal] = useState<Registration | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status && filters.status !== "all") params.status = filters.status;
      if (filters.room) params.room = filters.room;
      const [res, roomsRes] = await Promise.all([
        client.get("/registrations", { params }),
        client.get("/rooms"),
      ]);
      setData(res.data.registrations || []);
      setTotal(res.data.total || 0);
      setRooms(roomsRes.data.rooms || []);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filters.status, filters.room]);

  const handleApprove = (id: string) => {
    Modal.confirm({
      title: "Xác nhận duyệt đơn",
      content: "Bạn có chắc muốn duyệt đơn đăng ký này? Sinh viên sẽ nhận thông báo và kí hợp đồng để xác nhận ở nội trú.",
      okText: "Duyệt",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await registrationsApi.approve(id);
          message.success("Đã duyệt");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await registrationsApi.reject(rejectModal.id, rejectReason);
      message.success("Đã từ chối");
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const getVal = (obj: unknown, path: string) => {
    const keys = path.split(".");
    let v: unknown = obj;
    for (const k of keys) v = v && typeof v === "object" && k in v ? (v as Record<string, unknown>)[k] : undefined;
    return v != null ? String(v) : "";
  };

  const getAreaName = (r: Registration) => {
    const roomValue: unknown = r.room;

    if (roomValue && typeof roomValue === "object") {
      const roomObj = roomValue as { _id?: string; area?: unknown };
      const area = roomObj.area;
      if (area && typeof area === "object" && "name" in area) {
        const areaName = (area as { name?: string }).name;
        if (areaName) return areaName;
      }
      if (roomObj._id) {
        const roomId = String(roomObj._id);
        const roomMatched = rooms.find((room) => room._id === roomId);
        if (roomMatched?.area?.name) return roomMatched.area.name;
      }
    }

    if (typeof roomValue === "string") {
      const roomMatched = rooms.find((room) => room._id === roomValue);
      if (roomMatched?.area?.name) return roomMatched.area.name;
    }
    return "";
  };

  const pendingCount = data.filter((r) => r.status === "pending").length;

  const columns = [
    {
      title: "Mã đơn",
      key: "id",
      width: 90,
      render: (_: unknown, r: Registration) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r._id?.slice(-8).toUpperCase() || "-"}</span>,
    },
    {
      title: "Sinh viên",
      key: "user",
      width: 140,
      render: (_: unknown, r: Registration) => getVal(r.user, "fullName") || "-",
    },
    {
      title: "MSSV",
      key: "studentId",
      width: 100,
      render: (_: unknown, r: Registration) => getVal(r.user, "studentId") || "-",
    },
    {
      title: "Phòng",
      key: "room",
      width: 80,
      render: (_: unknown, r: Registration) => getVal(r.room, "roomNumber") || "-",
    },
    {
      title: "Khu",
      key: "area",
      width: 90,
      render: (_: unknown, r: Registration) => getAreaName(r) || "-",
    },
    {
      title: "Loại đơn",
      key: "registrationType",
      width: 120,
      render: (_: unknown, r: Registration) => {
        const t = r.registrationType || "dorm";
        return <Tag color={typeMap[t]?.color}>{typeMap[t]?.text || t}</Tag>;
      },
    },
    { title: "Học kỳ", dataIndex: "semester", key: "semester", width: 80, render: (v: string) => v || "-" },
    { title: "Năm học", dataIndex: "schoolYear", key: "schoolYear", width: 100, render: (v: string) => v || "-" },
    {
      title: "Ngày ĐK",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 100,
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      fixed: "right" as const,
      render: (_: unknown, r: Registration) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          {r.status === "pending" && (
            <>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(r._id)}>Duyệt</Button>
              <Button type="link" danger size="small" icon={<CloseOutlined />} onClick={() => setRejectModal({ id: r._id })}>Từ chối</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {!embedded && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Xét duyệt đơn</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Duyệt hoặc từ chối đơn đăng ký nội trú của sinh viên</p>
        </div>
      )}
      {embedded && (
        <p className="text-muted small mb-3">
          Luồng đăng ký chọn phòng trước: duyệt hoặc từ chối; sinh viên ký hợp đồng sau khi được duyệt.
        </p>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Đơn chờ duyệt</span>} value={pendingCount} suffix="đơn" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Đã duyệt" value={data.filter((r) => r.status === "approved").length} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng đơn" value={total} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Select
            placeholder="Trạng thái"
            allowClear={false}
            style={{ width: 150 }}
            value={filters.status}
            onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
          >
            <Select.Option value="all">Tất cả</Select.Option>
            <Select.Option value="pending">Chờ duyệt</Select.Option>
            <Select.Option value="approved">Đã duyệt</Select.Option>
            <Select.Option value="rejected">Từ chối</Select.Option>
          </Select>
          <Select
            placeholder="Lọc theo phòng"
            allowClear
            style={{ width: 180 }}
            value={filters.room}
            onChange={(v) => { setFilters((f) => ({ ...f, room: v })); setPage(1); }}
            showSearch
            optionFilterProp="children"
          >
            {rooms.map((r) => (
              <Select.Option key={r._id} value={r._id}>Phòng {r.roomNumber} {r.area?.name ? `- ${r.area.name}` : ""}</Select.Option>
            ))}
          </Select>
          <Button onClick={() => { setFilters({ status: "all" }); setPage(1); }}>Xóa bộ lọc</Button>
          <div style={{ flex: 1 }} />
          <Button
            icon={<DownloadOutlined />}
            onClick={() => exportToExcel(data.map((r) => ({
              "Mã đơn": r._id?.slice(-8),
              "Sinh viên": getVal(r.user, "fullName"),
              "MSSV": getVal(r.user, "studentId"),
              "Phòng": getVal(r.room, "roomNumber"),
              "Khu": getAreaName(r) || "-",
              "Học kỳ": r.semester,
              "Năm học": r.schoolYear,
              "Ngày ĐK": r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "-",
              "Trạng thái": statusMap[r.status]?.text || r.status,
            })), "danh-sach-don-dang-ky", "Đơn đăng ký")}
          >
            Xuất Excel
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} đơn` }}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </Card>

      <Modal title="Lý do từ chối" open={!!rejectModal} onOk={handleReject} onCancel={() => { setRejectModal(null); setRejectReason(""); }} okText="Từ chối" okType="danger">
        <Input.TextArea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Nhập lý do từ chối (bắt buộc để sinh viên hiểu rõ)" rows={4} />
      </Modal>

      <Modal
        title={`Chi tiết đơn #${detailModal?._id?.slice(-8).toUpperCase() || ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={detailModal?.status === "pending" ? [
          <Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>,
          <Button key="approve" type="primary" icon={<CheckOutlined />} onClick={() => { handleApprove(detailModal!._id); setDetailModal(null); }}>Duyệt</Button>,
          <Button key="reject" danger icon={<CloseOutlined />} onClick={() => { setRejectModal({ id: detailModal!._id }); setDetailModal(null); }}>Từ chối</Button>,
        ] : [<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>]}
        width={480}
      >
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Sinh viên:</strong> {getVal(detailModal.user, "fullName") || "-"}</p>
            <p><strong>MSSV:</strong> {getVal(detailModal.user, "studentId") || "-"}</p>
            <p><strong>Email:</strong> {getVal(detailModal.user, "email") || "-"}</p>
            <p><strong>SĐT:</strong> {getVal(detailModal.user, "phone") || "-"}</p>
            <p><strong>Phòng đăng ký:</strong> {getVal(detailModal.room, "roomNumber") || "-"}</p>
            {(detailModal.registrationType || "dorm") === "transfer" && (
              <p><strong>Phòng hiện tại:</strong> {typeof detailModal.fromRoom === "object" ? detailModal.fromRoom?.roomNumber : "-"}</p>
            )}
            <p><strong>Khu:</strong> {getAreaName(detailModal) || "-"}</p>
            <p><strong>Loại đơn:</strong> <Tag color={typeMap[detailModal.registrationType || "dorm"]?.color}>{typeMap[detailModal.registrationType || "dorm"]?.text}</Tag></p>
            <p><strong>Học kỳ:</strong> {detailModal.semester || "-"}</p>
            <p><strong>Năm học:</strong> {detailModal.schoolYear || "-"}</p>
            <p><strong>Ngày bắt đầu ở:</strong> {detailModal.startDate ? new Date(detailModal.startDate).toLocaleDateString("vi-VN") : "-"}</p>
            <p><strong>Ngày đăng ký:</strong> {detailModal.createdAt ? new Date(detailModal.createdAt).toLocaleDateString("vi-VN") : "-"}</p>
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
            {detailModal.status === "rejected" && detailModal.rejectionReason && (
              <p style={{ color: "#cf1322", marginTop: 12 }}><strong>Lý do từ chối:</strong> {detailModal.rejectionReason}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RegistrationsPage;
