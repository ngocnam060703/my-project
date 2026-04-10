import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Row,
  Col,
  Statistic,
  Descriptions,
  DatePicker,
  Switch,
  Spin,
  Avatar,
  Badge,
  Tooltip,
} from "antd";
import type { TableProps } from "antd";
import {
  PlusOutlined,
  UserOutlined,
  EditOutlined,
  DeleteOutlined,
  FilterOutlined,
  EyeOutlined,
  DownloadOutlined,
  LockOutlined,
  UnlockOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { usersApi } from "../../api";
import type { User, AdminUserDetailResponse, Contract } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import dayjs from "dayjs";

const roleDisplay: Record<string, { color: string; text: string }> = {
  user: { color: "success", text: "Sinh viên" },
  manager: { color: "warning", text: "Quản lý" },
  admin: { color: "error", text: "Admin" },
};

const UsersPage: React.FC<{ studentOnly?: boolean }> = ({ studentOnly }) => {
  const { user: authUser } = useAuth();
  const authId = authUser?._id || authUser?.id;
  const isAdmin = authUser?.role === "admin";
  const canGrantElevated = authUser?.role === "admin" && !!authUser?.isSuperAdmin;

  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailPayload, setDetailPayload] = useState<AdminUserDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetForm] = Form.useForm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | undefined>(studentOnly ? "user" : undefined);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "locked">("");
  const [sortBy, setSortBy] = useState<"id" | "fullName" | "createdAt">("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [stats, setStats] = useState<{ user: number; manager: number; admin: number }>({
    user: 0,
    manager: 0,
    admin: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.getAll({
        page,
        limit: 10,
        search: search.trim() || undefined,
        role: roleFilter,
        status: statusFilter || undefined,
        sortBy,
        sortOrder,
      });
      setData(res.data.users || []);
      setTotal(res.data.total || 0);
      setStats(res.data.stats || { user: 0, manager: 0, admin: 0 });
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (studentOnly) setRoleFilter("user");
  }, [studentOnly]);

  useEffect(() => {
    void load();
  }, [load, studentOnly]);

  const avatarRules = [
    {
      validator: (_: unknown, v: string) => {
        const s = v != null ? String(v).trim() : "";
        if (!s) return Promise.resolve();
        try {
          const u = new URL(s);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            return Promise.reject(new Error("Avatar phải là URL http(s)"));
          }
          return Promise.resolve();
        } catch {
          return Promise.reject(new Error("Avatar phải là URL hợp lệ"));
        }
      },
    },
  ];

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      const payload = { ...v };
      const ed = v.enrollmentDate;
      if (ed != null && typeof ed === "object" && "format" in ed && typeof (ed as { format: (s: string) => string }).format === "function") {
        payload.enrollmentDate = (ed as dayjs.Dayjs).format("YYYY-MM-DD");
      }
      const dob = v.dateOfBirth;
      if (dob != null && typeof dob === "object" && "format" in dob && typeof (dob as { format: (s: string) => string }).format === "function") {
        payload.dateOfBirth = (dob as dayjs.Dayjs).format("YYYY-MM-DD");
      }
      await usersApi.create(payload);
      message.success("Thêm người dùng thành công");
      setModalOpen(false);
      form.resetFields();
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; errors?: { msg?: string }[] } } })?.response?.data;
      message.error(msg?.message || msg?.errors?.[0]?.msg || "Không tạo được người dùng");
    }
  };

  const handleUpdate = async (v: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      const payload = { ...v };
      if (!canGrantElevated) delete payload.isSuperAdmin;
      delete payload.email;
      const ed = v.enrollmentDate;
      if (ed != null && typeof ed === "object" && "format" in ed && typeof (ed as { format: (s: string) => string }).format === "function") {
        payload.enrollmentDate = (ed as dayjs.Dayjs).format("YYYY-MM-DD");
      }
      const dob = v.dateOfBirth;
      if (dob != null && typeof dob === "object" && "format" in dob && typeof (dob as { format: (s: string) => string }).format === "function") {
        payload.dateOfBirth = (dob as dayjs.Dayjs).format("YYYY-MM-DD");
      }
      await usersApi.update(editingId, payload);
      message.success("Cập nhật thành công");
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || "Cập nhật thất bại");
    }
  };

  const openDetail = async (u: User) => {
    setDetailPayload({ user: u, currentRoom: null, currentContract: null, contracts: [] });
    setDetailLoading(true);
    try {
      const res = await usersApi.getById(u._id);
      if (res.data) setDetailPayload(res.data as AdminUserDetailResponse);
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
      phone: u.phone,
      role: u.role,
      studentId: u.studentId,
      major: u.major,
      gender: u.gender,
      citizenId: u.citizenId,
      dateOfBirth: u.dateOfBirth ? dayjs(u.dateOfBirth) : undefined,
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
      avatar: u.avatar || "",
    };
    if (canGrantElevated) base.isSuperAdmin = u.isSuperAdmin;
    form.setFieldsValue(base);
    setModalOpen(true);
  };

  const handleDelete = (u: User) => {
    Modal.confirm({
      title: "Xác nhận xóa người dùng",
      content: `Xóa mềm tài khoản ${u.fullName} (${u.email})? Tài khoản sẽ không còn đăng nhập được và ẩn khỏi danh sách.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await usersApi.delete(u._id);
          message.success("Đã xóa người dùng (xóa mềm)");
          void load();
        } catch (err: unknown) {
          message.error(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không xóa được"
          );
        }
      },
    });
  };

  const toggleLock = async (u: User) => {
    const lock = u.isActive !== false;
    try {
      if (lock) {
        await usersApi.lock(u._id);
        message.success("Đã khóa tài khoản");
      } else {
        await usersApi.unlock(u._id);
        message.success("Đã mở khóa tài khoản");
      }
      void load();
      if (detailPayload?.user._id === u._id) void openDetail(u);
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Thao tác thất bại"
      );
    }
  };

  const submitResetPassword = async (v: { newPassword: string }) => {
    if (!resetPwdUserId) return;
    try {
      await usersApi.resetPassword(resetPwdUserId, v.newPassword);
      message.success("Đã đặt lại mật khẩu");
      setResetPwdOpen(false);
      resetForm.resetFields();
      setResetPwdUserId(null);
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không đặt lại được mật khẩu"
      );
    }
  };

  const openResetPassword = (userId: string) => {
    setResetPwdUserId(userId);
    resetForm.resetFields();
    setResetPwdOpen(true);
  };

  const tableOnChange: TableProps<User>["onChange"] = (_pg, _f, sorter) => {
    if (Array.isArray(sorter)) return;
    if (!sorter.order) {
      setSortBy("id");
      setSortOrder("asc");
      setPage(1);
      return;
    }
    const field = sorter.field === "_id" ? "id" : sorter.field === "fullName" ? "fullName" : "createdAt";
    setSortBy(field);
    setSortOrder(sorter.order === "ascend" ? "asc" : "desc");
    setPage(1);
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "_id",
      key: "_id",
      width: 100,
      sorter: true,
      sortOrder:
        sortBy === "id" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (_: unknown, r: User) => (
        <Tooltip title={r._id}>
          <code style={{ fontSize: 12 }}>{r._id.slice(-8)}</code>
        </Tooltip>
      ),
    },
    {
      title: "Ảnh",
      key: "avatar",
      width: 72,
      render: (_: unknown, r: User) => (
        <Avatar src={r.avatar || undefined} icon={<UserOutlined />} size={40} style={{ display: "block" }} />
      ),
    },
    {
      title: "Họ tên",
      dataIndex: "fullName",
      key: "fullName",
      sorter: true,
      sortOrder:
        sortBy === "fullName" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (v: string) => <strong>{v || "—"}</strong>,
    },
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true },
    ...(studentOnly
      ? ([
          { title: "MSSV", dataIndex: "studentId", key: "studentId", width: 110 },
          { title: "Khoa", dataIndex: "faculty", key: "faculty", width: 140, ellipsis: true, render: (v: string) => v || "—" },
        ] as const)
      : [
          {
            title: "Vai trò",
            dataIndex: "role",
            key: "role",
            width: 120,
            render: (r: string) => {
              const d = roleDisplay[r] || { color: "default", text: r };
              return <Tag color={d.color}>{d.text}</Tag>;
            },
          },
        ]),
    {
      title: "Trạng thái",
      key: "isActive",
      width: 110,
      render: (_: unknown, r: User) =>
        r.isActive === false ? <Tag color="default">Đã khóa</Tag> : <Tag color="success">Hoạt động</Tag>,
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      sorter: true,
      sortOrder:
        sortBy === "createdAt" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 280,
      fixed: "right" as const,
      render: (_: unknown, r: User) => {
        const self = authId && String(r._id) === String(authId);
        const cannotDelete = r.isSuperAdmin || self || !isAdmin;
        const showResetPwd =
          isAdmin && (canGrantElevated || (r.role !== "admin" && r.role !== "manager"));
        return (
          <Space size={0} wrap>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(r)}>
              Chi tiết
            </Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
              Sửa
            </Button>
            <Button
              type="link"
              size="small"
              icon={r.isActive === false ? <UnlockOutlined /> : <LockOutlined />}
              disabled={self || (r.isSuperAdmin && !canGrantElevated)}
              onClick={() => void toggleLock(r)}
            >
              {r.isActive === false ? "Mở khóa" : "Khóa"}
            </Button>
            {showResetPwd && (
              <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openResetPassword(r._id)}>
                Đặt lại MK
              </Button>
            )}
            <Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={cannotDelete} onClick={() => handleDelete(r)}>
              Xóa
            </Button>
          </Space>
        );
      },
    },
  ];

  const du = detailPayload?.user;

  const contractColumns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "cn", render: (v: string) => v || "—" },
    {
      title: "Phòng",
      key: "room",
      render: (_: unknown, c: Contract) =>
        typeof c.room === "object" && c.room ? `${c.room.roomNumber}` : "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "st",
      render: (s: string) => <Tag>{s}</Tag>,
    },
    {
      title: "Bắt đầu",
      dataIndex: "startDate",
      key: "sd",
      render: (d: string) => dayjs(d).format("DD/MM/YYYY"),
    },
    {
      title: "Kết thúc",
      dataIndex: "endDate",
      key: "ed",
      render: (d: string) => dayjs(d).format("DD/MM/YYYY"),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>
          <UserOutlined /> {studentOnly ? "Quản lý sinh viên" : "Quản lý người dùng"}
        </h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          {studentOnly
            ? "Danh sách sinh viên: tìm kiếm, khóa/mở khóa, xóa mềm, chi tiết phòng và hợp đồng."
            : "Quản trị tài khoản: Admin / Sinh viên / Quản lý — bảo mật, phân quyền, JWT & mật khẩu băm phía server."}
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Sinh viên</span>}
              value={stats.user}
              suffix="người"
              valueStyle={{ color: "#fff", fontSize: 20 }}
            />
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
            <Statistic title="Tổng (trang lọc)" value={total} suffix="người" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input.Search
            placeholder="Tìm theo tên, email, MSSV..."
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            allowClear
          />
          {!studentOnly && (
            <Select
              placeholder="Vai trò"
              allowClear
              style={{ width: 140 }}
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v);
                setPage(1);
              }}
            >
              <Select.Option value="user">Sinh viên</Select.Option>
              <Select.Option value="manager">Quản lý</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          )}
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 140 }}
            value={statusFilter || undefined}
            onChange={(v) => {
              setStatusFilter((v as "" | "active" | "locked") || "");
              setPage(1);
            }}
          >
            <Select.Option value="active">Hoạt động</Select.Option>
            <Select.Option value="locked">Đã khóa</Select.Option>
          </Select>
          <Button
            onClick={() => {
              setSearch("");
              setRoleFilter(studentOnly ? "user" : undefined);
              setStatusFilter("");
              setSortBy("id");
              setSortOrder("asc");
              setPage(1);
            }}
          >
            Xóa lọc
          </Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() =>
                exportToExcel(
                  data.map((u) => ({
                    ID: u._id,
                    "Họ tên": u.fullName,
                    Email: u.email,
                    "Vai trò": roleDisplay[u.role]?.text || u.role,
                    "Trạng thái": u.isActive === false ? "Đã khóa" : "Hoạt động",
                    "Ngày tạo": u.createdAt ? dayjs(u.createdAt).format("DD/MM/YYYY HH:mm") : "",
                    MSSV: u.studentId,
                    SĐT: u.phone,
                  })),
                  "danh-sach-nguoi-dung",
                  "Người dùng"
                )
              }
            >
              Xuất Excel
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingId(null);
                form.resetFields();
                form.setFieldsValue({ role: "user" });
                setModalOpen(true);
              }}
            >
              Thêm
            </Button>
          </Space>
        </div>

        <Table<User>
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize: 10,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t} người`,
          }}
          onChange={tableOnChange}
          size="middle"
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={editingId ? "Sửa người dùng" : "Thêm người dùng"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingId(null);
          form.resetFields();
        }}
        footer={null}
        width={560}
      >
        <Form form={form} onFinish={editingId ? handleUpdate : handleCreate} layout="vertical" initialValues={{ role: "user" }}>
          <Form.Item name="role" label="Vai trò">
            <Select>
              <Select.Option value="user">Sinh viên</Select.Option>
              <Select.Option value="manager" disabled={!canGrantElevated}>Quản lý</Select.Option>
              <Select.Option value="admin" disabled={!canGrantElevated}>Admin</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const isStudentRole = getFieldValue("role") === "user";
              const req = { required: isStudentRole, message: "Trường bắt buộc" };
              return (
                <>
                  <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: "Nhập họ tên" }]}><Input /></Form.Item>
                  <Form.Item name="email" label="Email" rules={[{ required: !editingId, type: "email", message: "Email không hợp lệ" }]}>
                    <Input disabled={!!editingId} placeholder="email@example.com" />
                  </Form.Item>
                  {!editingId && <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 6, message: "Tối thiểu 6 ký tự" }]}><Input.Password /></Form.Item>}
                  <Form.Item name="avatar" label="Avatar (URL)" rules={avatarRules}><Input placeholder="https://..." allowClear /></Form.Item>
                  <Form.Item name="phone" label="SĐT" rules={[req]}><Input /></Form.Item>
                  <Row gutter={8}>
                    <Col span={12}><Form.Item name="dateOfBirth" label="Ngày sinh" rules={[req]}><DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" /></Form.Item></Col>
                    <Col span={12}><Form.Item name="gender" label="Giới tính" rules={[req]}><Select allowClear><Select.Option value="Nam">Nam</Select.Option><Select.Option value="Nữ">Nữ</Select.Option><Select.Option value="Khác">Khác</Select.Option></Select></Form.Item></Col>
                  </Row>
                  <Form.Item name="citizenId" label="CCCD" rules={[req]}><Input /></Form.Item>
                  <Form.Item name="studentId" label="MSSV" rules={[req]}><Input /></Form.Item>
                  <Form.Item name="major" label="Ngành" rules={[req]}><Input /></Form.Item>
                  <Row gutter={8}>
                    <Col span={12}><Form.Item name="faculty" label="Khoa" rules={[req]}><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="homeroomTeacher" label="Giáo viên chủ nhiệm" rules={[req]}><Input /></Form.Item></Col>
                  </Row>
                  <Form.Item name="enrollmentDate" label="Ngày nhập học" rules={[req]}><DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" /></Form.Item>
                  <Form.Item name="addressNative" label="Quê quán" rules={[req]}><Input /></Form.Item>
                  <Form.Item name="addressPermanent" label="Địa chỉ thường trú" rules={[req]}><Input /></Form.Item>
                  <Form.Item name="addressTemporary" label="Tạm trú" rules={[req]}><Input /></Form.Item>
                  <Form.Item name="addressAbsent" label="Tạm vắng" rules={[req]}><Input /></Form.Item>
                  <Row gutter={8}>
                    <Col span={12}><Form.Item name="familyFatherName" label="Tên bố"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="familyMotherName" label="Tên mẹ"><Input /></Form.Item></Col>
                  </Row>
                  <Form.Item
                    name="familyEmergencyPhone"
                    label="SĐT liên hệ gia đình"
                    rules={[
                      req,
                      {
                        validator: () => {
                          if (!isStudentRole) return Promise.resolve();
                          const father = form.getFieldValue("familyFatherName");
                          const mother = form.getFieldValue("familyMotherName");
                          if ((father && String(father).trim()) || (mother && String(mother).trim())) return Promise.resolve();
                          return Promise.reject(new Error("Cần ít nhất tên bố hoặc tên mẹ"));
                        },
                      },
                    ]}
                  ><Input /></Form.Item>
                  {editingId && canGrantElevated && <Form.Item name="isSuperAdmin" label="Quản trị cấp cao" valuePropName="checked"><Switch /></Form.Item>}
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block>
                      {editingId ? "Cập nhật" : "Thêm"}
                    </Button>
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Chi tiết — ${du?.fullName || ""}`}
        open={!!detailPayload}
        onCancel={() => setDetailPayload(null)}
        width={720}
        footer={[
          <Button key="close" onClick={() => setDetailPayload(null)}>
            Đóng
          </Button>,
          ...(du
            ? [
                <Button
                  key="edit"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    const u = du;
                    setDetailPayload(null);
                    handleEdit(u);
                  }}
                >
                  Sửa
                </Button>,
              ]
            : []),
        ]}
      >
        {detailPayload && (
          <Spin spinning={detailLoading}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <Badge status={du?.isActive === false ? "default" : "success"} />
                <Avatar size={64} src={du?.avatar || undefined} icon={<UserOutlined />} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{du?.fullName}</div>
                  <div style={{ color: "#6b7280" }}>{du?.email}</div>
                  <Space style={{ marginTop: 8 }}>
                    <Tag color={roleDisplay[du?.role || ""]?.color}>{roleDisplay[du?.role || ""]?.text || du?.role}</Tag>
                    {du?.isActive === false ? <Tag color="default">Đã khóa</Tag> : <Tag color="success">Hoạt động</Tag>}
                    {du?.isSuperAdmin ? <Tag color="magenta">Super admin</Tag> : null}
                  </Space>
                </div>
              </div>

              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="MSSV">{du?.studentId || "—"}</Descriptions.Item>
                <Descriptions.Item label="SĐT">{du?.phone || "—"}</Descriptions.Item>
                <Descriptions.Item label="Khoa">{du?.faculty || "—"}</Descriptions.Item>
                <Descriptions.Item label="Ngày nhập học">
                  {du?.enrollmentDate ? dayjs(du.enrollmentDate).format("DD/MM/YYYY") : "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Phòng đang ở (theo hợp đồng hiện hành)">
                  {detailPayload.currentRoom && typeof detailPayload.currentRoom === "object" ? (
                    <span>
                      Phòng <strong>{detailPayload.currentRoom.roomNumber}</strong>
                      {typeof detailPayload.currentRoom.area === "object" && detailPayload.currentRoom.area ? (
                        <span> — {detailPayload.currentRoom.area.name}</span>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>Hợp đồng</div>
                <Table<Contract>
                  size="small"
                  rowKey="_id"
                  columns={contractColumns}
                  dataSource={detailPayload.contracts || []}
                  pagination={false}
                  locale={{ emptyText: "Chưa có hợp đồng" }}
                />
              </div>
            </Space>
          </Spin>
        )}
      </Modal>

      <Modal
        title="Đặt lại mật khẩu"
        open={resetPwdOpen}
        onCancel={() => {
          setResetPwdOpen(false);
          resetForm.resetFields();
          setResetPwdUserId(null);
        }}
        footer={null}
      >
        <Form form={resetForm} layout="vertical" onFinish={submitResetPassword}>
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[{ required: true, min: 6, message: "Tối thiểu 6 ký tự" }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Lưu
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
