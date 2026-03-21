import React, { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Input, Select, message, Space, Row, Col, Statistic } from "antd";
import { PlusOutlined, BankOutlined, EditOutlined, DeleteOutlined, FilterOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { areasApi, usersApi } from "../../api";
import type { Area } from "../../types";

const AreasPage: React.FC = () => {
  const [data, setData] = useState<Area[]>([]);
  const [managers, setManagers] = useState<{ _id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Area | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<{ total: number; withManager: number; withoutManager: number }>({ total: 0, withManager: 0, withoutManager: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [areasRes, usersRes] = await Promise.all([
        areasApi.getAll({ search: search.trim() || undefined }),
        usersApi.getAll({ role: "manager", limit: 500 }),
      ]);
      const areasData = areasRes.data?.areas ?? areasRes.data ?? [];
      const list = Array.isArray(areasData) ? areasData : [];
      setData(list);
      setStats(areasRes.data?.stats ?? { total: list.length, withManager: 0, withoutManager: list.length });
      setManagers((usersRes.data?.users || []) as { _id: string; fullName: string }[]);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const handleSubmit = async (v: Record<string, unknown>) => {
    try {
      const payload = { ...v, manager: v.manager || null };
      if (editingId) {
        await areasApi.update(editingId, payload);
        message.success("Cập nhật thành công");
      } else {
        await areasApi.create(payload);
        message.success("Thêm thành công");
      }
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleEdit = (record: Area) => {
    setEditingId(record._id);
    const managerId = typeof record.manager === "object" ? record.manager?._id : record.manager;
    form.setFieldsValue({ name: record.name, description: record.description, manager: managerId || undefined });
    setModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    Modal.confirm({
      title: "Xác nhận xóa",
      content: `Bạn có chắc muốn xóa khu "${name}"? Không thể xóa khu đã có phòng.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await areasApi.delete(id);
          message.success("Đã xóa");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const columns = [
    { title: "Tên khu", dataIndex: "name", key: "name", render: (v: string) => <strong>{v || "-"}</strong> },
    { title: "Mô tả", dataIndex: "description", key: "description", ellipsis: true },
    { title: "Quản lý", dataIndex: ["manager", "fullName"], key: "manager", render: (v: string, r: Area) => (typeof r.manager === "object" ? r.manager?.fullName : v) || <span style={{ color: "#999" }}>-</span> },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      render: (_: unknown, record: Area) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)}>Chi tiết</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>Sửa</Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record._id, record.name || "")}>Xóa</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><BankOutlined /> Quản lý khu</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Thêm, sửa khu và phân công quản lý</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng khu</span>} value={stats.total} suffix="khu" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic title="Đã có quản lý" value={stats.withManager} suffix="khu" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic title="Chưa có quản lý" value={stats.withoutManager} suffix="khu" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input placeholder="Tìm theo tên khu" style={{ width: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
          <Button onClick={() => setSearch("")}>Xóa lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(data.map((a) => ({
              "Tên khu": a.name,
              "Mô tả": a.description,
              "Quản lý": typeof a.manager === "object" ? a.manager?.fullName : "-",
            })), "danh-sach-khu", "Khu")}>Xuất Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>Thêm khu</Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} khu` }}
          size="middle"
        />
      </Card>

      <Modal title={editingId ? "Sửa khu" : "Thêm khu"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }} footer={null} width={480}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="name" label="Tên khu" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="manager" label="Quản lý">
            <Select allowClear placeholder="Chọn quản lý">
              <Select.Option value="">Không</Select.Option>
              {managers.map((m) => <Select.Option key={m._id} value={m._id}>{m.fullName}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>{editingId ? "Cập nhật" : "Thêm"}</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Chi tiết khu ${detailModal?.name || ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>, detailModal && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailModal(null); handleEdit(detailModal); setModalOpen(true); }}>Sửa</Button>]}>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Tên khu:</strong> {detailModal.name}</p>
            <p><strong>Mô tả:</strong> {detailModal.description || "-"}</p>
            <p><strong>Quản lý:</strong> {typeof detailModal.manager === "object" ? detailModal.manager?.fullName : "-"}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AreasPage;
