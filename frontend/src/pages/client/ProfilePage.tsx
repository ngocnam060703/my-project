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
  Select,
} from "antd";
import dayjs from "dayjs";
import { EditOutlined, HomeOutlined, UserOutlined, IdcardOutlined, BookOutlined, PhoneOutlined } from "@ant-design/icons";
import { authApi, majorsApi, studentsApi } from "../../api";
import type { StudentPriorityType, StudentProfileResponse } from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { setUserString } from "../../utils/authStorage";

const { Title, Text, Paragraph } = Typography;

const brand = { primary: "#0d9488", primaryDark: "#0f766e", softBg: "rgba(13, 148, 136, 0.06)", border: "rgba(13, 148, 136, 0.15)" };

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

function StudentFormBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      size="small"
      variant="borderless"
      style={{
        borderRadius: 12,
        border: `1px solid ${brand.border}`,
        background: "#fff",
      }}
      styles={{ body: { padding: 16 } }}
      title={
        <Flex vertical gap={2}>
          <Text strong style={{ color: brand.primaryDark, fontSize: 15 }}>
            {title}
          </Text>
          {hint && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Text>
          )}
        </Flex>
      }
    >
      {children}
    </Card>
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
  facultyGroup?: string;
  dateOfBirth?: string | null;
  gender?: string;
  phone?: string;
  address?: string;
  citizenId?: string;
  profileComplete?: boolean;
  /** Khóa (VD: K26) */
  faculty?: string;
  enrollmentDate?: string | null;
  homeroomTeacher?: string;
  addressNative?: string;
  addressPermanent?: string;
  addressTemporary?: string;
  ethnicity?: string;
  priorityType?: StudentPriorityType;
  priorityProofUrl?: string | null;
  checkInDate?: string | null;
  familyFatherName?: string;
  familyFatherPhone?: string;
  familyMotherName?: string;
  familyMotherPhone?: string;
  familyEmergencyPhone?: string;
  avatar?: string;
}

function isStudentRole(role?: string | null): boolean {
  return role === "user" || role === "student";
}

const PRIORITY_OPTIONS: { label: string; value: StudentPriorityType }[] = [
  { label: "Bình thường", value: "normal" },
  { label: "Con liệt sĩ", value: "martyr_child" },
  { label: "Con thương binh", value: "invalid_child" },
  { label: "Dân tộc thiểu số", value: "minority" },
  { label: "Tàn tật", value: "disabled" },
];

