import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi, registrationPeriodsApi, registrationsApi, roomsApi } from "../../api";

const { Title, Text } = Typography;

type RoomOption = {
  _id: string;
  roomNumber: string;
  roomType?: string;
  capacity: number;
  currentOccupancy: number;
  area?: { _id?: string; name?: string };
};

const REQUIRED_FIELDS = [
  { key: "studentId", label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "gender", label: "Giới tính" },
  { key: "phone", label: "SĐT" },
  { key: "address", label: "Quê quán/địa chỉ" },
  { key: "major", label: "Chuyên ngành" },
] as const;

const DormRegistrationPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [period, setPeriod] = useState<{ name?: string; startDate?: string; endDate?: string } | null>(null);
  const [countdown, setCountdown] = useState("00:00:00");

  const getAreaGenderLabel = (areaName?: string) => {
    if (!areaName) return "";
    const normalized = areaName.toLowerCase();
    if (normalized.includes("nữ") || normalized.includes("nu")) return "Nữ";
    if (normalized.includes("nam")) return "Nam";
    return "";
  };

  const missingFields = useMemo(() => {
    if (!user) return REQUIRED_FIELDS.map((f) => f.label);
    return REQUIRED_FIELDS.filter((f) => {
      const v = user[f.key];
      return !v || String(v).trim() === "";
    }).map((f) => f.label);
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, periodRes, roomRes] = await Promise.all([
          authApi.getProfile(),
          registrationPeriodsApi.getActive(),
          roomsApi.getAll(),
        ]);
        setUser(profileRes.data || null);
        setPeriod(periodRes.data || null);
        setRooms(roomRes.data?.rooms || []);
        form.setFieldsValue({
          fullName: profileRes.data?.fullName || "",
          studentId: profileRes.data?.studentId || "",
          gender: profileRes.data?.gender || "",
          phone: profileRes.data?.phone || "",
          address: profileRes.data?.address || "",
          major: profileRes.data?.major || "",
          room: searchParams.get("roomId") || undefined,
        });
      } catch {
        message.error("Không tải được dữ liệu đăng ký nội trú");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [form, searchParams]);

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

  const selectedAreaId = Form.useWatch("areaFilter", form);
  const selectedCapacity = Form.useWatch("capacityFilter", form);

  const areaOptions = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => {
      const id = r.area?._id;
      const name = r.area?.name;
      if (id && name && !map.has(id)) {
        const gender = getAreaGenderLabel(name);
        map.set(id, gender ? `${name} (${gender})` : name);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const byArea = !selectedAreaId || r.area?._id === selectedAreaId;
      const byCapacity = !selectedCapacity || String(r.capacity) === String(selectedCapacity);
      return byArea && byCapacity;
    });
  }, [rooms, selectedAreaId, selectedCapacity]);

  const selectedRoom = rooms.find((r) => r._id === form.getFieldValue("room"));
  const overCapacity = !!selectedRoom && selectedRoom.currentOccupancy >= selectedRoom.capacity;
  const periodOpen = !!period;
  const canSubmit = periodOpen && missingFields.length === 0;

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      Modal.confirm({
        title: "Xác nhận gửi đơn đăng ký nội trú",
        content: overCapacity
          ? "Xác nhận chọn phòng này, cho dù phòng này vượt quá số lượng đăng ký."
          : "Xác nhận gửi đơn đăng ký nội trú cho phòng đã chọn?",
        okText: "Xác nhận gửi",
        cancelText: "Hủy",
        onOk: async () => {
          setSubmitting(true);
          try {
            await registrationsApi.create({
              room: values.room,
              semester: values.semester,
              schoolYear: values.schoolYear,
              startDate: values.startDate?.format?.("YYYY-MM-DD"),
            });
            message.success("Đã gửi đơn đăng ký. Trạng thái ban đầu: Chờ duyệt.");
            navigate("/student/my-registrations");
          } catch (err: unknown) {
            message.error(
              (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                "Gửi đơn thất bại",
            );
          } finally {
            setSubmitting(false);
          }
        },
      });
    } catch {
      // Form validation message handled by antd.
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          Đăng ký nội trú
        </Title>

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
              <Col xs={24} md={12}>
                <Form.Item name="areaFilter" label="Chọn khu" rules={[{ required: true, message: "Vui lòng chọn khu" }]}>
                  <Select
                    placeholder="Chọn khu "
                    options={areaOptions}
                    onChange={() => form.setFieldsValue({ room: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="capacityFilter"
                  label="Loại phòng"
                  rules={[{ required: true, message: "Vui lòng chọn loại phòng" }]}
                >
                  <Select
                    placeholder="Chọn loại phòng"
                    onChange={() => form.setFieldsValue({ room: undefined })}
                    options={[
                      { value: "4", label: "Phòng 4 người" },
                      { value: "6", label: "Phòng 6 người" },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="room" label="Chọn phòng" rules={[{ required: true, message: "Vui lòng chọn phòng" }]}>
                  <Select
                    placeholder="Chọn phòng muốn đăng ký"
                    disabled={!selectedAreaId || !selectedCapacity}
                    options={filteredRooms.map((r) => ({
                      value: r._id,
                      label: `Phòng ${r.roomNumber}${r.area?.name ? ` - Khu ${r.area.name}${getAreaGenderLabel(r.area?.name) ? ` (${getAreaGenderLabel(r.area?.name)})` : ""}` : ""} - ${r.capacity} người (${r.currentOccupancy}/${r.capacity})`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="semester" label="Học kỳ" rules={[{ required: true, message: "Nhập học kỳ" }]}>
                  <Input placeholder="VD: 1" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item
                  name="schoolYear"
                  label="Năm học"
                  rules={[{ required: true, message: "Nhập năm học" }]}
                >
                  <Input placeholder="VD: 2026-2027" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="startDate"
                  label="Ngày bắt đầu ở"
                  rules={[{ required: true, message: "Chọn ngày bắt đầu" }]}
                >
                  <DatePicker style={{ width: "100%" }} disabledDate={(d) => !!d && d < dayjs().startOf("day")} />
                </Form.Item>
              </Col>
            </Row>

            {overCapacity && (
              <Alert
                style={{ marginBottom: 16 }}
                type="warning"
                showIcon
                message="Phòng đang vượt sức chứa"
                description="Bạn vẫn có thể gửi đơn. Admin sẽ xem xét và quyết định duyệt hoặc từ chối."
              />
            )}

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

