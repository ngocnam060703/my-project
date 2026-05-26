import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Space,
  Row,
  Col,
  Statistic,
  Tag,
  Descriptions,
  Spin,
} from "antd";
import type { TableProps } from "antd";
import {
  PlusOutlined,
  BankOutlined,
  EditOutlined,
  DeleteOutlined,
  FilterOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { exportToExcel } from "../../utils/exportExcel";
import { studentsApi, zonesApi, usersApi } from "../../api";
import type { Area, Room, StudentProfileResponse, ZoneDetailResponse } from "../../types";

const AreasPage: React.FC = () => {
  const [data, setData] = useState<Area[]>([]);
  const [managers, setManagers] = useState<{ _id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<ZoneDetailResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [zoneResidents, setZoneResidents] = useState<any[]>([]);
  const [zoneResidentsLoading, setZoneResidentsLoading] = useState(false);
  const [studentDetailModal, setStudentDetailModal] = useState<StudentProfileResponse | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "available" | "full">("");
  const [sortBy, setSortBy] = useState<"name" | "totalRooms">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dashboard, setDashboard] = useState({ totalZones: 0, totalRooms: 0, totalStudents: 0 });

  const pageSize = 10;
  const loadErrorAt = useRef(0);

  const formatLoadError = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
      const m = err.response?.data?.message;
      if (typeof m === "string" && m.trim()) return m;
      const st = err.response?.status;
      if (st === 404) return "Không tìm thấy API (404). Khởi động lại backend hoặc kiểm tra proxy.";
      if (st) return `Lỗi máy chủ (${st})`;
    }
    return "Không tải được dữ liệu";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesOut, usersOut] = await Promise.allSettled([
        zonesApi.getAll({
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          sortBy,
          sortOrder,
          page,
          limit: pageSize,
        }),
        usersApi.getAll({ role: "manager", limit: 500 }),
      ]);

      if (zonesOut.status === "fulfilled") {
        const zonesRes = zonesOut.value;
        setData(zonesRes.data?.zones ?? []);
        setTotal(zonesRes.data?.total ?? 0);
        setDashboard(zonesRes.data?.dashboard ?? { totalZones: 0, totalRooms: 0, totalStudents: 0 });
      } else {
        setData([]);
        setTotal(0);
        setDashboard({ totalZones: 0, totalRooms: 0, totalStudents: 0 });
        const now = Date.now();
        if (now - loadErrorAt.current > 900) {
          loadErrorAt.current = now;
          message.error(formatLoadError(zonesOut.reason));
        }
      }

      if (usersOut.status === "fulfilled") {
        setManagers((usersOut.value.data?.users || []) as { _id: string; fullName: string }[]);
      } else {
        setManagers([]);
      }
    } catch (err: unknown) {
      const now = Date.now();
      if (now - loadErrorAt.current > 900) {
        loadErrorAt.current = now;
        message.error(formatLoadError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), searchInput ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await zonesApi.getById(id);
      setDetail(res.data as ZoneDetailResponse);
      setZoneResidents([]);
      setZoneResidentsLoading(true);
      try {
        const rr = await zonesApi.getResidents(id);
        setZoneResidents((rr.data?.residents || []) as any[]);
      } catch {
        setZoneResidents([]);
      } finally {
        setZoneResidentsLoading(false);
      }
    } catch {
      message.error("Không tải chi tiết khu");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openStudentDetail = async (userId: string) => {
    setStudentDetailLoading(true);
    try {
      const res = await studentsApi.getById(userId);
      setStudentDetailModal(res.data as StudentProfileResponse);
    } catch {
      message.error("Không tải được hồ sơ sinh viên");
    } finally {
      setStudentDetailLoading(false);
    }
  };

  const formatParentLine = (name?: string, phone?: string) => {
    const n = String(name || "").trim();
    const p = String(phone || "").trim();
    if (!n && !p) return "—";
    if (!n) return `SĐT: ${p}`;
    if (!p) return n;
    return `${n} — SĐT: ${p}`;
  };

  const formatDateVi = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
  };

  const renderGender = (v?: string) => {
    const key = String(v || "").trim().toLowerCase();
    if (key === "male" || key === "nam") return "Nam";
    if (key === "female" || key === "nữ" || key === "nu") return "Nữ";
    if (key === "other" || key === "khác" || key === "khac") return "Khác";
    const raw = String(v || "").trim();
    return raw || "—";
  };

  const handleSubmit = async (v: Record<string, unknown>) => {
    try {
      const payload = {
        ...v,
        manager: v.manager || null,
        plannedTotalRooms: v.plannedTotalRooms == null ? null : Number(v.plannedTotalRooms),
        plannedCapacity: v.plannedCapacity == null ? null : Number(v.plannedCapacity),
      };
      if (editingId) {
        await zonesApi.update(editingId, payload);
        message.success("Cập nhật thành công");
      } else {
        await zonesApi.create(payload);
        message.success("Thêm khu thành công");
      }
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      void load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleEdit = (record: Area) => {
    setEditingId(record._id);
    const managerId = typeof record.manager === "object" ? record.manager?._id : record.manager;
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      plannedTotalRooms: record.plannedTotalRooms ?? record.actualTotalRooms ?? null,
      plannedCapacity: record.plannedCapacity ?? record.effectiveCapacity ?? null,
      manager: managerId || undefined,
      genderPolicy: record.genderPolicy || "mixed",
    });
    setModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    Modal.confirm({
      title: "Xác nhận xóa khu",
      content: `Xóa mềm khu "${name}"? Không thể xóa nếu khu còn sinh viên đang ở.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await zonesApi.delete(id);
          message.success("Đã xóa khu");
          void load();
          if (detail?.zone._id === id) {
            setDetail(null);
            setDetailOpen(false);
          }
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const genderLabel: Record<string, string> = { male: "Nam", female: "Nữ", mixed: "Hỗn hợp" };

  const renderGenderPolicy = (value?: string | null) => {
    const k = String(value || "mixed")
      .trim()
      .toLowerCase();
    if (k === "male" || k === "nam" || k === "m") return genderLabel.male;
    if (k === "female" || k === "nu" || k === "nữ" || k === "f") return genderLabel.female;
    return genderLabel.mixed;
  };

  const tableOnChange: TableProps<Area>["onChange"] = (_pg, _f, sorter) => {
    if (Array.isArray(sorter)) return;
    if (!sorter.order) {
      setSortBy("name");
      setSortOrder("asc");
      setPage(1);
      return;
    }
    const field = sorter.field === "totalRooms" ? "totalRooms" : "name";
    setSortBy(field);
    setSortOrder(sorter.order === "ascend" ? "asc" : "desc");
    setPage(1);
  };

  const chartData = data.map((z) => ({
    name: z.name?.length > 10 ? `${z.name.slice(0, 9)}…` : z.name,
    full: z.fillPercent ?? 0,
  }));

  const columns = [
    {
      title: "Tên khu",
      dataIndex: "name",
      key: "name",
      sorter: true,
      sortOrder: sortBy === "name" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (v: string) => <strong>{v || "—"}</strong>,
    },
    {
      title: "Tổng phòng",
      dataIndex: "totalRooms",
      key: "totalRooms",
      width: 110,
      sorter: true,
      sortOrder: sortBy === "totalRooms" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (_: number, r: Area) => r.actualTotalRooms ?? r.totalRooms ?? 0,
    },
    {
      title: "Sức chứa",
      key: "cap",
      width: 100,
      render: (_: unknown, r: Area) => {
        const actualRooms = r.actualTotalRooms ?? r.totalRooms ?? 0;
        if (actualRooms <= 0) return 0;
        return r.effectiveCapacity ?? 0;
      },
    },
    {
      title: "Đang ở",
      dataIndex: "currentStudents",
      key: "currentStudents",
      width: 100,
      render: (n: number) => n ?? 0,
    },
    {
      title: "Trạng thái",
      dataIndex: "zoneStatus",
      key: "zoneStatus",
      width: 120,
      render: (s: string) =>
        s === "full" ? <Tag color="error">Đầy</Tag> : <Tag color="success">Còn chỗ</Tag>,
    },
    {
      title: "Giới tính",
      dataIndex: "genderPolicy",
      key: "genderPolicy",
      width: 100,
      render: (g: string) => renderGenderPolicy(g),
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "Quản lý",
      key: "manager",
      width: 140,
      ellipsis: true,
      render: (_: unknown, r: Area) =>
        typeof r.manager === "object" ? r.manager?.fullName : <span style={{ color: "#999" }}>—</span>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      fixed: "right" as const,
      render: (_: unknown, record: Area) => (
        <Space size={0} wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record._id)}>
            Xem
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Sửa
          </Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record._id, record.name || "")}>
            Xóa
          </Button>
        </Space>
      ),
    },
  ];

  const z = detail?.zone;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>
          <BankOutlined /> Quản lý khu KTX
        </h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Theo dõi sức chứa, tỷ lệ lấp đầy và danh sách phòng theo từng khu — đồng bộ thời gian thực từ phòng & sinh viên.
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng khu</span>}
              value={dashboard.totalZones}
              suffix="khu"
              valueStyle={{ color: "#fff", fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng phòng (thực tế)" value={dashboard.totalRooms} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Sinh viên đang ở" value={dashboard.totalStudents} suffix="người" />
          </Card>
        </Col>
      </Row>

      {chartData.length > 0 && (
        <Card title="Tỷ lệ lấp đầy theo khu (trang hiện tại)" style={{ marginBottom: 24, borderRadius: 12 }}>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Lấp đầy"]} />
                <Bar dataKey="full" fill="#0d9488" name="Lấp đầy %" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input.Search
            placeholder="Tìm theo tên khu"
            style={{ width: 220 }}
            allowClear
            value={searchInput}
            onSearch={(v) => setSearchInput(v)}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 150 }}
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter((v as "" | "available" | "full") || "")}
          >
            <Select.Option value="available">Còn chỗ</Select.Option>
            <Select.Option value="full">Đầy</Select.Option>
          </Select>
          <Button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatusFilter("");
              setSortBy("name");
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
                  data.map((a) => ({
                    "Tên khu": a.name,
                    "Phòng (thực tế)": a.actualTotalRooms ?? a.totalRooms,
                    "Sức chứa":
                      (a.actualTotalRooms ?? a.totalRooms ?? 0) > 0 ? a.effectiveCapacity ?? 0 : 0,
                    "Đang ở": a.currentStudents,
                    "Trạng thái": a.zoneStatus === "full" ? "Đầy" : "Còn chỗ",
                    "Giới tính": renderGenderPolicy(a.genderPolicy),
                    "Mô tả": a.description,
                  })),
                  "danh-sach-khu-ktx",
                  "Khu KTX"
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
                form.setFieldsValue({ genderPolicy: "mixed", plannedTotalRooms: null, plannedCapacity: null });
                setModalOpen(true);
              }}
            >
              Thêm khu
            </Button>
          </Space>
        </div>

        <Table<Area>
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t} khu`,
            onChange: setPage,
          }}
          onChange={tableOnChange}
          size="middle"
          scroll={{ x: 980 }}
        />
      </Card>

      <Modal
        title={editingId ? "Sửa khu" : "Thêm khu"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingId(null);
          form.resetFields();
        }}
        footer={null}
        width={520}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical" initialValues={{ genderPolicy: "mixed" }}>
          <Form.Item name="name" label="Tên khu" rules={[{ required: true, message: "Nhập tên khu" }]}>
            <Input placeholder="Khu A" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="plannedTotalRooms"
                label="Tổng số phòng (quy hoạch)"
                extra="Tùy chọn — để trống nếu chưa quy hoạch"
                rules={[{ type: "number", min: 0, message: "Phải >= 0" }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="plannedCapacity"
                label="Sức chứa quy hoạch (SV)"
                extra="Chưa có phòng → hiển thị 0; tính theo phòng thực tế"
                rules={[{ type: "number", min: 0, message: "Phải >= 0" }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="genderPolicy" label="Phân khu theo giới tính">
            <Select
              options={[
                { value: "mixed", label: "Hỗn hợp (nam/nữ cùng khu, khác phòng)" },
                { value: "male", label: "Khu nam" },
                { value: "female", label: "Khu nữ" },
              ]}
            />
          </Form.Item>
          <Form.Item name="manager" label="Quản lý">
            <Select allowClear placeholder="Chọn quản lý" options={managers.map((m) => ({ value: m._id, label: m.fullName }))} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingId ? "Cập nhật" : "Thêm khu"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={z ? `Chi tiết — ${z.name}` : "Chi tiết khu"}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
          setDetailLoading(false);
        }}
        width={800}
        footer={[
          <Button
            key="cl"
            onClick={() => {
              setDetailOpen(false);
              setDetail(null);
            }}
          >
            Đóng
          </Button>,
          ...(z
            ? [
                <Button
                  key="ed"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setDetailOpen(false);
                    handleEdit(z);
                    setModalOpen(true);
                  }}
                >
                  Sửa
                </Button>,
              ]
            : []),
        ]}
      >
        <Spin spinning={detailLoading}>
          {detail && z && (
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Mô tả">{z.description || "—"}</Descriptions.Item>
                <Descriptions.Item label="Phòng (thực tế / quy hoạch)">
                  {(z.actualTotalRooms ?? z.totalRooms ?? 0) as number} / {z.plannedTotalRooms ?? "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Sức chứa (theo phòng thực tế)">{detail.summary.effectiveCapacity}</Descriptions.Item>
                <Descriptions.Item label="Sức chứa quy hoạch">{z.plannedCapacity ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Sinh viên đang ở">{detail.summary.currentStudents}</Descriptions.Item>
                <Descriptions.Item label="Tỷ lệ lấp đầy">{detail.summary.fillPercent}%</Descriptions.Item>
                <Descriptions.Item label="Trạng thái">
                  {detail.summary.zoneStatus === "full" ? <Tag color="error">Đầy</Tag> : <Tag color="success">Còn chỗ</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Giới tính">{renderGenderPolicy(z.genderPolicy)}</Descriptions.Item>
                <Descriptions.Item label="Quản lý">
                  {typeof z.manager === "object" ? z.manager?.fullName : "—"}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Một quản lý có thể phụ trách nhiều khu (gán qua trường Quản lý trên từng khu). RBAC hiện dùng{" "}
                    <code>managedArea</code> chính trên tài khoản quản lý.
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="Ngày tạo">
                  {z.createdAt ? new Date(z.createdAt).toLocaleString("vi-VN") : "—"}
                </Descriptions.Item>
              </Descriptions>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Danh sách phòng</div>
                <Table<Room>
                  size="small"
                  rowKey="_id"
                  pagination={false}
                  dataSource={detail.rooms}
                  columns={[
                    { title: "Số phòng", dataIndex: "roomNumber", key: "rn" },
                    { title: "Tầng", dataIndex: "floor", key: "fl" },
                    { title: "Sức chứa", dataIndex: "capacity", key: "cap" },
                    { title: "Đang ở", dataIndex: "currentOccupancy", key: "co" },
                    { title: "Trạng thái", dataIndex: "status", key: "st" },
                  ]}
                />
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Danh sách sinh viên đang ở trong khu</span>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>
                    {zoneResidentsLoading ? "Đang tải..." : `${zoneResidents.length} SV`}
                  </span>
                </div>
                <Spin spinning={zoneResidentsLoading}>
                  <Table
                    size="small"
                    rowKey={(it: any) => String(it.contractId || it.user?._id || Math.random())}
                    pagination={false}
                    dataSource={zoneResidents}
                    columns={[
                      { title: "STT", key: "stt", width: 60, render: (_: unknown, __: any, idx: number) => idx + 1 },
                      { title: "Tên", key: "name", render: (_: unknown, it: any) => it.user?.fullName || "-" },
                      { title: "Giới tính", key: "gender", width: 90, render: (_: unknown, it: any) => renderGender(it.user?.gender) },
                      { title: "Ngành", key: "major", width: 160, render: (_: unknown, it: any) => it.user?.major || "-" },
                      {
                        title: "Khóa",
                        key: "cohort",
                        width: 90,
                        render: (_: unknown, it: any) => {
                          const d = it.user?.enrollmentDate ? new Date(it.user.enrollmentDate) : null;
                          const y = d && !Number.isNaN(d.getTime()) ? d.getFullYear() : null;
                          return y ? String(y) : "-";
                        },
                      },
                      { title: "Giường", key: "bed", width: 80, render: (_: unknown, it: any) => it.bed?.code || "-" },
                      { title: "MSSV", key: "studentId", width: 110, render: (_: unknown, it: any) => it.user?.studentId || "-" },
                      { title: "Email", key: "email", width: 200, render: (_: unknown, it: any) => it.user?.email || "-" },
                      { title: "SĐT", key: "phone", width: 130, render: (_: unknown, it: any) => it.user?.phone || "-" },
                      { title: "Phòng", key: "room", width: 90, render: (_: unknown, it: any) => it.room?.roomNumber || "-" },
                      { title: "Ngày vào ở", key: "startDate", width: 120, render: (_: unknown, it: any) => (it.startDate ? new Date(it.startDate).toLocaleDateString("vi-VN") : "-") },
                    ]}
                    onRow={(it: any) => ({
                      onClick: () => {
                        if (it.user?._id) void openStudentDetail(String(it.user._id));
                      },
                      style: { cursor: it.user?._id ? "pointer" : "default" },
                    })}
                    locale={{ emptyText: "Khu chưa có sinh viên ở" }}
                  />
                </Spin>
              </div>
            </Space>
          )}
        </Spin>
      </Modal>

      <Modal
        title="Hồ sơ sinh viên"
        open={!!studentDetailModal || studentDetailLoading}
        onCancel={() => setStudentDetailModal(null)}
        footer={[<Button key="close" onClick={() => setStudentDetailModal(null)}>Đóng</Button>]}
        width={640}
      >
        <Spin spinning={studentDetailLoading}>
          {studentDetailModal ? (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Họ tên">{studentDetailModal.student.fullName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Email">{studentDetailModal.student.email || "—"}</Descriptions.Item>
              <Descriptions.Item label="SĐT">{studentDetailModal.student.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label="Giới tính">{studentDetailModal.student.gender || "—"}</Descriptions.Item>
              <Descriptions.Item label="Ngày sinh">{formatDateVi(studentDetailModal.student.dateOfBirth)}</Descriptions.Item>
              <Descriptions.Item label="MSSV">{studentDetailModal.student.studentId || "—"}</Descriptions.Item>
              <Descriptions.Item label="Lớp">{studentDetailModal.student.className || "—"}</Descriptions.Item>
              <Descriptions.Item label="Khóa">{studentDetailModal.student.faculty || "—"}</Descriptions.Item>
              <Descriptions.Item label="Ngành">{studentDetailModal.student.major || "—"}</Descriptions.Item>
              <Descriptions.Item label="Giáo viên chủ nhiệm">{studentDetailModal.student.homeroomTeacher || "—"}</Descriptions.Item>
              <Descriptions.Item label="CCCD / CMND">{studentDetailModal.student.citizenId || "—"}</Descriptions.Item>
              <Descriptions.Item label="Ngày nhập học">{formatDateVi(studentDetailModal.student.enrollmentDate)}</Descriptions.Item>
              <Descriptions.Item label="Quê quán">{studentDetailModal.student.addressNative || "—"}</Descriptions.Item>
              <Descriptions.Item label="Thường trú">{studentDetailModal.student.addressPermanent || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tạm trú">{studentDetailModal.student.addressTemporary || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tạm vắng">{studentDetailModal.student.addressAbsent || "—"}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ liên hệ">{studentDetailModal.student.address || "—"}</Descriptions.Item>
              <Descriptions.Item label="Phụ huynh (cha)">{formatParentLine(studentDetailModal.student.familyFatherName, studentDetailModal.student.familyFatherPhone)}</Descriptions.Item>
              <Descriptions.Item label="Phụ huynh (mẹ)">{formatParentLine(studentDetailModal.student.familyMotherName, studentDetailModal.student.familyMotherPhone)}</Descriptions.Item>
              <Descriptions.Item label="SĐT khẩn cấp">{String(studentDetailModal.student.familyEmergencyPhone || "").trim() || "—"}</Descriptions.Item>
              <Descriptions.Item label="Tình trạng ở KTX">{studentDetailModal.residenceStatus === "dang_o" ? <Tag color="green">Đang ở</Tag> : <Tag>Đã rời</Tag>}</Descriptions.Item>
            </Descriptions>
          ) : null}
        </Spin>
      </Modal>
    </div>
  );
};

export default AreasPage;
