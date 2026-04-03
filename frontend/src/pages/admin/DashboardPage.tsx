import React, { useState, useEffect } from "react";
import { Row, Col, Card, Statistic, Spin, Progress, Switch, Space, message, Button, Modal, Form, Input, DatePicker } from "antd";
import { HomeOutlined, TeamOutlined, FileAddOutlined, WarningOutlined } from "@ant-design/icons";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useNavigate } from "react-router-dom";
import { dashboardApi, registrationPeriodsApi } from "../../api";
import dayjs from "dayjs";

interface DashboardStats {
  totalRooms?: number;
  availableRooms?: number;
  totalStudents?: number;
  pendingRegistrations?: number;
  pendingViolations?: number;
  roomByArea?: { _id: string; total: number; available: number }[];
  revenueByMonth?: { _id: { year: number; month: number }; total: number }[];
  occupancyRate?: number;
}

interface RegistrationPeriod {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<RegistrationPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [contractExtensionEnabled, setContractExtensionEnabled] = useState<boolean | null>(null);
  const [contractExtensionToggling, setContractExtensionToggling] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [openForm] = Form.useForm();
  const [quickCountdown, setQuickCountdown] = useState<string>("");

  const loadPeriods = async () => {
    setPeriodsLoading(true);
    try {
      const res = await registrationPeriodsApi.getAll();
      setPeriods(res.data || []);
    } catch (err: unknown) {
      const st = (err as { response?: { status?: number } })?.response?.status;
      message.error(
        st === 429
          ? "Quá nhiều yêu cầu tới máy chủ. Đợi vài phút hoặc khởi động lại backend (giới hạn API)."
          : "Không tải được danh sách đợt đăng ký",
      );
    } finally {
      setPeriodsLoading(false);
    }
  };

