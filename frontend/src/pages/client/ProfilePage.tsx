import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Form,
  Input,
  DatePicker,
  Button,
  message,
  Typography,
  Descriptions,
  Alert,
  Spin,
  Space,
  Row,
  Col,
  Tabs,
  Tag,
  Avatar,
  Grid,
  Divider,
  Flex,
} from "antd";
import dayjs from "dayjs";
import { EditOutlined, HomeOutlined, UserOutlined, IdcardOutlined, BookOutlined, PhoneOutlined } from "@ant-design/icons";
import { authApi, studentsApi } from "../../api";
import type { StudentProfileResponse } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { setUserString } from "../../utils/authStorage";

const { Title, Text, Paragraph } = Typography;

const brand = { primary: "#0d9488", primaryDark: "#0f766e", softBg: "rgba(13, 148, 136, 0.06)", border: "rgba(13, 148, 136, 0.15)" };

function FormSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" gap={12} style={{ marginTop: 8, marginBottom: 16 }}>
      <Text strong style={{ color: brand.primaryDark, fontSize: 15, whiteSpace: "nowrap" }}>
        {children}
      </Text>
      <div style={{ flex: 1, minWidth: 0, height: 1, background: brand.border }} aria-hidden />
    </Flex>
  );
}

function ProfileTabPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: brand.softBg,
        borderRadius: 12,
        padding: 20,
        border: `1px solid ${brand.border}`,
        minHeight: 180,
      }}
    >
      {children}
    </div>
  );
}

/** Hiển thị ngày sinh dạng DD/MM/YYYY */
function formatDateVi(d?: string | Date | null): string {
  if (!d) return "—";
  const x = dayjs(d);
  return x.isValid() ? x.format("DD/MM/YYYY") : "—";
}

/** Ẩn một phần số CCCD khi chỉ xem */
function maskCitizenId(id?: string | null): string {
  if (!id || String(id).trim() === "") return "—";
  const s = String(id).replace(/\s/g, "");
  if (s.length <= 4) return "•".repeat(s.length);
  const visible = 4;
  const dots = Math.min(10, s.length - visible);
  return `${"•".repeat(dots)}${s.slice(-visible)}`;
}


interface DashboardRoom {
  roomNumber: string;
  area?: string | { name?: string };
  floor?: number;
  roomType?: string;
  sectionTitle?: string;
  contextLabel?: string;
  context?: string;
}

function formatRoomArea(area: DashboardRoom["area"]): string {
  if (area == null) return "—";
  if (typeof area === "string" && area.trim()) return area.trim();
  if (typeof area === "object" && area.name && String(area.name).trim()) return String(area.name).trim();
  return "—";
}

function dashboardStatusTagColor(s?: string): string {
  if (s === "member") return "green";
  if (s === "approved_waiting_payment") return "blue";
  if (s === "pending") return "gold";
  return "default";
}

interface ProfilePayload {
  _id?: string;
  id?: string;
  email?: string;
  fullName?: string;
  role?: string;
  studentId?: string;
  className?: string;
  major?: string;
  dateOfBirth?: string | null;
  gender?: string;
  phone?: string;
  address?: string;
  citizenId?: string;
  profileComplete?: boolean;
  faculty?: string;
  enrollmentDate?: string | null;
  homeroomTeacher?: string;
  addressNative?: string;
  addressPermanent?: string;
  addressTemporary?: string;
  addressAbsent?: string;
  familyFatherName?: string;
  familyFatherPhone?: string;
  familyMotherName?: string;
  familyMotherPhone?: string;
  familyEmergencyPhone?: string;
  avatar?: string;
}

