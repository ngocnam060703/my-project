import React, { useEffect, useState } from "react";
import { Card, Table, Button, Space, Modal, Form, Input, Select, message, Tag, Row, Col, Statistic, Descriptions, DatePicker, Switch, Spin } from "antd";
import { PlusOutlined, UserOutlined, EditOutlined, DeleteOutlined, FilterOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { usersApi } from "../../api";
import type { User } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import dayjs from "dayjs";

const roleMap: Record<string, { color: string; text: string }> = {
  user: { color: "default", text: "Sinh viên" },
  manager: { color: "blue", text: "Quản lý" },
  admin: { color: "purple", text: "Admin" },
};

const UsersPage: React.FC<{ studentOnly?: boolean }> = ({ studentOnly }) => {
  const { user: authUser } = useAuth();
  /** Chỉ super admin tạo/cấp tài khoản admin & quản lý */
  const canGrantElevated = authUser?.role === "admin" && !!authUser?.isSuperAdmin;
  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<User | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | undefined>(studentOnly ? "user" : undefined);
  const [stats, setStats] = useState<{ user: number; manager: number; admin: number }>({ user: 0, manager: 0, admin: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await usersApi.getAll({ page, limit: 10, search: search.trim() || undefined, role: roleFilter });
      setData(res.data.users || []);
      setTotal(res.data.total || 0);
      setStats(res.data.stats || { user: 0, manager: 0, admin: 0 });
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [search, roleFilter]);

  useEffect(() => {
    if (studentOnly) setRoleFilter("user");
  }, [studentOnly]);
  useEffect(() => { load(); }, [page, search, roleFilter]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      await usersApi.create(v);
      message.success("Thêm thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleUpdate = async (v: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      const payload = { ...v };
      if (!canGrantElevated) delete payload.isSuperAdmin;
      const ed = v.enrollmentDate;
      if (ed != null && typeof ed === "object" && "format" in ed && typeof (ed as { format: (s: string) => string }).format === "function") {
        payload.enrollmentDate = (ed as dayjs.Dayjs).format("YYYY-MM-DD");
      }
      await usersApi.update(editingId, payload);
      message.success("Cập nhật thành công");
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const openDetail = async (u: User) => {
    setDetailModal(u);
    setDetailLoading(true);
    try {
      const res = await usersApi.getById(u._id);
      if (res.data) setDetailModal(res.data as User);
    } catch {
      message.error("Không tải được chi tiết");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = (u: User) => {
    setEditingId(u._id);
    const base: Record<string, unknown> = {
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      studentId: u.studentId,
      faculty: u.faculty,
      homeroomTeacher: u.homeroomTeacher,
      enrollmentDate: u.enrollmentDate ? dayjs(u.enrollmentDate) : undefined,
      addressNative: u.addressNative,
      addressPermanent: u.addressPermanent,
      addressTemporary: u.addressTemporary,
      addressAbsent: u.addressAbsent,
      familyFatherName: u.familyFatherName,
      familyFatherPhone: u.familyFatherPhone,
      familyMotherName: u.familyMotherName,
      familyMotherPhone: u.familyMotherPhone,
      familyEmergencyPhone: u.familyEmergencyPhone,
    };
    if (canGrantElevated) base.isSuperAdmin = u.isSuperAdmin;
    form.setFieldsValue(base);
    setModalOpen(true);
  };

  const handleDelete = (u: User) => {
    Modal.confirm({
      title: "Xác nhận xóa người dùng",
      content: `Xóa tài khoản ${u.fullName} (${u.email})? Hành động này không thể hoàn tác.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await usersApi.delete(u._id);
          message.success("Đã xóa");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const columns = [
    { title: "Họ tên", dataIndex: "fullName", key: "fullName", render: (v: string) => <strong>{v || "-"}</strong> },
    ...(studentOnly
      ? ([
          { title: "MSSV", dataIndex: "studentId", key: "studentId", width: 110 },
          { title: "Khoa", dataIndex: "faculty", key: "faculty", width: 140, ellipsis: true, render: (v: string) => v || "—" },
        ] as const)
      : []),
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true },
    ...(!studentOnly
      ? [{ title: "Vai trò", dataIndex: "role", key: "role", width: 110, render: (r: string) => <Tag color={roleMap[r]?.color}>{roleMap[r]?.text || r}</Tag> }]
      : []),
    { title: "SĐT", dataIndex: "phone", key: "phone", width: 110 },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      render: (_: unknown, r: User) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(r)}>Chi tiết</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>Sửa</Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>Xóa</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><UserOutlined /> {studentOnly ? "Quản lý sinh viên" : "Quản lý người dùng"}</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          {studentOnly
            ? "Hồ sơ sinh viên đầy đủ: thông tin cá nhân, học tập, địa chỉ, liên hệ, gia đình — thêm, sửa, xóa."
            : "Thêm, sửa tài khoản và phân quyền vai trò"}
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Sinh viên</span>} value={stats.user} suffix="người" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Quản lý" value={stats.manager} suffix="người" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Admin" value={stats.admin} suffix="người" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Tổng tài khoản" value={total} suffix="người" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input.Search
            placeholder="Tìm theo tên, email..."
            style={{ width: 220 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            allowClear
          />
          {!studentOnly && (
            <Select placeholder="Lọc vai trò" allowClear style={{ width: 140 }} value={roleFilter} onChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <Select.Option value="user">Sinh viên</Select.Option>
              <Select.Option value="manager">Quản lý</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          )}
          <Button onClick={() => { setSearch(""); setRoleFilter(studentOnly ? "user" : undefined); setPage(1); }}>Xóa lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(data.map((u) => ({
              "Họ tên": u.fullName,
              "Email": u.email,
              "Vai trò": roleMap[u.role]?.text || u.role,
              "SĐT": u.phone,
              "MSSV": u.studentId,
            })), "danh-sach-nguoi-dung", "Người dùng")}>Xuất Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); form.setFieldsValue({ role: "user" }); setModalOpen(true); }}>Thêm</Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} người` }}
          size="middle"
        />
      </Card>

      <Modal
        title={editingId ? "Sửa người dùng" : "Thêm người dùng"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
        footer={null}
        width={560}
      >
        <Form
          form={form}
          onFinish={editingId ? handleUpdate : handleCreate}
          layout="vertical"
          initialValues={{ role: "user" }}
        >
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input disabled={!!editingId} />
          </Form.Item>
          {!editingId && <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>}
          <Form.Item name="phone" label="SĐT"><Input /></Form.Item>
          <Form.Item name="studentId" label="MSSV"><Input /></Form.Item>
          <Form.Item name="role" label="Vai trò">
            <Select>
              <Select.Option value="user">Sinh viên</Select.Option>
              <Select.Option value="manager" disabled={!canGrantElevated}>Quản lý</Select.Option>
              <Select.Option value="admin" disabled={!canGrantElevated}>Admin</Select.Option>
            </Select>
          </Form.Item>
          {editingId && canGrantElevated && (
            <Form.Item name="isSuperAdmin" label="Quản trị cấp cao (được tạo/cấp admin)" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Form.Item label="Hồ sơ sinh viên (tùy chọn)">
            <Row gutter={8}>
              <Col span={12}><Form.Item name="faculty" noStyle><Input placeholder="Khoa" /></Form.Item></Col>
              <Col span={12}><Form.Item name="homeroomTeacher" noStyle><Input placeholder="GVCN" /></Form.Item></Col>
            </Row>
            <Form.Item name="enrollmentDate" style={{ marginTop: 8, marginBottom: 0 }}>
              <DatePicker placeholder="Ngày nhập học" style={{ width: "100%" }} format="DD/MM/YYYY" />
            </Form.Item>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>{editingId ? "Cập nhật" : "Thêm"}</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Chi tiết ${detailModal?.fullName || ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} width={640} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>, detailModal && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { const u = detailModal; setDetailModal(null); handleEdit(u); setModalOpen(true); }}>Sửa</Button>]}>
        {detailModal && (
          <Spin spinning={detailLoading}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Họ tên">{detailModal.fullName}</Descriptions.Item>
              <Descriptions.Item label="Email">{detailModal.email}</Descriptions.Item>
              <Descriptions.Item label="Vai trò"><Tag color={roleMap[detailModal.role]?.color}>{roleMap[detailModal.role]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="MSSV">{detailModal.studentId || "—"}</Descriptions.Item>
              <Descriptions.Item label="SĐT">{detailModal.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label="Khoa">{detailModal.faculty || "—"}</Descriptions.Item>
              <Descriptions.Item label="Ngày nhập học">{detailModal.enrollmentDate ? dayjs(detailModal.enrollmentDate).format("DD/MM/YYYY") : "—"}</Descriptions.Item>
              <Descriptions.Item label="GVCN">{detailModal.homeroomTeacher || "—"}</Descriptions.Item>
              <Descriptions.Item label="Quê quán">{detailModal.addressNative || "—"}</Descriptions.Item>
              <Descriptions.Item label="Thường trú">{detailModal.addressPermanent || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tạm trú">{detailModal.addressTemporary || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tạm vắng">{detailModal.addressAbsent || "—"}</Descriptions.Item>
              <Descriptions.Item label="Bố / mẹ">{[detailModal.familyFatherName, detailModal.familyMotherName].filter(Boolean).join(" · ") || "—"}</Descriptions.Item>
              <Descriptions.Item label="SĐT liên hệ gia đình">{detailModal.familyEmergencyPhone || "—"}</Descriptions.Item>
            </Descriptions>
          </Spin>
        )}
      </Modal>
    </div>
  );
};

export default UsersPage;