  const loadContractExtensionSetting = async () => {
    try {
      const res = await dashboardApi.getContractExtensionSetting();
      const v = res.data?.enable_contract_extension;
      setContractExtensionEnabled(typeof v === "boolean" ? v : true);
    } catch {
      message.error("Không tải được cài đặt gia hạn hợp đồng");
      setContractExtensionEnabled(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const res = await dashboardApi.getStats();
        if (!cancelled) setStats(res.data);
      } catch (err: unknown) {
        const st = (err as { response?: { status?: number } })?.response?.status;
        if (!cancelled) {
          message.error(
            st === 429
              ? "Quá nhiều yêu cầu (429). Thử lại sau vài phút."
              : "Không tải được thống kê dashboard",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadStats();
    void loadPeriods();
    void loadContractExtensionSetting();
    return () => {
      cancelled = true;
    };
  }, []);

  const quickPeriod = periods.find((p) => p.isActive) || periods[0] || null;
  const activePeriod = periods.find((p) => p.isActive) || null;

  useEffect(() => {
    if (!quickPeriod?.isActive) {
      setQuickCountdown("Đang đóng");
      return;
    }

    const updateCountdown = () => {
      const diffMs = dayjs(quickPeriod.endDate).diff(dayjs());
      if (diffMs <= 0) {
        setQuickCountdown("00:00:00");
        return;
      }
      const totalSeconds = Math.floor(diffMs / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const s = String(totalSeconds % 60).padStart(2, "0");
      setQuickCountdown(`${h}:${m}:${s}`);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [quickPeriod?._id, quickPeriod?.isActive, quickPeriod?.endDate]);

  const handleToggleActive = async (period: RegistrationPeriod, checked: boolean) => {
    setTogglingId(period._id);
    try {
      await registrationPeriodsApi.update(period._id, { isActive: checked });
      message.success(checked ? "Đã mở đợt đăng ký" : "Đã tắt đợt đăng ký");
      await loadPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được đợt đăng ký");
    } finally {
      setTogglingId(null);
    }
  };

  const handleMainToggle = async (checked: boolean) => {
    if (checked) {
      openForm.setFieldsValue({ endDate: dayjs().add(7, "day") });
      setOpenModalOpen(true);
      return;
    }

    if (!activePeriod) return;
    await handleToggleActive(activePeriod, false);
  };

  const handleContractExtensionToggle = async (checked: boolean) => {
    const prev = contractExtensionEnabled ?? true;
    // Optimistic UI: người dùng thấy toggle đổi ngay.
    setContractExtensionEnabled(checked);
    setContractExtensionToggling(true);
    try {
      const res = await dashboardApi.setContractExtensionSetting({ enable_contract_extension: checked });
      const next = res.data?.enable_contract_extension;
      if (typeof next === "boolean") setContractExtensionEnabled(next);
      else setContractExtensionEnabled(checked);
      message.success(checked ? "Đã bật gia hạn hợp đồng" : "Đã tắt gia hạn hợp đồng");
    } catch (err: unknown) {
      setContractExtensionEnabled(prev);
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được",
      );
    } finally {
      setContractExtensionToggling(false);
    }
  };

  const handleConfirmOpen = async (values: { endDate: ReturnType<typeof dayjs> }) => {
    const end = values.endDate;
    if (!end || end.isBefore(dayjs())) {
      message.error("Vui lòng chọn ngày giờ hết hạn lớn hơn hiện tại");
      return;
    }

    const now = dayjs();
    const target = activePeriod || periods[0] || null;
    setTogglingId(target?._id || "new");

    try {
      if (target) {
        await registrationPeriodsApi.update(target._id, {
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          isActive: true,
        });
      } else {
        await registrationPeriodsApi.create({
          name: `Mở đăng ký ${now.format("DD/MM/YYYY HH:mm")}`,
          startDate: now.toISOString(),
          endDate: end.toISOString(),
        });
      }
      message.success("Đã mở đăng ký nội trú");
      setOpenModalOpen(false);
      openForm.resetFields();
      await loadPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không mở được đợt đăng ký");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCreatePeriod = async (values: { name: string; startDate: ReturnType<typeof dayjs>; endDate: ReturnType<typeof dayjs> }) => {
    try {
      await registrationPeriodsApi.create({
        name: values.name,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
      });
      message.success("Đã tạo đợt đăng ký");
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadPeriods();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tạo được đợt đăng ký");
    }
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const s: DashboardStats = stats || {};
  const roomByArea = s.roomByArea || [];
  const revenueByMonth = (s.revenueByMonth || []).map((r) => ({ month: `${r._id.month}/${r._id.year}`, doanhThu: r.total }));

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Tổng phòng" value={s.totalRooms ?? 0} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Phòng trống" value={s.availableRooms ?? 0} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Sinh viên" value={s.totalStudents ?? 0} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            hoverable
            onClick={() => navigate("/admin/registrations")}
            style={{ cursor: "pointer" }}
          >
            <Statistic title="Đơn chờ duyệt" value={s.pendingRegistrations ?? 0} prefix={<FileAddOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate("/admin/violations")} style={{ cursor: "pointer" }}>
            <Statistic title="Vi phạm chờ xử lý" value={s.pendingViolations ?? 0} prefix={<WarningOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Tỉ lệ phòng trống">
            <Progress type="circle" percent={100 - (s.occupancyRate ?? 0)} format={(p) => `${p}% trống`} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title="Bật/tắt mở đợt đăng ký nội trú"
            loading={periodsLoading}
            extra={<Button onClick={() => setCreateModalOpen(true)}>Tạo đợt</Button>}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Đăng ký nội trú</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {activePeriod
                    ? `Đang mở - hết hạn ${dayjs(activePeriod.endDate).format("DD/MM/YYYY HH:mm")} (còn ${quickCountdown || "đang tính..."})`
                    : "Hiện đang đóng"}
                </div>
              </div>
              <Switch
                checked={!!activePeriod}
                checkedChildren="Bật"
                unCheckedChildren="Tắt"
                loading={!!togglingId}
                onChange={handleMainToggle}
              />
            </div>
            {periods.length === 0 ? (
              <span>Chưa có đợt đăng ký nào. Vui lòng tạo đợt trước khi bật.</span>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  Dùng công tắc phía trên để bật/tắt nhanh đợt đăng ký hiện tại.
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Bật/tắt gia hạn hợp đồng" loading={contractExtensionEnabled === null}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Gia hạn cho sinh viên</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {contractExtensionEnabled === false ? "Tắt — không cho gia hạn" : "Bật — cho phép gia hạn"}
                </div>
              </div>
              <Switch
                checked={contractExtensionEnabled ?? true}
                checkedChildren="Bật"
                unCheckedChildren="Tắt"
                loading={contractExtensionToggling}
                onChange={handleContractExtensionToggle}
              />
            </div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Nếu bật: sinh viên được gia hạn. Nếu tắt: không cho gia hạn.</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Thống kê phòng theo khu">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roomByArea}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="_id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#0d9488" name="Tổng" />
                <Bar dataKey="available" fill="#059669" name="Trống" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Doanh thu theo tháng (đã thanh toán)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`${Number(v)?.toLocaleString("vi-VN")}đ`, "Doanh thu"]} />
                <Line type="monotone" dataKey="doanhThu" stroke="#0d9488" strokeWidth={2} name="Doanh thu" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
      <Modal title="Tạo đợt đăng ký nội trú" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} footer={null}>
        <Form form={createForm} layout="vertical" onFinish={handleCreatePeriod}>
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true, message: "Nhập tên đợt" }]}>
            <Input placeholder="VD: Đợt 1 năm 2026" />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true, message: "Chọn ngày bắt đầu" }]}>
            <DatePicker style={{ width: "100%" }} showTime />
          </Form.Item>
          <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true, message: "Chọn ngày kết thúc" }]}>
            <DatePicker style={{ width: "100%" }} showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Tạo đợt</Button>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Mở đăng ký nội trú"
        open={openModalOpen}
        onCancel={() => setOpenModalOpen(false)}
        onOk={() => openForm.submit()}
        okText="Mở đăng ký"
        cancelText="Hủy"
      >
        <Form form={openForm} layout="vertical" onFinish={handleConfirmOpen}>
          <Form.Item
            name="endDate"
            label="Ngày giờ hết hạn nộp đơn"
            rules={[{ required: true, message: "Vui lòng chọn ngày giờ hết hạn" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              showTime
              disabledDate={(d) => !!d && d < dayjs().startOf("day")}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DashboardPage;