const ProfilePage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const { setUser } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [room, setRoom] = useState<DashboardRoom | null>(null);
  const [dashMeta, setDashMeta] = useState<{ studentStatus?: string; memberStatusLabel?: string }>({});
  /** Sinh viên đã đủ hồ sơ: bật form khi bấm «Chỉnh sửa hồ sơ» */
  const [editingProfile, setEditingProfile] = useState(false);

  const syncAuthUser = useCallback((p: ProfilePayload) => {
    setUser((prev) => {
      const merged = {
        ...prev,
        ...p,
        id: p.id || p._id || prev?.id,
        email: p.email ?? prev?.email ?? "",
        fullName: p.fullName ?? prev?.fullName ?? "",
        role: p.role ?? prev?.role ?? "user",
      };
      setUserString(JSON.stringify(merged));
      return merged;
    });
  }, [setUser]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pres = await authApi.getProfile();
      const p = pres.data as ProfilePayload;
      let activeProfile: ProfilePayload = p;
      setProfile(p);
      syncAuthUser(p);

      if (p.role === "user") {
        try {
          const detail = (await studentsApi.getMe()).data as StudentProfileResponse;
          activeProfile = detail.student as ProfilePayload;
          setProfile(activeProfile);
          syncAuthUser(activeProfile);
          setRoom((detail.currentRoom ?? null) as DashboardRoom | null);
          setDashMeta({
            studentStatus: detail.residenceStatus,
            memberStatusLabel: detail.residenceStatus === "dang_o" ? "Đang ở" : "Đã rời",
          });
        } catch {
          setRoom(null);
          setDashMeta({});
        }
      } else {
        setRoom(null);
        setDashMeta({});
      }

      form.setFieldsValue({
        fullName: activeProfile.fullName,
        studentId: activeProfile.studentId,
        className: activeProfile.className,
        major: activeProfile.major,
        gender: activeProfile.gender,
        citizenId: activeProfile.citizenId,
        dateOfBirth: activeProfile.dateOfBirth ? dayjs(activeProfile.dateOfBirth) : null,
        phone: activeProfile.phone,
        address: activeProfile.address,
        faculty: activeProfile.faculty,
        enrollmentDate: activeProfile.enrollmentDate ? dayjs(activeProfile.enrollmentDate) : null,
        homeroomTeacher: activeProfile.homeroomTeacher,
        avatar: activeProfile.avatar,
        addressNative: activeProfile.addressNative,
        addressPermanent: activeProfile.addressPermanent,
        addressTemporary: activeProfile.addressTemporary,
        addressAbsent: activeProfile.addressAbsent,
        familyFatherName: activeProfile.familyFatherName,
        familyFatherPhone: activeProfile.familyFatherPhone,
        familyMotherName: activeProfile.familyMotherName,
        familyMotherPhone: activeProfile.familyMotherPhone,
        familyEmergencyPhone: activeProfile.familyEmergencyPhone,
      });
    } catch {
      message.error("Không tải được hồ sơ");
    } finally {
      setLoading(false);
    }
  }, [form, syncAuthUser]);

  useEffect(() => {
    load();
  }, [load]);

  const onFinishStudent = async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      const normalizeFormDate = (value: unknown): string | null | undefined => {
        if (value === null) return null;
        if (value === undefined || value === "") return undefined;
        const d = dayjs(value as dayjs.ConfigType);
        return d.isValid() ? d.format("YYYY-MM-DD") : undefined;
      };
      const res = await studentsApi.updateMe({
        fullName: v.fullName as string,
        phone: v.phone as string,
        studentId: v.studentId as string,
        className: v.className as string,
        major: v.major as string,
        gender: v.gender as string,
        citizenId: v.citizenId as string,
        dateOfBirth: normalizeFormDate(v.dateOfBirth),
        address: v.address as string,
        faculty: v.faculty as string,
        enrollmentDate: normalizeFormDate(v.enrollmentDate),
        homeroomTeacher: v.homeroomTeacher as string,
        avatar: v.avatar as string,
        addressNative: v.addressNative as string | undefined,
        addressPermanent: v.addressPermanent as string | undefined,
        addressTemporary: v.addressTemporary as string | undefined,
        addressAbsent: v.addressAbsent as string | undefined,
        familyFatherName: v.familyFatherName as string | undefined,
        familyFatherPhone: v.familyFatherPhone as string | undefined,
        familyMotherName: v.familyMotherName as string | undefined,
        familyMotherPhone: v.familyMotherPhone as string | undefined,
        familyEmergencyPhone: v.familyEmergencyPhone as string | undefined,
      });
      const detail = res.data as StudentProfileResponse;
      const updated = detail.student as ProfilePayload;
      setProfile(updated);
      setRoom((detail.currentRoom ?? null) as DashboardRoom | null);
      setDashMeta({
        studentStatus: detail.residenceStatus,
        memberStatusLabel: detail.residenceStatus === "dang_o" ? "Đang ở" : "Đã rời",
      });
      syncAuthUser(updated);
      setEditingProfile(false);
      message.success("Đã cập nhật hồ sơ");
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Cập nhật thất bại";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onFinishStaff = async (v: { fullName: string; phone?: string; address?: string }) => {
    setSaving(true);
    try {
      const res = await authApi.updateProfile(v);
      const updated = res.data as ProfilePayload;
      setProfile(updated);
      syncAuthUser(updated);
      message.success("Cập nhật thành công");
    } catch {
      message.error("Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }

  const isStudent = profile.role === "user";
  const complete = !!profile.profileComplete;

  const openStudentEdit = () => {
    if (!profile) return;
    form.setFieldsValue({
      fullName: profile.fullName,
      studentId: profile.studentId,
      className: profile.className,
      major: profile.major,
      gender: profile.gender,
      citizenId: profile.citizenId,
      dateOfBirth: profile.dateOfBirth ? dayjs(profile.dateOfBirth) : null,
      phone: profile.phone,
      address: profile.address,
      faculty: profile.faculty,
      enrollmentDate: profile.enrollmentDate ? dayjs(profile.enrollmentDate) : null,
      homeroomTeacher: profile.homeroomTeacher,
      avatar: profile.avatar,
      addressNative: profile.addressNative,
      addressPermanent: profile.addressPermanent,
      addressTemporary: profile.addressTemporary,
      addressAbsent: profile.addressAbsent,
      familyFatherName: profile.familyFatherName,
      familyFatherPhone: profile.familyFatherPhone,
      familyMotherName: profile.familyMotherName,
      familyMotherPhone: profile.familyMotherPhone,
      familyEmergencyPhone: profile.familyEmergencyPhone,
    });
    setEditingProfile(true);
  };

  const profileSidebar = (
    <Card
      variant="borderless"
      style={{
        height: "100%",
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        boxShadow: "0 8px 30px rgba(15, 118, 110, 0.08)",
        background: "linear-gradient(180deg, #fff 0%, var(--bg-content, #fafafa) 100%)",
        overflow: "hidden",
      }}
      styles={{
        body: { padding: 28 },
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 108,
            height: 108,
            margin: "0 auto",
            borderRadius: "50%",
            padding: 4,
            background: `linear-gradient(135deg, ${brand.primary}, ${brand.primaryDark})`,
            boxShadow: `0 8px 24px ${brand.border}`,
          }}
        >
          <Avatar
            size={100}
            src={profile.avatar || undefined}
            style={{ background: "#fff", color: brand.primary }}
            icon={<UserOutlined style={{ fontSize: 42 }} />}
          />
        </div>
        <Title level={4} style={{ marginTop: 20, marginBottom: 6, fontWeight: 800, color: "var(--text-primary, #111827)" }}>
          {profile.fullName || "—"}
        </Title>
        {isStudent && (
          <Text type="secondary" style={{ fontSize: 14, display: "block", letterSpacing: 0.3 }}>
            MSSV · <Text strong style={{ color: brand.primaryDark }}>{profile.studentId || "—"}</Text>
          </Text>
        )}
        {profile.email && (
          <Paragraph
            type="secondary"
            ellipsis={{ rows: 2, tooltip: profile.email }}
            style={{ marginTop: 12, marginBottom: 0, fontSize: 13, wordBreak: "break-all" }}
          >
            {profile.email}
          </Paragraph>
        )}
        {!isStudent && (
          <Text type="secondary" style={{ fontSize: 14, display: "block", marginTop: 12 }}>
            {profile.role === "admin" ? "Quản trị viên" : profile.role === "manager" ? "Quản lý khu" : profile.role}
          </Text>
        )}
        {isStudent && (
          <div style={{ marginTop: 18 }}>
            <Tag
              color={dashboardStatusTagColor(dashMeta.studentStatus)}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                whiteSpace: "normal",
                textAlign: "center",
                lineHeight: 1.45,
                borderRadius: 8,
                maxWidth: "100%",
                marginInlineEnd: 0,
              }}
            >
              {dashMeta.memberStatusLabel || "Đang tải trạng thái…"}
            </Tag>
          </div>
        )}
      </div>
    </Card>
  );

  const studentFormCard = (
    <Card
      variant="borderless"
      title={
        <Flex align="center" gap={12} wrap="wrap">
          <span style={{ fontSize: 18, fontWeight: 700, color: brand.primaryDark }}>
            {complete ? "Chỉnh sửa hồ sơ" : "Cập nhật hồ sơ sinh viên"}
          </span>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
            Điền theo thứ tự từ trên xuống — các mục có dấu * là bắt buộc.
          </Text>
        </Flex>
      }
      style={{ borderRadius: 16, border: `1px solid ${brand.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
      styles={{ body: { paddingTop: 8 } }}
      extra={
        complete && editingProfile ? (
          <Button onClick={() => setEditingProfile(false)}>Hủy chỉnh sửa</Button>
        ) : undefined
      }
    >
      <Form form={form} layout="vertical" onFinish={onFinishStudent} requiredMark="optional">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10 }}
          message="Cập nhật hồ sơ sinh viên đầy đủ"
          description="Bạn có thể tự cập nhật đầy đủ thông tin cá nhân, học tập, gia đình và địa chỉ trên biểu mẫu này."
        />
        <FormSectionTitle>Thông tin cơ bản</FormSectionTitle>
        <Row gutter={[20, 0]}>
          <Col xs={24} lg={12}>
            <Form.Item label="Họ tên" name="fullName" rules={[{ required: true, message: "Nhập họ tên" }]}>
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Email đăng nhập">
              <Input size="large" value={profile.email} disabled />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Mã sinh viên" name="studentId" rules={[{ required: true, message: "Nhập mã sinh viên" }]}>
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Lớp" name="className">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Chuyên ngành" name="major">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Giới tính" name="gender">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="citizenId" label="CCCD/CMND" rules={[{ pattern: /^\d{9,12}$/, message: "CCCD phải gồm 9-12 chữ số" }]}>
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="dateOfBirth" label="Ngày sinh">
              <DatePicker size="large" style={{ width: "100%" }} format="DD/MM/YYYY" placeholder="Chọn ngày sinh" />
            </Form.Item>
          </Col>
        </Row>
        <FormSectionTitle>Thông tin học tập</FormSectionTitle>
        <Row gutter={[20, 0]}>
          <Col xs={24} lg={12}>
            <Form.Item label="Khoa" name="faculty">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="enrollmentDate" label="Ngày nhập học">
              <DatePicker size="large" style={{ width: "100%" }} format="DD/MM/YYYY" placeholder="Chọn ngày nhập học" />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item label="Giáo viên chủ nhiệm" name="homeroomTeacher">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <FormSectionTitle>Avatar</FormSectionTitle>
        <Form.Item
          name="avatar"
          label="Ảnh đại diện (URL)"
          rules={[
            {
              validator: (_, value) => {
                const s = value != null ? String(value).trim() : "";
                if (!s) return Promise.resolve();
                try {
                  const u = new URL(s);
                  if (u.protocol !== "http:" && u.protocol !== "https:") {
                    return Promise.reject(new Error("Avatar phải là URL http(s) hợp lệ"));
                  }
                  return Promise.resolve();
                } catch {
                  return Promise.reject(new Error("Avatar phải là URL hợp lệ"));
                }
              },
            },
          ]}
        >
          <Input size="large" placeholder="https://..." allowClear />
        </Form.Item>
        <FormSectionTitle>Liên hệ</FormSectionTitle>
        <Row gutter={[20, 0]}>
          <Col xs={24} lg={12}>
            <Form.Item
              label="Số điện thoại"
              name="phone"
              rules={[
                { required: true, message: "Nhập SĐT" },
                { pattern: /^(0|\+84)\d{9,10}$/, message: "SĐT không hợp lệ" },
              ]}
            >
              <Input size="large" placeholder="0387079343" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <FormSectionTitle>Địa chỉ</FormSectionTitle>
        <Form.Item name="address" label="Địa chỉ liên hệ">
          <Input.TextArea rows={2} showCount maxLength={500} />
        </Form.Item>
        <Form.Item name="addressNative" label="Quê quán">
          <Input.TextArea rows={2} showCount maxLength={500} />
        </Form.Item>
        <Form.Item name="addressPermanent" label="Thường trú">
          <Input.TextArea rows={2} showCount maxLength={500} />
        </Form.Item>
        <Form.Item name="addressTemporary" label="Tạm trú">
          <Input.TextArea rows={2} showCount maxLength={500} />
        </Form.Item>
        <Form.Item name="addressAbsent" label="Tạm vắng">
          <Input.TextArea rows={2} showCount maxLength={500} />
        </Form.Item>
        <FormSectionTitle>Liên hệ khẩn</FormSectionTitle>
        <Row gutter={[20, 0]}>
          <Col xs={24} lg={12}>
            <Form.Item name="familyFatherName" label="Họ tên bố">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="familyFatherPhone" label="SĐT bố">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="familyMotherName" label="Họ tên mẹ">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} lg={12}>
            <Form.Item name="familyMotherPhone" label="SĐT mẹ">
              <Input size="large" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="familyEmergencyPhone" label="SĐT gia đình khi khẩn cấp">
          <Input size="large" allowClear />
        </Form.Item>
        <Divider style={{ margin: "8px 0 20px" }} />
        <Form.Item style={{ marginBottom: 0 }}>
          <Flex gap="middle" wrap="wrap">
            <Button type="primary" htmlType="submit" loading={saving} size="large" style={{ minWidth: 140 }}>
              Lưu hồ sơ
            </Button>
            {complete && editingProfile && (
              <Button size="large" onClick={() => setEditingProfile(false)}>
                Hủy
              </Button>
            )}
          </Flex>
        </Form.Item>
      </Form>
    </Card>
  );

  const tabDescProps = {
    column: 1 as const,
    layout: "vertical" as const,
    size: "middle" as const,
    bordered: false,
    styles: {
      label: { color: "#6b7280", fontWeight: 600, fontSize: 13, paddingBottom: 4 },
      content: { fontSize: 15, fontWeight: 500, color: "var(--text-primary, #111827)", paddingBottom: 14 },
    },
  };

  const tabLabel = (icon: React.ReactNode, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: brand.primary, fontSize: 16, display: "flex" }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{text}</span>
    </span>
  );

  const studentTabs = (
    <Card
      variant="borderless"
      style={{ borderRadius: 16, border: `1px solid ${brand.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
      styles={{ body: { paddingTop: 12 } }}
      title={
        <Text strong style={{ fontSize: 17, color: brand.primaryDark }}>
          Chi tiết hồ sơ
        </Text>
      }
    >
      <Tabs
        defaultActiveKey="basic"
        tabPosition={screens.md ? "left" : "top"}
        size="middle"
        tabBarGutter={screens.md ? 12 : 24}
        style={{ minHeight: screens.md ? 340 : undefined }}
        tabBarStyle={
          screens.md
            ? { minWidth: 200, paddingRight: 8 }
            : { marginBottom: 8, borderBottom: `1px solid ${brand.border}` }
        }
        tabBarExtraContent={
          <Button type="primary" icon={<EditOutlined />} onClick={openStudentEdit} size="middle">
            Chỉnh sửa hồ sơ
          </Button>
        }
        items={[
          {
            key: "basic",
            label: tabLabel(<IdcardOutlined />, "Thông tin cơ bản"),
            children: (
              <ProfileTabPanel>
                <Descriptions {...tabDescProps}>
                  <Descriptions.Item label="Ngày sinh">{formatDateVi(profile.dateOfBirth)}</Descriptions.Item>
                  <Descriptions.Item label="Giới tính">{profile.gender || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Quê quán / địa chỉ">{profile.address || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Số CCCD">
                    <Text code style={{ fontSize: 14 }}>{maskCitizenId(profile.citizenId)}</Text>
                  </Descriptions.Item>
                </Descriptions>
              </ProfileTabPanel>
            ),
          },
          {
            key: "edu",
            label: tabLabel(<BookOutlined />, "Học vấn"),
            children: (
              <ProfileTabPanel>
                <Descriptions {...tabDescProps}>
                  <Descriptions.Item label="Lớp">{profile.className || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Chuyên ngành">{profile.major || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Khoa">{profile.faculty || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Ngày nhập học">{formatDateVi(profile.enrollmentDate)}</Descriptions.Item>
                  <Descriptions.Item label="GVCN">{profile.homeroomTeacher || "—"}</Descriptions.Item>
                </Descriptions>
              </ProfileTabPanel>
            ),
          },
          {
            key: "contact",
            label: tabLabel(<PhoneOutlined />, "Liên hệ"),
            children: (
              <ProfileTabPanel>
                <Descriptions {...tabDescProps}>
                  <Descriptions.Item label="Số điện thoại">{profile.phone?.trim() || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Email">{profile.email || "—"}</Descriptions.Item>
                </Descriptions>
              </ProfileTabPanel>
            ),
          },
          {
            key: "extended",
            label: tabLabel(<IdcardOutlined />, "Hồ sơ mở rộng"),
            children: (
              <ProfileTabPanel>
                <Descriptions {...tabDescProps}>
                  <Descriptions.Item label="Khoa">{profile.faculty || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Ngày nhập học">{formatDateVi(profile.enrollmentDate)}</Descriptions.Item>
                  <Descriptions.Item label="GVCN">{profile.homeroomTeacher || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Quê quán">{profile.addressNative || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Thường trú">{profile.addressPermanent || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Tạm trú">{profile.addressTemporary || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Tạm vắng">{profile.addressAbsent || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Bố — họ tên">{profile.familyFatherName || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Bố — SĐT">{profile.familyFatherPhone || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Mẹ — họ tên">{profile.familyMotherName || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Mẹ — SĐT">{profile.familyMotherPhone || "—"}</Descriptions.Item>
                  <Descriptions.Item label="SĐT liên hệ khẩn">{profile.familyEmergencyPhone || "—"}</Descriptions.Item>
                </Descriptions>
              </ProfileTabPanel>
            ),
          },
          {
            key: "room",
            label: tabLabel(<HomeOutlined />, "Nơi ở hiện tại"),
            children: (
              <ProfileTabPanel>
                {room ? (
                  <>
                    {room.contextLabel && (
                      <Alert
                        type="info"
                        showIcon
                        message={room.sectionTitle || "Phòng"}
                        description={room.contextLabel}
                        style={{ marginBottom: 16, borderRadius: 10 }}
                      />
                    )}
                    <Descriptions {...tabDescProps}>
                      <Descriptions.Item label="Mã phòng">{room.roomNumber}</Descriptions.Item>
                      <Descriptions.Item label="Khu / ký túc xá">{formatRoomArea(room.area)}</Descriptions.Item>
                      <Descriptions.Item label="Tầng">{room.floor ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label="Loại phòng">{room.roomType ?? "—"}</Descriptions.Item>
                    </Descriptions>
                  </>
                ) : (
                  <Flex vertical align="center" justify="center" gap="middle" style={{ padding: "24px 12px", textAlign: "center" }}>
                    <HomeOutlined style={{ fontSize: 36, color: brand.primary, opacity: 0.45 }} />
                    <Text type="secondary" style={{ maxWidth: 320, lineHeight: 1.6 }}>
                      Chưa có phòng trên hệ thống. Sau khi đăng ký được duyệt và hoàn tất hợp đồng, thông tin phòng sẽ hiển thị tại đây.
                    </Text>
                  </Flex>
                )}
              </ProfileTabPanel>
            ),
          },
        ]}
      />
    </Card>
  );

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 8px 48px" }}>
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        <div
          style={{
            borderRadius: 16,
            padding: "28px 28px 24px",
            background: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 55%, #14b8a6 100%)`,
            color: "#fff",
            boxShadow: "0 12px 40px rgba(13, 148, 136, 0.25)",
          }}
        >
          <Title level={2} style={{ margin: 0, color: "#fff", fontWeight: 800, letterSpacing: -0.5 }}>
            Hồ sơ cá nhân
          </Title>
          <Paragraph style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.92)", fontSize: 15, maxWidth: 560 }}>
            {isStudent
              ? "Quản lý thông tin sinh viên, liên hệ và phòng ở — dữ liệu chính xác giúp quy trình đăng ký nội trú diễn ra nhanh hơn."
              : "Cập nhật thông tin tài khoản và liên hệ của bạn."}
          </Paragraph>
        </div>

        {isStudent && complete && !editingProfile && (
          <Alert
            type="success"
            showIcon
            message="Hồ sơ đã đầy đủ"
            description="Bạn có thể chỉnh sửa bất cứ lúc nào bằng nút «Chỉnh sửa hồ sơ» ở khối bên phải."
            style={{ borderRadius: 12, border: `1px solid ${brand.border}` }}
          />
        )}

        {isStudent && !complete && (
          <Alert
            type="warning"
            showIcon
            message="Vui lòng bổ sung thông tin"
            description="Điền đủ các trường có dấu * rồi bấm «Lưu hồ sơ» để hoàn tất."
            style={{ borderRadius: 12 }}
          />
        )}

        {isStudent ? (
          <>
            {!complete || editingProfile ? (
              <Row gutter={[24, 24]} align="stretch">
                <Col xs={24} md={8}>
                  {profileSidebar}
                </Col>
                <Col xs={24} md={16}>
                  {studentFormCard}
                </Col>
              </Row>
            ) : (
              <Row gutter={[24, 24]} align="stretch">
                <Col xs={24} md={8}>
                  {profileSidebar}
                </Col>
                <Col xs={24} md={16}>
                  {studentTabs}
                </Col>
              </Row>
            )}
          </>
        ) : (
          <Row gutter={[24, 24]} align="stretch">
            <Col xs={24} md={8}>
              {profileSidebar}
            </Col>
            <Col xs={24} md={16}>
              <Card
                variant="borderless"
                title={<Text strong style={{ fontSize: 17, color: brand.primaryDark }}>Thông tin tài khoản</Text>}
                style={{ borderRadius: 16, border: `1px solid ${brand.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}
              >
                <Form
                  layout="vertical"
                  initialValues={{
                    fullName: profile.fullName,
                    phone: profile.phone,
                    address: profile.address,
                  }}
                  onFinish={onFinishStaff}
                >
                  <Row gutter={[20, 0]}>
                    <Col xs={24} lg={12}>
                      <Form.Item label="Họ tên" name="fullName" rules={[{ required: true }]}>
                        <Input size="large" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Form.Item label="Email đăng nhập">
                        <Input size="large" value={profile.email} disabled />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="Số điện thoại" name="phone">
                        <Input size="large" placeholder="Liên hệ khi cần" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="Địa chỉ" name="address">
                        <Input.TextArea rows={3} placeholder="Địa chỉ liên hệ" showCount maxLength={500} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={saving} size="large">
                      Lưu thay đổi
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>
          </Row>
        )}
      </Space>
    </div>
  );
};

export default ProfilePage;
