import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Select, InputNumber, message, Tag, Space, Card, Row, Col, Statistic, Input } from "antd";
import { PlusOutlined, CheckOutlined, DownloadOutlined, FilterOutlined, EyeOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { billsApi, client } from "../../api";
import type { Bill } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "orange", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const formatMoney = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN") + "đ";

const BillsPage: React.FC = () => {
  const [data, setData] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [contracts, setContracts] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Bill | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ status?: string; month?: number; year?: number }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      const [billsRes, contractsRes] = await Promise.all([
        client.get("/bills", { params }),
        client.get("/contracts?status=active"),
      ]);
      setData(billsRes.data.bills || []);
      setTotal(billsRes.data.total || 0);
      setContracts(contractsRes.data.contracts || []);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filters.status, filters.month, filters.year]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      const roomFee = (v.roomFee as number) ?? undefined;
      const electricityFee = (v.electricityFee as number) ?? 0;
      const waterFee = (v.waterFee as number) ?? 0;
      const otherFee = (v.otherFee as number) ?? 0;
      await billsApi.create({
        contract: v.contract as string,
        month: v.month as number,
        year: v.year as number,
        roomFee,
        electricityFee,
        waterFee,
        otherFee,
        dueDate: v.dueDate ? new Date(v.dueDate as string).toISOString().split("T")[0] : undefined,
      });
      message.success("Tạo hóa đơn thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleMarkPaid = (r: Bill) => {
    Modal.confirm({
      title: "Xác nhận thanh toán",
      content: `Xác nhận sinh viên ${(r.user as { fullName?: string })?.fullName} đã thanh toán hóa đơn ${r.month}/${r.year} (${formatMoney(r.total)})?`,
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await billsApi.markPaid(r._id);
          message.success("Đã cập nhật");
          load();
        } catch {
          message.error("Lỗi");
        }
      },
    });
  };

  const unpaidTotal = data.filter((b) => b.status === "pending" || b.status === "overdue").reduce((s, b) => s + (b.total || 0), 0);
  const unpaidCount = data.filter((b) => b.status === "pending" || b.status === "overdue").length;

  const cols = [
    {
      title: "Tháng/Năm",
      key: "my",
      width: 90,
      render: (_: unknown, r: Bill) => <strong>{r.month}/{r.year}</strong>,
    },
    {
      title: "Sinh viên",
      dataIndex: ["user", "fullName"],
      key: "user",
      ellipsis: true,
    },
    {
      title: "Phòng",
      dataIndex: ["room", "roomNumber"],
      key: "room",
      width: 80,
    },
    {
      title: "Tiền phòng",
      dataIndex: "roomFee",
      key: "roomFee",
      width: 110,
      render: (v: number) => <span style={{ color: "#0d9488" }}>{formatMoney(v)}</span>,
    },
    {
      title: "Điện",
      dataIndex: "electricityFee",
      key: "electricityFee",
      width: 90,
      render: (v: number) => formatMoney(v),
    },
    {
      title: "Nước",
      dataIndex: "waterFee",
      key: "waterFee",
      width: 90,
      render: (v: number) => formatMoney(v),
    },
    {
      title: "Khác",
      dataIndex: "otherFee",
      key: "otherFee",
      width: 80,
      render: (v: number) => (v ? formatMoney(v) : "-"),
    },
    {
      title: "Tổng",
      dataIndex: "total",
      key: "total",
      width: 110,
      render: (v: number) => <strong style={{ color: "#134e4a" }}>{formatMoney(v)}</strong>,
    },
    {
      title: "Hạn TT",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 100,
      render: (d: string) => new Date(d).toLocaleDateString("vi-VN"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, r: Bill) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          {(r.status === "pending" || r.status === "overdue") && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleMarkPaid(r)}>Đã TT</Button>
          )}
        </Space>
      ),
    },
  ];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý hóa đơn</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Tạo, xem và quản lý hóa đơn tiền phòng, điện nước</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng chưa thu</span>} value={unpaidTotal} formatter={(v) => formatMoney(Number(v))} valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Hóa đơn chưa thanh toán" value={unpaidCount} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng hóa đơn" value={total} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 150 }}
            value={filters.status}
            onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
          >
            <Select.Option value="pending">Chưa thanh toán</Select.Option>
            <Select.Option value="paid">Đã thanh toán</Select.Option>
            <Select.Option value="overdue">Quá hạn</Select.Option>
          </Select>
          <InputNumber placeholder="Tháng" min={1} max={12} style={{ width: 90 }} value={filters.month} onChange={(v) => { setFilters((f) => ({ ...f, month: v || undefined })); setPage(1); }} />
          <InputNumber placeholder="Năm" min={2020} style={{ width: 100 }} value={filters.year} onChange={(v) => { setFilters((f) => ({ ...f, year: v || undefined })); setPage(1); }} />
          <Button onClick={() => { setFilters({}); setPage(1); }}>Xóa bộ lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(data.map((b) => ({
              "Tháng/Năm": `${b.month}/${b.year}`,
              "Sinh viên": (b.user as { fullName?: string })?.fullName,
              "Phòng": (b.room as { roomNumber?: string })?.roomNumber,
              "Tiền phòng": b.roomFee,
              "Điện": b.electricityFee,
              "Nước": b.waterFee,
              "Tổng": b.total,
              "Hạn": new Date(b.dueDate).toLocaleDateString("vi-VN"),
              "Trạng thái": statusMap[b.status]?.text || b.status,
            })), "danh-sach-hoa-don", "Hóa đơn")}>Xuất Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Tạo hóa đơn</Button>
          </Space>
        </div>

        <Table
          columns={cols}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hóa đơn` }}
          scroll={{ x: 1100 }}
          size="middle"
        />
      </Card>

      <Modal title="Tạo hóa đơn" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={500}>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ month: currentMonth, year: currentYear }}>
          <Form.Item name="contract" label="Hợp đồng" rules={[{ required: true, message: "Chọn hợp đồng" }]}>
            <Select placeholder="Chọn hợp đồng" showSearch optionFilterProp="children">
              {(contracts as { _id: string; contractNumber?: string; user?: { fullName: string }; room?: { roomNumber: string; area?: { name: string } } }[]).map((c) => (
                <Select.Option key={c._id} value={c._id}>
                  {c.contractNumber} — {(c.user as { fullName?: string })?.fullName} — Phòng {(c.room as { roomNumber?: string })?.roomNumber}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="month" label="Tháng" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: "100%" }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="year" label="Năm" rules={[{ required: true }]}><InputNumber min={2020} style={{ width: "100%" }} /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="roomFee" label="Tiền phòng (đ)"><InputNumber min={0} style={{ width: "100%" }} placeholder="Mặc định lấy từ giá phòng" /></Form.Item>
          <Form.Item name="electricityFee" label="Tiền điện (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="waterFee" label="Tiền nước (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="otherFee" label="Phí khác (Wifi, gửi xe...)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="dueDate" label="Hạn thanh toán"><Input type="date" /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>Tạo hóa đơn</Button></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Chi tiết hóa đơn ${detailModal ? `${detailModal.month}/${detailModal.year}` : ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>,
          detailModal && (detailModal.status === "pending" || detailModal.status === "overdue") && (
            <Button key="pay" type="primary" icon={<CheckOutlined />} onClick={() => { handleMarkPaid(detailModal); setDetailModal(null); }}>Xác nhận đã thanh toán</Button>
          ),
        ].filter(Boolean) as React.ReactNode[]}
        width={420}
      >
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Sinh viên:</strong> {(detailModal.user as { fullName?: string })?.fullName}</p>
            <p><strong>Phòng:</strong> {(detailModal.room as { roomNumber?: string })?.roomNumber} — {(detailModal.room as { area?: { name?: string } })?.area?.name || ""}</p>
            <p><strong>Kỳ:</strong> Tháng {detailModal.month}/{detailModal.year}</p>
            <hr style={{ margin: "12px 0" }} />
            <p><strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}</p>
            <p><strong>Tiền điện:</strong> {formatMoney(detailModal.electricityFee)}</p>
            <p><strong>Tiền nước:</strong> {formatMoney(detailModal.waterFee)}</p>
            {detailModal.otherFee ? <p><strong>Phí khác:</strong> {formatMoney(detailModal.otherFee)}</p> : null}
            <p><strong>Tổng cộng:</strong> <span style={{ fontSize: 18, color: "#0d9488" }}>{formatMoney(detailModal.total)}</span></p>
            <hr style={{ margin: "12px 0" }} />
            <p><strong>Hạn thanh toán:</strong> {new Date(detailModal.dueDate).toLocaleDateString("vi-VN")}</p>
            {detailModal.paidAt && <p><strong>Ngày thanh toán:</strong> {new Date(detailModal.paidAt).toLocaleDateString("vi-VN")}</p>}
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BillsPage;