type MajorOption = { _id: string; code?: string; name: string; faculty?: string; isActive?: boolean };

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
  const [majorOptions, setMajorOptions] = useState<MajorOption[]>([]);
  const [priorityProofFile, setPriorityProofFile] = useState<File | null>(null);
  const [priorityProofPreviewUrl, setPriorityProofPreviewUrl] = useState<string | null>(null);

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

      if (isStudentRole(p.role)) {
        try {
          const detail = (await studentsApi.getMe()).data as StudentProfileResponse;
          activeProfile = detail.student as ProfilePayload;
          activeProfile = {
            ...activeProfile,
            email: activeProfile.email || p.email,
            profileComplete: p.profileComplete,
            checkInDate:
              detail.student?.checkInDate ||
              detail.currentContract?.startDate ||
              activeProfile.checkInDate ||
              null,
          };
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
        facultyGroup: activeProfile.facultyGroup,
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
        ethnicity: activeProfile.ethnicity,
        priorityType: activeProfile.priorityType || "normal",
        priorityProofUrl: activeProfile.priorityProofUrl || null,
        familyFatherName: activeProfile.familyFatherName,
        familyFatherPhone: activeProfile.familyFatherPhone,
        familyMotherName: activeProfile.familyMotherName,
        familyMotherPhone: activeProfile.familyMotherPhone,
        familyEmergencyPhone: activeProfile.familyEmergencyPhone,
      });
      setPriorityProofFile(null);
      setPriorityProofPreviewUrl(activeProfile.priorityProofUrl || null);
    } catch {
      message.error("Không tải được hồ sơ");
    } finally {
      setLoading(false);
    }
  }, [form, syncAuthUser]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await majorsApi.getAll({ active: true });
        setMajorOptions(((res.data?.items || []) as MajorOption[]).filter((m) => m && m.isActive !== false));
      } catch {
        setMajorOptions([]);
      }
    })();
  }, []);

  const onFinishStudent = async (v: Record<string, unknown>) => {
    setSaving(true);
    try {
      const priorityType = (v.priorityType as StudentPriorityType | undefined) || "normal";
      const existingProofUrl = (v.priorityProofUrl as string | null | undefined) || null;
      const needsProof = priorityType !== "normal";
      if (needsProof && !priorityProofFile && !existingProofUrl) {
        message.error("Vui lòng tải minh chứng cho diện ưu tiên đã chọn.");
        setSaving(false);
        return;
      }

      const normalizeFormDate = (value: unknown): string | null | undefined => {
        if (value === null) return null;
        if (value === undefined || value === "") return undefined;
        const d = dayjs(value as dayjs.ConfigType);
        return d.isValid() ? d.format("YYYY-MM-DD") : undefined;
      };
      const proofUrlFromFile = priorityProofFile ? URL.createObjectURL(priorityProofFile) : undefined;
      const addressContact =
        String(v.address || "").trim() ||
        String(v.addressPermanent || "").trim() ||
        String(v.addressNative || "").trim() ||
        String(v.addressTemporary || "").trim();
      const avatarRaw = typeof v.avatar === "string" ? v.avatar.trim() : "";
      const res = await studentsApi.updateMe({
        fullName: v.fullName as string,
        phone: v.phone as string,
        studentId: v.studentId as string,
        className: v.className as string,
        major: v.major as string,
        facultyGroup: v.facultyGroup as string | undefined,
        gender: v.gender as string,
        citizenId: v.citizenId as string,
        dateOfBirth: normalizeFormDate(v.dateOfBirth),
        address: addressContact,
        faculty: v.faculty as string,
        enrollmentDate: normalizeFormDate(v.enrollmentDate),
        homeroomTeacher: v.homeroomTeacher as string,
        ...(avatarRaw && !avatarRaw.startsWith("blob:") ? { avatar: avatarRaw } : {}),
        addressNative: v.addressNative as string | undefined,
        addressPermanent: v.addressPermanent as string | undefined,
        addressTemporary: v.addressTemporary as string | undefined,
        ethnicity: v.ethnicity as string | undefined,
        priorityType,
        priorityProofUrl: priorityType === "normal" ? null : proofUrlFromFile || existingProofUrl || null,
        familyFatherName: v.familyFatherName as string | undefined,
        familyFatherPhone: v.familyFatherPhone as string | undefined,
        familyMotherName: v.familyMotherName as string | undefined,
        familyMotherPhone: v.familyMotherPhone as string | undefined,
        familyEmergencyPhone: v.familyEmergencyPhone as string | undefined,
      });
      const detail = res.data as StudentProfileResponse;
      const updated = detail.student as ProfilePayload;
      let profileComplete = false;
      try {
        const pres = await authApi.getProfile();
        profileComplete = !!(pres.data as ProfilePayload).profileComplete;
      } catch {
        profileComplete = !!updated.profileComplete;
      }
      setProfile({ ...updated, profileComplete });
      setRoom((detail.currentRoom ?? null) as DashboardRoom | null);
      setDashMeta({
        studentStatus: detail.residenceStatus,
        memberStatusLabel: detail.residenceStatus === "dang_o" ? "Đang ở" : "Đã rời",
      });
      syncAuthUser(updated);
      window.dispatchEvent(
        new CustomEvent("student-profile-updated", {
          detail: {
            ...updated,
            priorityProofUrl: priorityType === "normal" ? null : proofUrlFromFile || existingProofUrl || updated.priorityProofUrl || null,
          },
        }),
      );
      setEditingProfile(false);
      message.success("Đã cập nhật hồ sơ");
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string; errors?: Array<{ msg?: string }> } } })?.response
        ?.data;
      const msg =
        data?.message ||
        data?.errors?.[0]?.msg ||
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

  const isStudent = isStudentRole(profile.role);
  const complete = !!profile.profileComplete;

  const openStudentEdit = () => {
    if (!profile) return;
    form.setFieldsValue({
      fullName: profile.fullName,
      studentId: profile.studentId,
      className: profile.className,
      major: profile.major,
      facultyGroup: profile.facultyGroup,
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
      ethnicity: profile.ethnicity,
      priorityType: profile.priorityType || "normal",
      priorityProofUrl: profile.priorityProofUrl || null,
      familyFatherName: profile.familyFatherName,
      familyFatherPhone: profile.familyFatherPhone,
      familyMotherName: profile.familyMotherName,
      familyMotherPhone: profile.familyMotherPhone,
      familyEmergencyPhone: profile.familyEmergencyPhone,
    });
    setPriorityProofFile(null);
    setPriorityProofPreviewUrl(profile.priorityProofUrl || null);
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
        <StudentFormBlock title="Khối 1 — Thông tin cơ bản" hint="Thông tin định danh cá nhân và học vụ căn bản.">
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
              <Form.Item label="Lớp" name="className" rules={[{ required: true, message: "Nhập lớp" }]}>
                <Input size="large" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Ngành" name="major">
                {majorOptions.length ? (
                  <Select
                    size="large"
                    allowClear
                    showSearch
                    placeholder="Chọn ngành (từ danh mục)"
                    optionFilterProp="label"
                    onChange={(v) => {
                      const vv = String(v || "").trim();
                      const picked = majorOptions.find((m) => String(m.faculty || "").trim() === vv);
                      if (picked) {
                        form.setFieldsValue({
                          // Major.name = Khoa/nhóm ngành, Major.faculty = Ngành
                          major: String(picked.faculty || "").trim(),
                          facultyGroup: String(picked.name || "").trim(),
                        });
                      }
                    }}
                    options={majorOptions.map((m) => ({
                      value: String(m.faculty || "").trim(),
                      label: m.code
                        ? `${m.code} — ${String(m.faculty || "").trim()}`
                        : String(m.faculty || "").trim(),
                    }))}
                  />
                ) : (
                  <Input size="large" allowClear placeholder="Nhập ngành" />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Giới tính" name="gender" rules={[{ required: true, message: "Nhập giới tính" }]}>
                <Input size="large" allowClear placeholder="Nam / Nữ" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: "Nhập số điện thoại" }]}>
                <Input size="large" allowClear placeholder="VD: 0912345678" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="citizenId"
                label="CCCD/CMND"
                rules={[
                  {
                    validator: (_, value) => {
                      const s = String(value ?? "").trim();
                      if (!s) return Promise.resolve();
                      return /^\d{9,12}$/.test(s)
                        ? Promise.resolve()
                        : Promise.reject(new Error("CCCD phải gồm 9-12 chữ số"));
                    },
                  },
                ]}
              >
                <Input size="large" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="ethnicity" label="Dân tộc">
                <Input size="large" allowClear placeholder="VD: Kinh, Tày, Nùng..." />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="dateOfBirth" label="Ngày sinh" rules={[{ required: true, message: "Chọn ngày sinh" }]}>
                <DatePicker size="large" style={{ width: "100%" }} format="DD/MM/YYYY" placeholder="Chọn ngày sinh" />
              </Form.Item>
            </Col>
          </Row>
        </StudentFormBlock>

        <StudentFormBlock title="Khối 2 — Thông tin học tập & địa chỉ" hint="Phục vụ đối soát hồ sơ và liên hệ khi cần.">
          <Row gutter={[20, 0]}>
            <Col xs={24} lg={12}>
              <Form.Item label="Khoa/nhóm ngành" name="facultyGroup">
                <Input
                  size="large"
                  allowClear
                  disabled={majorOptions.length > 0}
                  placeholder={majorOptions.length ? "Tự điền theo ngành" : ""}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Khóa" name="faculty">
                <Input size="large" allowClear placeholder="VD: K26" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="enrollmentDate" label="Ngày nhập học">
                <DatePicker size="large" style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="homeroomTeacher" label="GVCN">
                <Input size="large" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="addressNative" label="Quê quán">
                <Input.TextArea rows={2} showCount maxLength={500} placeholder="VD: Xã ..., huyện ..., tỉnh ..." />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="addressPermanent"
                label="Thường trú"
                rules={[{ required: true, message: "Nhập địa chỉ thường trú" }]}
              >
                <Input.TextArea rows={2} showCount maxLength={500} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="addressTemporary" label="Tạm trú">
                <Input.TextArea rows={2} showCount maxLength={500} />
              </Form.Item>
            </Col>
            <Form.Item name="address" hidden>
              <Input />
            </Form.Item>
          </Row>
        </StudentFormBlock>

        <StudentFormBlock
          title="Khối 3 — Diện chính sách/ưu tiên"
          hint="Nếu chọn diện ưu tiên khác Bình thường, bạn phải tải giấy tờ minh chứng."
        >
          <Row gutter={[20, 0]}>
            <Col xs={24} lg={12}>
              <Form.Item name="priorityType" label="Diện ưu tiên" initialValue="normal">
                <Select size="large" options={PRIORITY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.priorityType !== curr.priorityType}>
                {({ getFieldValue, setFieldValue }) => {
                  const selectedPriority = (getFieldValue("priorityType") as StudentPriorityType | undefined) || "normal";
                  if (selectedPriority === "normal") {
                    return (
                      <Alert
                        type="success"
                        showIcon
                        message="Không yêu cầu minh chứng"
                        description="Bạn đang chọn diện Bình thường."
                        style={{ borderRadius: 10, marginTop: 4 }}
                      />
                    );
                  }
                  return (
                    <>
                      <Form.Item name="priorityProofUrl" hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        label="Giấy tờ minh chứng"
                        required
                        help={priorityProofPreviewUrl ? "Đã có minh chứng. Bạn có thể chọn file khác để thay thế." : undefined}
                      >
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setPriorityProofFile(file);
                            if (file) {
                              const nextUrl = URL.createObjectURL(file);
                              setPriorityProofPreviewUrl(nextUrl);
                              setFieldValue("priorityProofUrl", nextUrl);
                            } else {
                              setPriorityProofPreviewUrl(null);
                              setFieldValue("priorityProofUrl", null);
                            }
                          }}
                        />
                        {priorityProofPreviewUrl && (
                          <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Đường dẫn minh chứng:</Text>{" "}
                            <a href={priorityProofPreviewUrl} target="_blank" rel="noreferrer">
                              Xem file hiện tại
                            </a>
                          </div>
                        )}
                      </Form.Item>
                    </>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>
        </StudentFormBlock>

          <StudentFormBlock
            title="Khối 4 — Liên hệ khẩn cấp"
            hint="Thông tin người thân để liên hệ khi có sự cố."
          >
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
            <Form.Item name="familyEmergencyPhone" label="SĐT gia đình khi khẩn cấp" style={{ marginBottom: 0 }}>
              <Input size="large" allowClear />
            </Form.Item>
          </StudentFormBlock>

          <StudentFormBlock
            title="Khối 5 — Thông tin KTX (chỉ xem)"
            hint="Dữ liệu phòng hiện tại được đồng bộ từ hệ thống, sinh viên không chỉnh sửa tại đây."
          >
            {room ? (
              <Descriptions
                size="small"
                column={1}
                styles={{
                  label: { color: "#6b7280", fontWeight: 600 },
                  content: { color: "var(--text-primary, #111827)" },
                }}
              >
                <Descriptions.Item label="Khu / ký túc xá">{formatRoomArea(room.area)}</Descriptions.Item>
                <Descriptions.Item label="Phòng">{room.roomNumber || "—"}</Descriptions.Item>
                <Descriptions.Item label="Tầng">{room.floor ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Loại phòng">{room.roomType ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Trạng thái cư trú">{dashMeta.memberStatusLabel || "—"}</Descriptions.Item>
                <Descriptions.Item label="Ngày vào ở">{formatDateVi(profile.checkInDate)}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Alert
                type="info"
                showIcon
                message="Chưa có dữ liệu phòng ở"
                description="Sau khi được duyệt nội trú và xếp phòng, thông tin KTX sẽ hiển thị tại đây."
                style={{ borderRadius: 10 }}
              />
            )}
          </StudentFormBlock>
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
                  <Descriptions.Item label="Khoa/nhóm ngành">{profile.facultyGroup || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Ngành">{profile.major || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Khóa">{profile.faculty || "—"}</Descriptions.Item>
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
                  <Descriptions.Item label="Khoa/nhóm ngành">{profile.facultyGroup || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Khóa">{profile.faculty || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Ngày nhập học">{formatDateVi(profile.enrollmentDate)}</Descriptions.Item>
                  <Descriptions.Item label="GVCN">{profile.homeroomTeacher || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Quê quán">{profile.addressNative || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Thường trú">{profile.addressPermanent || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Tạm trú">{profile.addressTemporary || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Dân tộc">{profile.ethnicity || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Diện ưu tiên">
                    {PRIORITY_OPTIONS.find((item) => item.value === (profile.priorityType || "normal"))?.label || "Bình thường"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Minh chứng ưu tiên">
                    {profile.priorityProofUrl ? (
                      <a href={profile.priorityProofUrl} target="_blank" rel="noreferrer">Xem minh chứng</a>
                    ) : (
                      "—"
                    )}
                  </Descriptions.Item>
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
            label: tabLabel(<HomeOutlined />, "Phòng ở hiện tại"),
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
                      <Descriptions.Item label="Ngày vào ở">{formatDateVi(profile.checkInDate)}</Descriptions.Item>
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
      <Space orientation="vertical" size={24} style={{ width: "100%" }}>
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
