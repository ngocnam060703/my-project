import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { applicationsApi, authApi, registrationPeriodsApi } from "../../api";

const { Title, Text } = Typography;

const REQUIRED_FIELDS = [
  { key: "studentId", label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "gender", label: "Giới tính" },
  { key: "phone", label: "SĐT" },
  { key: "address", label: "Quê quán/địa chỉ" },
  { key: "major", label: "Chuyên ngành" },
  { key: "ethnicity", label: "Dân tộc" },
] as const;

const DormRegistrationPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [period, setPeriod] = useState<{ name?: string; startDate?: string; endDate?: string } | null>(null);
  const [countdown, setCountdown] = useState("00:00:00");
  const hydrateProfile = (profile: Record<string, unknown> | null) => {
    setUser(profile || null);
    form.setFieldsValue({
      fullName: profile?.fullName || "",
      studentId: profile?.studentId || "",
      gender: profile?.gender || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      major: profile?.major || "",
    });
  };

  const missingFields = useMemo(() => {
    if (!user) return REQUIRED_FIELDS.map((f) => f.label);
    const baseMissing: string[] = REQUIRED_FIELDS.filter((f) => {
      const v = user[f.key];
      return !v || String(v).trim() === "";
    }).map((f) => f.label);
    const priorityType = String(user.priorityType || "normal");
    if (priorityType !== "normal" && (!user.priorityProofUrl || String(user.priorityProofUrl).trim() === "")) {
      baseMissing.push("Minh chứng diện ưu tiên");
    }
    return baseMissing;
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, periodRes] = await Promise.all([authApi.getProfile(), registrationPeriodsApi.getActive()]);
        hydrateProfile((profileRes.data || null) as Record<string, unknown> | null);
        setPeriod(periodRes.data || null);
      } catch {
        message.error("Không tải được dữ liệu đăng ký nội trú");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [form]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      hydrateProfile(customEvent.detail || null);
    };
    window.addEventListener("student-profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("student-profile-updated", onProfileUpdated as EventListener);
  }, [form]);

  useEffect(() => {
    if (!period?.endDate) return;
    const end = dayjs(period.endDate);
    const timer = setInterval(() => {
      const diff = end.diff(dayjs(), "second");
      if (diff <= 0) {
        setCountdown("Đã hết hạn");
        return;
      }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(`${d} ngày ${h} giờ ${m} phút ${s} giây`);
    }, 1000);
    return () => clearInterval(timer);
  }, [period?.endDate]);

  const periodOpen = !!period;
  const canSubmit = periodOpen && missingFields.length === 0;

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      try {
        await applicationsApi.create({
          semester: values.semester,
          schoolYear: values.schoolYear,
          startDate: values.startDate?.format?.("YYYY-MM-DD"),
        });
        message.success("Đã gửi đơn đăng ký KTX. Bạn không chọn phòng; admin sẽ xếp phòng khi duyệt (hoặc để hệ thống tự chọn).");
        navigate("/student/my-applications");
      } catch (err: unknown) {
        message.error(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Gửi đơn thất bại",
        );
      } finally {
        setSubmitting(false);
      }
    } catch {
      // validation
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          Đăng ký nội trú
        </Title>

        <Alert
          type="info"
          showIcon
          message="Bạn không chọn phòng"
          description="Sau khi gửi đơn, admin sẽ xếp phòng cho bạn khi duyệt (hoặc để hệ thống tự chọn theo quy tắc)."
        />

        {periodOpen ? (
          <Alert
            type="success"
            showIcon
            message={`Đợt đăng ký đang mở${period?.name ? `: ${period.name}` : ""}`}
            description={
              <span>
                Thời gian kết thúc: {period?.endDate ? dayjs(period.endDate).format("DD/MM/YYYY HH:mm") : "-"}{" "}
                <Tag color="green" style={{ marginLeft: 8 }}>
                  Còn lại: {countdown}
                </Tag>
              </span>
            }
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Đăng ký nội trú hiện đang đóng"
            description="Admin chưa mở đợt đăng ký hoặc đợt hiện tại đã hết hạn."
          />
        )}

        {missingFields.length > 0 && (
          <Alert
            type="error"
            showIcon
            message="Hồ sơ cá nhân chưa đầy đủ"
            description={`Vui lòng cập nhật trước khi đăng ký: ${missingFields.join(", ")}.`}
            action={
              <Button size="small" type="primary" onClick={() => navigate("/student/profile")}>
                Cập nhật hồ sơ
              </Button>
            }
          />
        )}

        <Card title="Thông tin sinh viên (tự động lấy từ hồ sơ)" style={{ borderRadius: 12 }}>
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="fullName" label="Họ và tên">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="studentId" label="MSSV">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="gender" label="Giới tính">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="phone" label="SĐT">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="address" label="Quê quán/địa chỉ">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="major" label="Chuyên ngành">
                  <Input disabled />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="semester" label="Học kỳ" rules={[{ required: true, message: "Nhập học kỳ" }]}>
                  <Input placeholder="VD: HK1" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="schoolYear" label="Năm học" rules={[{ required: true, message: "Nhập năm học" }]}>
                  <Input placeholder="VD: 2026-2027" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="startDate"
                  label="Ngày bắt đầu ở"
                  rules={[{ required: true, message: "Chọn ngày bắt đầu" }]}
                >
                  <DatePicker style={{ width: "100%" }} disabledDate={(d) => !!d && d < dayjs().startOf("day")} />
                </Form.Item>
              </Col>
            </Row>

            <Button type="primary" onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
              Gửi đơn đăng ký nội trú
            </Button>
            {!canSubmit && (
              <Text type="secondary" style={{ marginLeft: 12 }}>
                Chỉ gửi được khi đợt đăng ký đang mở và hồ sơ cá nhân đã đầy đủ.
              </Text>
            )}
          </Form>
        </Card>
      </Space>
    </div>
  );
};

export default DormRegistrationPage;
