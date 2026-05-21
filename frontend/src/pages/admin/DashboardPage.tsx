import React, { useState, useEffect } from "react";
import { App, Row, Col, Card, Statistic, Spin, Progress, Switch, Space, Button, Modal, Form, Input, DatePicker, Select } from "antd";
import { HomeOutlined, TeamOutlined, FileAddOutlined, WarningOutlined } from "@ant-design/icons";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useNavigate } from "react-router-dom";
import { dashboardApi, registrationPeriodsApi } from "../../api";
import dayjs from "dayjs";
import { exportToExcel } from "../../utils/exportExcel";

interface DashboardStats {
  totalRooms?: number;
  availableRooms?: number;
  totalStudents?: number;
  pendingRegistrations?: number;
  pendingViolations?: number;
  roomByArea?: { _id: string; total: number; available: number }[];
  revenueByMonth?: { _id?: { year: number; month: number }; total?: number; month?: string; doanhThu?: number }[];
  occupancyRate?: number;
  timeRange?: { key: string; label: string; start: string; end: string };
  overview?: {
    pendingApplications: number;
    availableRooms: number;
    residentStudents: number;
    estimatedRevenue: number;
  };
  roomPerformance?: {
    summary?: {
      totalRooms: number;
      availableRooms: number;
      fullRooms: number;
      maintenanceRooms: number;
      totalBeds: number;
      occupiedBeds: number;
      emptyBeds: number;
      occupancyRate: number;
    };
    byArea?: Array<{ areaName: string; totalRooms: number; emptyBeds: number; fillRate: number }>;
  };
  billing?: {
    summary?: { paidRevenue: number; outstandingDebt: number; unpaidBills: number; overdueBills: number };
    debtList?: Array<{
      studentName: string;
      studentId?: string;
      roomNumber: string;
      areaName?: string;
      period: string;
      total: number;
      status: string;
      dueDate: string;
    }>;
    revenueSeries?: Array<{ month: string; doanhThu: number }>;
  };
  incidents?: {
    summary?: {
      totalReports: number;
      pendingReports: number;
      processingReports: number;
      resolvedReports: number;
      totalViolations: number;
      pendingViolations: number;
      resolvedViolations: number;
    };
    topIssueRooms?: Array<{
      roomNumber: string;
      areaName?: string;
      maintenanceReports: number;
      violations: number;
      totalIssues: number;
    }>;
  };
}

interface RegistrationPeriod {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const DashboardPage: React.FC = () => {
  const { message } = App.useApp();
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
  const [range, setRange] = useState<"7d" | "14d" | "month">("7d");
  const [roomStatus, setRoomStatus] = useState<"all" | "available" | "full" | "maintenance">("all");
  const [billStatus, setBillStatus] = useState<"all" | "unpaid" | "pending" | "overdue" | "paid">("all");
  const [billPeriodType, setBillPeriodType] = useState<"month" | "quarter" | "year">("month");
  const [billYear, setBillYear] = useState<number>(dayjs().year());
  const [billMonth, setBillMonth] = useState<number>(dayjs().month() + 1);
  const [billQuarter, setBillQuarter] = useState<number>(Math.floor(dayjs().month() / 3) + 1);
  const [maintenanceType, setMaintenanceType] = useState<"all" | "electricity" | "water" | "equipment" | "other">("all");
  const [maintenanceStatus, setMaintenanceStatus] = useState<"all" | "pending" | "processing" | "resolved">("all");
  const [violationSeverity, setViolationSeverity] = useState<"all" | "light" | "medium" | "heavy">("all");

  const loadDashboardStats = async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.getStats({
        range,
        roomStatus,
        billStatus,
        billPeriodType,
        billYear,
        billMonth,
        billQuarter,
        maintenanceType,
        maintenanceStatus,
        violationSeverity,
      });
      setStats(res.data);
    } catch (err: unknown) {
      const st = (err as { response?: { status?: number } })?.response?.status;
      message.error(
        st === 429
          ? "Quá nhiều yêu cầu (429). Thử lại sau vài phút."
          : "Không tải được thống kê dashboard",
      );
    } finally {
      setLoading(false);
    }
  };

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
    void loadDashboardStats();
    void loadPeriods();
    void loadContractExtensionSetting();
  }, [range, roomStatus, billStatus, billPeriodType, billYear, billMonth, billQuarter, maintenanceType, maintenanceStatus, violationSeverity]);

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
  const revenueByMonth =
    s.billing?.revenueSeries?.length
      ? s.billing.revenueSeries
      : (s.revenueByMonth || []).map((r) => ({
          month: r.month || `${r._id?.month || ""}/${r._id?.year || ""}`,
          doanhThu: Number(r.doanhThu ?? r.total ?? 0),
        }));
  const overview = s.overview || {
    pendingApplications: s.pendingRegistrations || 0,
    availableRooms: s.availableRooms || 0,
    residentStudents: s.totalStudents || 0,
    estimatedRevenue: 0,
  };
  const roomPerf = s.roomPerformance?.summary;
  const billingSummary = s.billing?.summary;
  const incidentSummary = s.incidents?.summary;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select value={range} style={{ width: 170 }} onChange={(v) => setRange(v)}>
            <Select.Option value="7d">7 ngày gần nhất</Select.Option>
            <Select.Option value="14d">14 ngày gần nhất</Select.Option>
            <Select.Option value="month">Tháng này</Select.Option>
          </Select>
          <Select value={roomStatus} style={{ width: 140 }} onChange={(v) => setRoomStatus(v)}>
            <Select.Option value="all">Phòng: tất cả</Select.Option>
            <Select.Option value="available">Phòng trống</Select.Option>
            <Select.Option value="full">Phòng đầy</Select.Option>
            <Select.Option value="maintenance">Bảo trì</Select.Option>
          </Select>
          <Select value={billStatus} style={{ width: 170 }} onChange={(v) => setBillStatus(v)}>
            <Select.Option value="all">Hóa đơn: tất cả</Select.Option>
            <Select.Option value="paid">Đã thanh toán</Select.Option>
            <Select.Option value="unpaid">Chưa thanh toán</Select.Option>
            <Select.Option value="pending">Chưa thanh toán (legacy)</Select.Option>
            <Select.Option value="overdue">Quá hạn</Select.Option>
          </Select>
          <Select value={billPeriodType} style={{ width: 150 }} onChange={(v) => setBillPeriodType(v)}>
            <Select.Option value="month">Theo tháng</Select.Option>
            <Select.Option value="quarter">Theo quý</Select.Option>
            <Select.Option value="year">Theo năm</Select.Option>
          </Select>
          <Select value={billYear} style={{ width: 110 }} onChange={(v) => setBillYear(v)}>
            {[dayjs().year() - 1, dayjs().year(), dayjs().year() + 1].map((y) => (
              <Select.Option key={y} value={y}>{y}</Select.Option>
            ))}
          </Select>
          {billPeriodType === "month" && (
            <Select value={billMonth} style={{ width: 110 }} onChange={(v) => setBillMonth(v)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <Select.Option key={m} value={m}>Tháng {m}</Select.Option>
              ))}
            </Select>
          )}
          {billPeriodType === "quarter" && (
            <Select value={billQuarter} style={{ width: 110 }} onChange={(v) => setBillQuarter(v)}>
              {[1, 2, 3, 4].map((q) => (
                <Select.Option key={q} value={q}>Quý {q}</Select.Option>
              ))}
            </Select>
          )}
          <Select value={maintenanceType} style={{ width: 160 }} onChange={(v) => setMaintenanceType(v)}>
            <Select.Option value="all">Sự cố: tất cả</Select.Option>
            <Select.Option value="electricity">Điện</Select.Option>
            <Select.Option value="water">Nước</Select.Option>
            <Select.Option value="equipment">Thiết bị</Select.Option>
            <Select.Option value="other">Khác</Select.Option>
          </Select>
          <Select value={maintenanceStatus} style={{ width: 150 }} onChange={(v) => setMaintenanceStatus(v)}>
            <Select.Option value="all">XL sự cố: tất cả</Select.Option>
            <Select.Option value="pending">Chờ xử lý</Select.Option>
            <Select.Option value="processing">Đang xử lý</Select.Option>
            <Select.Option value="resolved">Đã xử lý</Select.Option>
          </Select>
          <Select value={violationSeverity} style={{ width: 150 }} onChange={(v) => setViolationSeverity(v)}>
            <Select.Option value="all">Vi phạm: tất cả</Select.Option>
            <Select.Option value="light">Nhẹ</Select.Option>
            <Select.Option value="medium">Trung bình</Select.Option>
            <Select.Option value="heavy">Nặng</Select.Option>
          </Select>
          <Button onClick={() => void loadDashboardStats()}>Làm mới</Button>
          <Button
            onClick={() =>
              exportToExcel(
                [
                  {
                    "Mốc thời gian": s.timeRange?.label || "—",
                    "Đơn chờ duyệt": overview.pendingApplications,
                    "Phòng trống": overview.availableRooms,
                    "Sinh viên đang lưu trú": overview.residentStudents,
                    "Doanh thu tạm tính": overview.estimatedRevenue,
                    "Doanh thu đã thu": billingSummary?.paidRevenue || 0,
                    "Công nợ chưa thu": billingSummary?.outstandingDebt || 0,
                  },
                ],
                `dashboard-tong-quan-${dayjs().format("YYYYMMDD-HHmm")}`,
                "TongQuan"
              )
            }
          >
            Xuất Excel
          </Button>
        </Space>
      </Card>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Đơn chờ duyệt" value={overview.pendingApplications} prefix={<FileAddOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Phòng trống" value={overview.availableRooms} prefix={<HomeOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="SV đang lưu trú" value={overview.residentStudents} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Doanh thu tạm tính" value={overview.estimatedRevenue} formatter={(v) => `${Number(v).toLocaleString("vi-VN")}đ`} /></Card>
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
            <Progress type="circle" percent={100 - (roomPerf?.occupancyRate ?? s.occupancyRate ?? 0)} format={(p) => `${p}% trống`} />
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
              <Space orientation="vertical" style={{ width: "100%" }}>
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
          <Card title="Doanh thu theo kỳ (đã thanh toán)">
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
      <Row gutter={[24, 24]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title="Thống kê doanh thu & công nợ"
            extra={
              <Button
                size="small"
                onClick={() =>
                  exportToExcel(
                    (s.billing?.debtList || []).map((d) => ({
                      "Sinh viên": d.studentName,
                      "Mã SV": d.studentId || "",
                      "Phòng": `${d.roomNumber}${d.areaName ? ` (${d.areaName})` : ""}`,
                      "Kỳ": d.period,
                      "Số tiền": d.total,
                      "Trạng thái": d.status,
                      "Hạn thanh toán": d.dueDate ? dayjs(d.dueDate).format("DD/MM/YYYY") : "",
                    })),
                    `cong-no-${dayjs().format("YYYYMMDD-HHmm")}`,
                    "CongNo"
                  )
                }
              >
                Xuất công nợ
              </Button>
            }
          >
            <p style={{ marginBottom: 8 }}>
              <strong>Doanh thu đã thu:</strong> {(billingSummary?.paidRevenue || 0).toLocaleString("vi-VN")}đ
            </p>
            <p style={{ marginBottom: 8 }}>
              <strong>Công nợ chưa thu:</strong> {(billingSummary?.outstandingDebt || 0).toLocaleString("vi-VN")}đ
            </p>
            <p style={{ marginBottom: 16 }}>
              <strong>Hóa đơn quá hạn:</strong> {billingSummary?.overdueBills || 0}
            </p>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #f3f4f6", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>SV</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Phòng</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Kỳ</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.billing?.debtList || []).slice(0, 10).map((d, idx) => (
                    <tr key={`${d.studentName}-${idx}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 8 }}>{d.studentName}</td>
                      <td style={{ padding: 8 }}>{d.roomNumber}</td>
                      <td style={{ padding: 8 }}>{d.period}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(d.total || 0).toLocaleString("vi-VN")}đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Thống kê sự cố & kỷ luật"
            extra={
              <Button
                size="small"
                onClick={() =>
                  exportToExcel(
                    (s.incidents?.topIssueRooms || []).map((r) => ({
                      "Phòng": `${r.roomNumber}${r.areaName ? ` (${r.areaName})` : ""}`,
                      "Số sự cố": r.maintenanceReports,
                      "Số vi phạm": r.violations,
                      "Tổng phát sinh": r.totalIssues,
                    })),
                    `su-co-ky-luat-${dayjs().format("YYYYMMDD-HHmm")}`,
                    "SuCoKyLuat"
                  )
                }
              >
                Xuất sự cố
              </Button>
            }
          >
            <p style={{ marginBottom: 8 }}>
              <strong>Yêu cầu sửa chữa:</strong> {incidentSummary?.totalReports || 0} (chờ {incidentSummary?.pendingReports || 0}, xử lý {incidentSummary?.processingReports || 0})
            </p>
            <p style={{ marginBottom: 16 }}>
              <strong>Vi phạm:</strong> {incidentSummary?.totalViolations || 0} (chờ xử lý {incidentSummary?.pendingViolations || 0})
            </p>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #f3f4f6", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Phòng</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Sự cố</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Vi phạm</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.incidents?.topIssueRooms || []).slice(0, 10).map((r, idx) => (
                    <tr key={`${r.roomNumber}-${idx}`} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 8 }}>{r.roomNumber}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{r.maintenanceReports}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{r.violations}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{r.totalIssues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
