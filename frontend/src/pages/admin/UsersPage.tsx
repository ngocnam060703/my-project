import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Tabs,
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
  WarningOutlined,
  HomeOutlined,
  FileTextOutlined,
  LoginOutlined,
  LogoutOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { majorsApi, usersApi, contractsApi, roomsApi, bedsApi } from "../../api";
import type {
  User,
  AdminUserDetailResponse,
  Contract,
  Area,
  Bed,
  Bill,
  Violation,
  Room,
  StayHistoryRow,
} from "../../types";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import dayjs from "dayjs";

/** Ưu tiên pricePerPerson; không có thì chia đều phòng/capacity */
function slotPriceVnd(room: Room | null | undefined): number {
  if (!room) return 0;
  if (typeof room.pricePerPerson === "number" && room.pricePerPerson > 0) return Math.round(room.pricePerPerson);
  const cap = Number(room.capacity || 0);
  const price = Number(room.price || 0);
  return cap > 0 ? Math.round(price / cap) : 0;
}

/** Chuẩn hoá equipmentStatus → nhãn tiếng Việt (tình trạng giường / slot) */
function formatBedEquipmentVi(raw: string | undefined | null): string {
  const k = String(raw || "").trim().toLowerCase();
  if (!k) return "—";
  const map: Record<string, string> = {
    good: "Hoạt động tốt",
    ok: "Hoạt động tốt",
    excellent: "Hoạt động tốt",
    maintenance: "Đang bảo trì",
    maintaining: "Đang bảo trì",
    repair: "Đang bảo trì",
    broken: "Hỏng",
    damaged: "Hỏng",
    bad: "Hỏng",
    poor: "Hỏng",
  };
  return map[k] || String(raw ?? "").trim();
}

function contractIdsWithOverdueBills(bills: Bill[] | undefined): Set<string> {
  const s = new Set<string>();
  for (const b of bills || []) {
    if (String(b.status) !== "overdue") continue;
    const c = b.contract;
    const id =
      c && typeof c === "object" && "_id" in c ? String((c as Contract)._id) : c ? String(c) : "";
    if (id) s.add(id);
  }
  return s;
}

/** Trạng thái HĐ tổng quát: đang hiệu lực / hết hạn / quá hạn thanh toán */
function contractEnterpriseBadge(
  c: Pick<Contract, "status" | "endDate" | "_id">,
  overdueContractIds: Set<string>
): { color: string; text: string } {
  const now = dayjs();
  const end = c.endDate ? dayjs(c.endDate) : null;
  const st = String(c.status || "");
  const cid = c._id ? String(c._id) : "";
  const expiredByDate = !!(end && end.isBefore(now, "day"));
  const expiredLike = st === "expired" || st === "terminated" || expiredByDate;

  if (
    cid &&
    overdueContractIds.has(cid) &&
    !expiredLike &&
    (st === "active" || st === "pending_payment")
  ) {
    return { color: "red", text: "Quá hạn thanh toán" };
  }
  if (st === "terminated") return { color: "default", text: "Đã chấm dứt" };
  if (st === "expired" || expiredLike) return { color: "default", text: "Hết hạn" };
  if (st === "pending_payment") return { color: "green", text: "Đang hiệu lực (chờ TT)" };
  if (st === "active") return { color: "green", text: "Đang hiệu lực" };
  return { color: "blue", text: st || "—" };
}

type OccupancyBadgeUi = { bg: string; border: string; text: string };

/** Hiển thị trạng thái cư trú theo dòng lịch sử (đồng bộ BA: chờ check-in / đang ở / đã check-out) */
function residencyStayStatusDisplay(status?: string | null): { color: string; text: string; emoji?: string } {
  switch (String(status || "")) {
    case "pending_checkin":
      return { color: "gold", text: "Chờ check-in", emoji: "🟡" };
    case "staying":
      return { color: "success", text: "Đang ở", emoji: "🟢" };
    case "checked_out":
      return { color: "default", text: "Đã check-out", emoji: "⚪" };
    case "pending_bed":
      return { color: "processing", text: "Chờ phân giường" };
    case "not_started":
      return { color: "blue", text: "Chưa bắt đầu kỳ" };
    default:
      return { color: "default", text: status || "—" };
  }
}

function occupancyOperationalBadgeLarge(
  status: string | null | undefined,
  stayHistoryLen: number
): OccupancyBadgeUi | null {
  if (!status) return null;
  if (status === "checked_in_staying") {
    return { bg: "#ecfdf5", border: "#10b981", text: "Đang ở" };
  }
  if (status === "assigned_pending_checkin") {
    return { bg: "#fffbeb", border: "#f59e0b", text: "Chờ check-in" };
  }
  if (status === "no_active_contract" && stayHistoryLen > 0) {
    return { bg: "#f3f4f6", border: "#9ca3af", text: "Đã check-out / không HĐ hiện hành" };
  }
  if (status === "no_active_contract") {
    return { bg: "#f9fafb", border: "#d1d5db", text: "Không có HĐ hiện hành" };
  }
  if (status === "contract_no_bed") {
    return { bg: "#eff6ff", border: "#3b82f6", text: "Đã phân phòng — chờ giường" };
  }
  if (status === "no_bed_assigned") {
    return { bg: "#fffbeb", border: "#f59e0b", text: "Chưa phân giường" };
  }
  return { bg: "#f0f9ff", border: "#0ea5e9", text: status };
}

const roleDisplay: Record<string, { color: string; text: string }> = {
  user: { color: "success", text: "Sinh viên" },
  student: { color: "success", text: "Sinh viên" },
  manager: { color: "warning", text: "Quản lý" },
  admin: { color: "error", text: "Admin" },
};

const genderPolicyLabels: Record<string, string> = {
  male: "Khu nam",
  female: "Khu nữ",
  mixed: "Hỗn hợp",
};

function formatParentLine(name?: string, phone?: string) {
  const n = String(name || "").trim();
  const p = String(phone || "").trim();
  if (!n && !p) return "—";
  if (!n) return `SĐT: ${p}`;
  if (!p) return n;
  return `${n} — SĐT: ${p}`;
}

function formatStayHistoryDateVi(v?: string | Date | null): string {
  if (!v) return "—";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD/MM/YYYY") : "—";
}

function inferFacultyGroupFromMajor(
  major: string | undefined,
  majorOptions: Array<{ name: string; faculty?: string }>
): string {
  const m = String(major || "").trim();
  if (!m) return "";
  // Quy ước danh mục: Major.name = Khoa/nhóm ngành, Major.faculty = Ngành
  const hit = majorOptions.find((x) => String(x.faculty || "").trim() === m);
  return hit ? String(hit.name || "").trim() : "";
}

const UsersPage: React.FC<{ studentOnly?: boolean }> = ({ studentOnly }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [ensureBedLoading, setEnsureBedLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [majorOptions, setMajorOptions] = useState<
    Array<{ _id: string; code?: string; name: string; faculty?: string; isActive?: boolean }>
  >([]);
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [resetForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState<"users" | "pending">("users");
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ userId: string; fullName: string } | null>(null);
  const [rejectForm] = Form.useForm();
  const pendingEndpointWarnedRef = useRef(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | undefined>(studentOnly ? "student" : undefined);
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
        includeDorm: studentOnly ? 1 : undefined,
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

  const loadPendingAccounts = useCallback(async () => {
    if (studentOnly || !isAdmin) return;
    setPendingLoading(true);
    try {
      const res = await usersApi.getPendingAccounts();
      setPendingUsers(res.data?.users || []);
      pendingEndpointWarnedRef.current = false;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setPendingUsers([]);
        if (!pendingEndpointWarnedRef.current) {
          pendingEndpointWarnedRef.current = true;
          message.warning("Backend chưa nạp API duyệt tài khoản. Hãy restart backend.");
        }
      } else {
        message.error("Không tải được tài khoản chờ duyệt");
      }
    } finally {
      setPendingLoading(false);
    }
  }, [studentOnly, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (studentOnly) setRoleFilter("student");
  }, [studentOnly]);

  useEffect(() => {
    void load();
  }, [load, studentOnly]);

  useEffect(() => {
    if (!studentOnly && isAdmin) {
      void loadPendingAccounts();
    }
  }, [studentOnly, isAdmin, loadPendingAccounts]);

  useEffect(() => {
    (async () => {
      try {
        const res = await majorsApi.getAll({ active: true });
        setMajorOptions(
          ((res.data?.items || []) as Array<{ _id: string; code?: string; name: string; faculty?: string; isActive?: boolean }>).filter(
            (m) => m && m.isActive !== false
          )
        );
      } catch {
        setMajorOptions([]);
      }
    })();
  }, []);

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

  const openUserFromQuery = searchParams.get("openUser");

  useEffect(() => {
    if (!openUserFromQuery?.trim()) return;
    const uid = openUserFromQuery.trim();
    let cancelled = false;
    void (async () => {
      try {
        const res = await usersApi.getById(uid);
        if (cancelled || !res.data?.user) return;
        setDetailPayload(res.data as AdminUserDetailResponse);
      } catch {
        message.error("Không mở được hồ sơ từ liên kết phòng");
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("openUser");
              return next;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openUserFromQuery, setSearchParams]);

  const openDetail = async (u: User) => {
    setDetailPayload({
      user: u,
      currentRoom: null,
      currentContract: null,
      contracts: [],
      managedAreas: [],
      stayHistory: [],
      financialSummary: null,
      violationsRecent: [],
    });
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

  const handleEnsureBed = async () => {
    const u = detailPayload?.user;
    const cc = detailPayload?.currentContract as Contract | undefined;
    const cid = cc?._id ? String(cc._id) : "";
    if (!u || !cid) return;
    setEnsureBedLoading(true);
    try {
      await contractsApi.ensureBed(cid);
      message.success("Đã đồng bộ giường");
      await openDetail(u);
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Không gán được giường (kiểm tra sức chứa phòng hoặc quyền)"
      );
    } finally {
      setEnsureBedLoading(false);
    }
  };

  const handleQuickCheckIn = async () => {
    const u = detailPayload?.user;
    const room = detailPayload?.currentRoom;
    const cc = detailPayload?.currentContract as Contract | undefined;
    const bed = cc?.bed && typeof cc.bed === "object" ? cc.bed : null;
    const roomId = room && typeof room === "object" ? room._id : "";
    const bedId = bed && "_id" in bed && bed._id ? String(bed._id) : "";
    if (!u || !roomId || !bedId) return;
    try {
      await roomsApi.checkInBed(roomId, bedId);
      message.success("Đã check-in");
      await openDetail(u);
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Không check-in được"
      );
    }
  };

  const handleQuickCheckout = () => {
    const u = detailPayload?.user;
    const cc = detailPayload?.currentContract as Contract | undefined;
    const bed = cc?.bed && typeof cc.bed === "object" ? cc.bed : null;
    const bedId = bed && "_id" in bed && bed._id ? String(bed._id) : "";
    if (!u || !bedId) return;
    Modal.confirm({
      title: "Check-out & giải phóng giường?",
      content: "Giường trở về trống; liên kết giường trên HĐ được gỡ.",
      okText: "Check-out",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await bedsApi.checkout(bedId);
          message.success("Đã check-out");
          await openDetail(u);
        } catch (err: unknown) {
          message.error(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              "Không check-out được"
          );
        }
      },
    });
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
      facultyGroup: (u as unknown as { facultyGroup?: string })?.facultyGroup,
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

  const approvePendingAccount = async (u: User) => {
    try {
      await usersApi.approveAccount(u._id);
      message.success("Đã duyệt tài khoản");
      await loadPendingAccounts();
      await load();
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Duyệt tài khoản thất bại"
      );
    }
  };

  const submitRejectPendingAccount = async (v: { rejectionReason: string }) => {
    if (!rejectModal) return;
    try {
      await usersApi.rejectAccount(rejectModal.userId, v.rejectionReason);
      message.success("Đã từ chối tài khoản");
      setRejectModal(null);
      rejectForm.resetFields();
      await loadPendingAccounts();
      await load();
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Từ chối tài khoản thất bại"
      );
    }
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
      title: "STT",
      key: "stt",
      width: 70,
      fixed: "left" as const,
      render: (_: unknown, __: User, idx: number) => (page - 1) * 10 + idx + 1,
    },
    {
      title: "ID",
      dataIndex: "_id",
      key: "_id",
      width: 96,
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
      width: studentOnly ? 180 : undefined,
      ellipsis: true,
      sorter: true,
      sortOrder:
        sortBy === "fullName" ? (sortOrder === "asc" ? ("ascend" as const) : ("descend" as const)) : undefined,
      render: (v: string) => <strong>{v || "—"}</strong>,
    },
    { title: "Email", dataIndex: "email", key: "email", width: studentOnly ? 200 : undefined, ellipsis: true },
    ...(studentOnly
      ? ([
          { title: "MSSV", dataIndex: "studentId", key: "studentId", width: 110 },
          { title: "SĐT", dataIndex: "phone", key: "phone", width: 120, ellipsis: true, render: (v: string) => v || "—" },
          { title: "Giới tính", dataIndex: "gender", key: "gender", width: 90, render: (v: string) => v || "—" },
          {
            title: "Khoa/nhóm ngành",
            dataIndex: "facultyGroup",
            key: "facultyGroup",
            width: 180,
            ellipsis: true,
            render: (_: unknown, r: User) => {
              const direct = String((r as unknown as { facultyGroup?: string })?.facultyGroup || "").trim();
              if (direct) return direct;
              const inferred = inferFacultyGroupFromMajor(r.major, majorOptions);
              return inferred || "—";
            },
          },
          { title: "Ngành", dataIndex: "major", key: "major", width: 220, ellipsis: true, render: (v: string) => v || "—" },
          { title: "Khóa", dataIndex: "faculty", key: "faculty", width: 110, ellipsis: true, render: (v: string) => v || "—" },
          {
            title: "Khu",
            key: "area",
            width: 140,
            ellipsis: true,
            render: (_: unknown, r: User) => (r as unknown as { currentAreaName?: string })?.currentAreaName || "—",
          },
          {
            title: "Phòng",
            key: "room",
            width: 90,
            render: (_: unknown, r: User) => (r as unknown as { currentRoomNumber?: string })?.currentRoomNumber || "—",
          },
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
          !studentOnly && isAdmin && (canGrantElevated || (r.role !== "admin" && r.role !== "manager"));
        const isStudentList = !!studentOnly;
        return (
          <Space size={0} wrap>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openDetail(r)}>
              Chi tiết
            </Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
              Sửa
            </Button>
            {!isStudentList ? (
              <Button
                type="link"
                size="small"
                icon={r.isActive === false ? <UnlockOutlined /> : <LockOutlined />}
                disabled={self || (r.isSuperAdmin && !canGrantElevated)}
                onClick={() => void toggleLock(r)}
              >
                {r.isActive === false ? "Mở khóa" : "Khóa"}
              </Button>
            ) : null}
            {showResetPwd && (
              <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openResetPassword(r._id)}>
                Đặt lại MK
              </Button>
            )}
            {!isStudentList ? (
              <Button
                type="link"
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={cannotDelete}
                onClick={() => handleDelete(r)}
              >
                Xóa
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const du = detailPayload?.user;
  const detailIsStudent = du?.role === "user" || du?.role === "student";
  const detailIsManager = du?.role === "manager";
  const detailIsAdmin = du?.role === "admin";

  const contractAreaName = (c: Contract) => {
    const r = c.room;
    if (!r || typeof r !== "object") return "—";
    const a = r.area;
    if (a && typeof a === "object" && "name" in a) return String((a as { name?: string }).name || "") || "—";
    return "—";
  };

  const contractBedCode = (c: Contract) => {
    const b = c.bed;
    if (!b) return "—";
    if (typeof b === "object" && b !== null && "code" in b) return String((b as Bed).code || "") || "—";
    return "—";
  };

  const contractBedComposite = (c: Contract) => {
    const rn = String((typeof c.room === "object" && c.room ? c.room.roomNumber : "") || "").trim();
    const bc = contractBedCode(c);
    if (bc === "—") return "—";
    if (rn && bc.startsWith(`${rn}-`)) return bc;
    if (rn) return `${rn}-${bc}`;
    return bc;
  };

  const contractBedEquipment = (c: Contract) => {
    const b = c.bed;
    if (b && typeof b === "object" && "equipmentStatus" in b)
      return formatBedEquipmentVi(String((b as Bed).equipmentStatus || ""));
    return "—";
  };

  const overdueContractIds = contractIdsWithOverdueBills(detailPayload?.financialSummary?.unpaidBills);

  const contractColumns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "cn", render: (v: string) => v || "—" },
    {
      title: "Khu",
      key: "area",
      width: 160,
      ellipsis: true,
      render: (_: unknown, c: Contract) => contractAreaName(c),
    },
    {
      title: "Phòng",
      key: "room",
      width: 90,
      render: (_: unknown, c: Contract) =>
        typeof c.room === "object" && c.room ? `${c.room.roomNumber}` : "—",
    },
    {
      title: "Giá phòng (nền)",
      key: "roomFee",
      width: 150,
      render: (_: unknown, c: Contract) => {
        const r = typeof c.room === "object" ? c.room : null;
        if (!r || r.price == null) return "—";
        const slots = Math.max(1, Number(r.capacity) || 1);
        const full = Math.round(Number(r.price));
        const per = Math.round(full / slots);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            <div>
              Tổng: <strong>{full.toLocaleString("vi-VN")}</strong>đ/th
            </div>
            <div>
              {slots} slot → <strong>{per.toLocaleString("vi-VN")}</strong>đ
            </div>
          </div>
        );
      },
    },
    {
      title: "Mã giường",
      key: "bedSlot",
      width: 110,
      ellipsis: true,
      render: (_: unknown, c: Contract) => contractBedCode(c),
    },
    {
      title: "Tình trạng giường",
      key: "bedEq",
      width: 130,
      ellipsis: true,
      render: (_: unknown, c: Contract) => contractBedEquipment(c),
    },
    {
      title: "Trạng thái",
      key: "st",
      width: 160,
      render: (_: unknown, c: Contract) => {
        const { color, text } = contractEnterpriseBadge(c, overdueContractIds);
        return (
          <Tag color={color} style={{ fontWeight: 600 }}>
            {text}
          </Tag>
        );
      },
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

  const pendingColumns: TableProps<User>["columns"] = [
    {
      title: "STT",
      key: "stt",
      width: 70,
      fixed: "left",
      render: (_: unknown, __: User, idx: number) => idx + 1,
    },
    {
      title: "MSSV",
      dataIndex: "studentId",
      key: "studentId",
      width: 120,
      render: (v: string) => v || "—",
    },
    {
      title: "Họ tên",
      dataIndex: "fullName",
      key: "fullName",
      width: 200,
      render: (v: string) => <strong>{v || "—"}</strong>,
    },
    { title: "Email", dataIndex: "email", key: "email", width: 220 },
    { title: "SĐT", dataIndex: "phone", key: "phone", width: 130, render: (v: string) => v || "—" },
    {
      title: "Ngày đăng ký",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v: string) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 220,
      fixed: "right",
      render: (_: unknown, u: User) => (
        <Space>
          <Button type="primary" size="small" onClick={() => void approvePendingAccount(u)}>
            Duyệt
          </Button>
          <Button
            danger
            size="small"
            onClick={() => {
              setRejectModal({ userId: u._id, fullName: u.fullName || "" });
              rejectForm.setFieldsValue({ rejectionReason: "" });
            }}
          >
            Từ chối
          </Button>
        </Space>
      ),
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
      {!studentOnly && isAdmin ? (
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as "users" | "pending")}
          items={[
            { key: "users", label: "Người dùng" },
            { key: "pending", label: `Tài khoản chờ duyệt (${pendingUsers.length})` },
          ]}
        />
      ) : null}

      {(activeTab === "users" || studentOnly) ? (
        <>
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
              <Select.Option value="student">Sinh viên</Select.Option>
              <Select.Option value="user">Sinh viên (legacy)</Select.Option>
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
              setRoleFilter(studentOnly ? "student" : undefined);
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
                form.setFieldsValue({ role: "student" });
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
          scroll={{ x: studentOnly ? 1700 : 1100 }}
        />
      </Card>
        </>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Table<User>
            columns={pendingColumns}
            dataSource={pendingUsers}
            rowKey="_id"
            loading={pendingLoading}
            pagination={false}
            size="middle"
            scroll={{ x: 1000 }}
            locale={{ emptyText: "Không có tài khoản chờ duyệt" }}
          />
        </Card>
      )}

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
        <Form form={form} onFinish={editingId ? handleUpdate : handleCreate} layout="vertical" initialValues={{ role: "student" }}>
          <Form.Item name="role" label="Vai trò">
            <Select>
              <Select.Option value="student">Sinh viên</Select.Option>
              <Select.Option value="user">Sinh viên (legacy)</Select.Option>
              <Select.Option value="manager" disabled={!canGrantElevated}>Quản lý</Select.Option>
              <Select.Option value="admin" disabled={!canGrantElevated}>Admin</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const isStudentRole = ["user", "student"].includes(String(getFieldValue("role") || ""));
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
                  <Form.Item name="major" label="Ngành" rules={[req]}>
                    {majorOptions.length ? (
                      <Select
                        allowClear
                        showSearch
                        placeholder="Chọn ngành (từ danh mục)"
                        optionFilterProp="label"
                        onChange={(v) => {
                          const vv = String(v || "").trim();
                          // Major.name = Khoa/nhóm ngành, Major.faculty = Ngành
                          const picked = majorOptions.find((m) => String(m.faculty || "").trim() === vv);
                          if (picked) {
                            form.setFieldsValue({
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
                      <Input placeholder="Nhập ngành" />
                    )}
                  </Form.Item>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item
                        name="facultyGroup"
                        label="Khoa/nhóm ngành"
                        rules={[req]}
                      >
                        <Input disabled={majorOptions.length > 0} placeholder={majorOptions.length ? "Tự điền theo ngành" : "Nhập khoa/nhóm ngành"} />
                      </Form.Item>
                    </Col>
                    <Col span={12}><Form.Item name="faculty" label="Khóa" rules={[req]}><Input placeholder="VD: K26" /></Form.Item></Col>
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
        width={980}
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
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
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

              {detailIsStudent ? (
                <>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Hồ sơ <strong>sinh viên</strong> và thông tin lưu trú theo hợp đồng KTX.
                  </div>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Thông tin cá nhân" style={{ borderRadius: 10 }}>
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="MSSV">{du?.studentId || "—"}</Descriptions.Item>
                          <Descriptions.Item label="SĐT">{du?.phone || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Ngày sinh">
                            {du?.dateOfBirth ? dayjs(du.dateOfBirth).format("DD/MM/YYYY") : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Giới tính">{du?.gender || "—"}</Descriptions.Item>
                          <Descriptions.Item label="CCCD / CMND">{du?.citizenId || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Địa chỉ liên hệ">{du?.address || "—"}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Thông tin học tập" style={{ borderRadius: 10 }}>
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="Lớp">{du?.className || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Khoa/nhóm ngành">
                            {(du as unknown as { facultyGroup?: string })?.facultyGroup ||
                              inferFacultyGroupFromMajor(du?.major, majorOptions) ||
                              "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Ngành">{du?.major || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Khóa">{du?.faculty || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Giáo viên chủ nhiệm">{du?.homeroomTeacher || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Ngày nhập học">
                            {du?.enrollmentDate ? dayjs(du.enrollmentDate).format("DD/MM/YYYY") : "—"}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Địa chỉ" style={{ borderRadius: 10 }}>
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="Quê quán">{du?.addressNative || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Thường trú">{du?.addressPermanent || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Tạm trú">{du?.addressTemporary || "—"}</Descriptions.Item>
                          <Descriptions.Item label="Tạm vắng">{du?.addressAbsent || "—"}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card size="small" title="Gia đình" style={{ borderRadius: 10 }}>
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="Phụ huynh (cha)">
                            {formatParentLine(du?.familyFatherName, du?.familyFatherPhone)}
                          </Descriptions.Item>
                          <Descriptions.Item label="Phụ huynh (mẹ)">
                            {formatParentLine(du?.familyMotherName, du?.familyMotherPhone)}
                          </Descriptions.Item>
                          <Descriptions.Item label="SĐT liên hệ khẩn cấp">
                            {du?.familyEmergencyPhone || "—"}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>
                    <Col xs={24}>
                      <Card size="small" title="Lưu trú hiện tại" style={{ borderRadius: 10 }}>
                        <Descriptions column={2} size="small">
                          <Descriptions.Item label="Phòng đang ở">
                            {detailPayload.currentRoom && typeof detailPayload.currentRoom === "object" ? (
                              <Space orientation="vertical" size={2}>
                                <span>
                                  Phòng <strong>{detailPayload.currentRoom.roomNumber}</strong>
                                  {typeof detailPayload.currentRoom.area === "object" && detailPayload.currentRoom.area ? (
                                    <span> — Khu <strong>{detailPayload.currentRoom.area.name}</strong></span>
                                  ) : null}
                                </span>
                                <span style={{ color: "#6b7280", fontSize: 12 }}>
                                  Sức chứa: <strong>{detailPayload.currentRoom.capacity ?? "—"}</strong>
                                  {" · "}Đang ở: <strong>{detailPayload.currentRoom.currentOccupancy ?? "—"}</strong>
                                </span>
                              </Space>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="Giường được phân">
                            {detailPayload.currentContract
                              ? contractBedCode(detailPayload.currentContract as Contract)
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Mã slot (phòng–giường)">
                            {detailPayload.currentContract
                              ? contractBedComposite(detailPayload.currentContract as Contract)
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Trạng thái giường">
                            {detailPayload.currentContract
                              ? contractBedEquipment(detailPayload.currentContract as Contract)
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Tổng tiền phòng (tháng)">
                            {detailPayload.currentRoom && typeof detailPayload.currentRoom === "object"
                              ? `${Math.round(Number(detailPayload.currentRoom.price || 0)).toLocaleString("vi-VN")}đ`
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Giá slot / tháng">
                            {detailPayload.currentRoom && typeof detailPayload.currentRoom === "object"
                              ? `${slotPriceVnd(detailPayload.currentRoom).toLocaleString("vi-VN")}đ`
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="Ngày check-in thực tế">
                            {(() => {
                              const b = (detailPayload.currentContract as Contract | null)?.bed;
                              const cin = b && typeof b === "object" ? (b as Bed).checkInAt : null;
                              return cin ? dayjs(cin).format("DD/MM/YYYY HH:mm") : "—";
                            })()}
                          </Descriptions.Item>
                          <Descriptions.Item label="Trạng thái cư trú">
                            {(() => {
                              const meta = occupancyOperationalBadgeLarge(
                                detailPayload.residencyOperationalStatus,
                                detailPayload.stayHistory?.length || 0
                              );
                              if (!meta) return detailPayload.residencyOperationalStatus || "—";
                              return (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    background: meta.bg,
                                    border: `1px solid ${meta.border}`,
                                  }}
                                >
                                  {meta.text}
                                </span>
                              );
                            })()}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>
                  </Row>

                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Thao tác nhanh</div>
                    <Space wrap>
                      <Button
                        icon={<HomeOutlined />}
                        disabled={!detailPayload.currentRoom || typeof detailPayload.currentRoom !== "object"}
                        onClick={() => {
                          const room = detailPayload.currentRoom as Room | null;
                          if (!room?._id) return;
                          navigate(`/admin/housing?tab=rooms&openRoom=${encodeURIComponent(room._id)}`);
                          setDetailPayload(null);
                        }}
                      >
                        Xem phòng
                      </Button>
                      <Button
                        icon={<FileTextOutlined />}
                        disabled={!(detailPayload.currentContract as Contract | null)?._id}
                        onClick={() => {
                          const id = String((detailPayload.currentContract as Contract)._id || "");
                          if (!id) return;
                          navigate(`/admin/contracts?openContract=${encodeURIComponent(id)}`);
                          setDetailPayload(null);
                        }}
                      >
                        Xem hợp đồng
                      </Button>
                      <Button
                        type="primary"
                        icon={<LoginOutlined />}
                        disabled={
                          detailPayload.residencyOperationalStatus !== "assigned_pending_checkin" ||
                          !detailPayload.currentRoom ||
                          typeof detailPayload.currentRoom !== "object" ||
                          !(detailPayload.currentContract as Contract)?.bed ||
                          typeof (detailPayload.currentContract as Contract).bed !== "object"
                        }
                        onClick={() => void handleQuickCheckIn()}
                      >
                        Check-in
                      </Button>
                      <Button
                        danger
                        icon={<LogoutOutlined />}
                        disabled={
                          detailPayload.residencyOperationalStatus !== "checked_in_staying" ||
                          !(detailPayload.currentContract as Contract)?.bed ||
                          typeof (detailPayload.currentContract as Contract).bed !== "object"
                        }
                        onClick={handleQuickCheckout}
                      >
                        Check-out
                      </Button>
                      <Button
                        icon={<SwapOutlined />}
                        disabled={
                          !(detailPayload.currentRoom && typeof detailPayload.currentRoom === "object") ||
                          !(detailPayload.currentContract as Contract)?._id ||
                          !(detailPayload.currentContract as Contract)?.bed ||
                          typeof (detailPayload.currentContract as Contract).bed !== "object" ||
                          !["assigned_pending_checkin", "checked_in_staying"].includes(
                            String(detailPayload.residencyOperationalStatus || "")
                          )
                        }
                        onClick={() => {
                          const room = detailPayload.currentRoom as Room;
                          const cid = String((detailPayload.currentContract as Contract)._id || "");
                          navigate(
                            `/admin/housing?tab=rooms&openRoom=${encodeURIComponent(room._id)}&openTransfer=${encodeURIComponent(cid)}`
                          );
                          setDetailPayload(null);
                        }}
                      >
                        Chuyển giường
                      </Button>
                    </Space>
                  </div>

                  <Space wrap>
                    {detailPayload.currentContract &&
                    ["active", "pending_payment"].includes(
                      String((detailPayload.currentContract as Contract).status)
                    ) ? (
                      <Button type="primary" loading={ensureBedLoading} onClick={() => void handleEnsureBed()}>
                        Gán giường / đồng bộ giường
                      </Button>
                    ) : null}
                  </Space>

                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Hợp đồng KTX</div>
                    <Table<Contract>
                      size="small"
                      rowKey="_id"
                      columns={contractColumns}
                      dataSource={detailPayload.contracts || []}
                      pagination={false}
                      locale={{ emptyText: "Chưa có hợp đồng" }}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Lịch sử cư trú</div>
                    <p style={{ margin: "0 0 12px 0", color: "#6b7280", fontSize: 13 }}>
                      Một dòng một hợp đồng; check-in/out theo BedHistory. Chưa check-out → «—».
                    </p>
                    <Table<StayHistoryRow>
                      size="small"
                      rowKey={(r) => String(r.contractId)}
                      pagination={false}
                      scroll={{ x: 1320 }}
                      dataSource={detailPayload.stayHistory || []}
                      locale={{
                        emptyText:
                          "Chưa có lịch sử — sinh viên chưa có hợp đồng hoặc chưa ghi nhận slot.",
                      }}
                      columns={[
                        {
                          title: "Sinh viên",
                          key: "studentName",
                          width: 150,
                          ellipsis: true,
                          fixed: "left",
                          render: (_: unknown, r: StayHistoryRow) => r.studentName || du?.fullName || "—",
                        },
                        {
                          title: "MSSV",
                          key: "studentId",
                          width: 100,
                          ellipsis: true,
                          render: (_: unknown, r: StayHistoryRow) => r.studentId || du?.studentId || "—",
                        },
                        {
                          title: "Khu",
                          dataIndex: "areaName",
                          key: "areaName",
                          width: 130,
                          ellipsis: true,
                          render: (v?: string) => v || "—",
                        },
                        {
                          title: "Phòng",
                          dataIndex: "roomNumber",
                          key: "roomNumber",
                          width: 88,
                          render: (v?: string) => v || "—",
                        },
                        {
                          title: "Giường / Slot",
                          dataIndex: "bedSlotDisplay",
                          key: "slot",
                          width: 110,
                          ellipsis: true,
                          render: (_: unknown, r: StayHistoryRow) => r.bedSlotDisplay || r.bedCode || "—",
                        },
                        {
                          title: "Ngày check-in",
                          key: "checkInAt",
                          width: 118,
                          render: (_: unknown, r: StayHistoryRow) => formatStayHistoryDateVi(r.checkInAt ?? null),
                        },
                        {
                          title: "Ngày check-out",
                          key: "checkOutAt",
                          width: 118,
                          render: (_: unknown, r: StayHistoryRow) => formatStayHistoryDateVi(r.checkOutAt ?? null),
                        },
                        {
                          title: "Trạng thái cư trú",
                          key: "staySt",
                          width: 150,
                          render: (_: unknown, r: StayHistoryRow) => {
                            const m = residencyStayStatusDisplay(r.residencyStayStatus);
                            return (
                              <Tag color={m.color} style={{ fontWeight: 600 }}>
                                {m.emoji ? `${m.emoji} ` : ""}
                                {m.text}
                              </Tag>
                            );
                          },
                        },
                        {
                          title: "Hợp đồng",
                          dataIndex: "contractNumber",
                          key: "contractNumber",
                          width: 140,
                          ellipsis: true,
                          render: (v?: string) => v || "—",
                        },
                        {
                          title: "Ghi chú",
                          dataIndex: "note",
                          key: "note",
                          ellipsis: true,
                          render: (v?: string) => v || "—",
                        },
                      ]}
                    />
                  </div>

                  {detailPayload.financialSummary ? (
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 600 }}>Công nợ & hóa đơn</div>
                      <div style={{ marginBottom: 8, color: "#6b7280", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <span>
                          Tổng còn nợ:{" "}
                          <strong style={{ color: "#b45309" }}>
                            {(detailPayload.financialSummary.debtTotal || 0).toLocaleString("vi-VN")}đ
                          </strong>
                          {" · "}
                          Chưa thanh toán:{" "}
                          <strong>{detailPayload.financialSummary.unpaidCount ?? 0}</strong> hóa đơn
                        </span>
                        {(detailPayload.financialSummary.unpaidBills || []).some((x) => String(x.status) === "overdue") ? (
                          <Tag color="red" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                            Có hóa đơn quá hạn
                          </Tag>
                        ) : null}
                      </div>
                      <Table<Bill>
                        size="small"
                        rowKey="_id"
                        pagination={false}
                        dataSource={detailPayload.financialSummary.unpaidBills || []}
                        locale={{ emptyText: "Không có hóa đơn chưa thanh toán" }}
                        columns={[
                          {
                            title: "Tháng",
                            key: "period",
                            render: (_: unknown, b: Bill) =>
                              `${String(b.month).padStart(2, "0")}/${b.year}`,
                          },
                          {
                            title: "Tổng tiền",
                            dataIndex: "total",
                            render: (v: number) => `${Number(v || 0).toLocaleString("vi-VN")}đ`,
                          },
                          {
                            title: "Hạn TT",
                            dataIndex: "dueDate",
                            render: (d: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "—"),
                          },
                          {
                            title: "Trạng thái",
                            dataIndex: "status",
                            render: (s: string) =>
                              String(s) === "overdue" ? (
                                <Tag color="red" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                                  Quá hạn
                                </Tag>
                              ) : (
                                <Tag
                                  color={
                                    s === "paid" ? "green" : s === "pending" || s === "unpaid" ? "orange" : "default"
                                  }
                                >
                                  {s === "paid"
                                    ? "Đã thanh toán"
                                    : s === "unpaid"
                                      ? "Chưa TT"
                                      : s === "pending"
                                        ? "Chờ TT"
                                        : s}
                                </Tag>
                              ),
                          },
                        ]}
                      />
                    </div>
                  ) : null}

                  {detailPayload.violationsRecent && detailPayload.violationsRecent.length > 0 ? (
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 600 }}>Lịch sử vi phạm (gần đây)</div>
                      <Table<Violation>
                        size="small"
                        rowKey="_id"
                        pagination={false}
                        dataSource={detailPayload.violationsRecent}
                        columns={[
                          {
                            title: "Ngày",
                            dataIndex: "createdAt",
                            render: (d?: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "—"),
                          },
                          {
                            title: "Vi phạm",
                            key: "rule",
                            render: (_: unknown, r: Violation) => r.ruleName || r.description || "—",
                          },
                          {
                            title: "Mức độ",
                            dataIndex: "severity",
                            render: (s: string) => <Tag>{s}</Tag>,
                          },
                        ]}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {detailIsManager ? (
                <>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Hồ sơ <strong>quản lý khu</strong> — tài khoản vận hành KTX, không dùng mẫu hồ sơ sinh viên.
                  </div>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="Email đăng nhập">{du?.email || "—"}</Descriptions.Item>
                    <Descriptions.Item label="SĐT">{du?.phone || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Ngày tạo tài khoản">
                      {du?.createdAt ? dayjs(du.createdAt).format("DD/MM/YYYY HH:mm") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Cập nhật gần nhất">
                      {du?.updatedAt ? dayjs(du.updatedAt).format("DD/MM/YYYY HH:mm") : "—"}
                    </Descriptions.Item>
                  </Descriptions>
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>Khu được phân công phụ trách</div>
                    <Table<Area>
                      size="small"
                      rowKey="_id"
                      pagination={false}
                      dataSource={detailPayload.managedAreas || []}
                      locale={{
                        emptyText: "Chưa gán khu — cập nhật tại Sửa người dùng hoặc gán quản lý trong Quản lý khu & phòng.",
                      }}
                      columns={[
                        { title: "Tên khu", dataIndex: "name", key: "name", render: (v: string) => v || "—" },
                        {
                          title: "Phân loại",
                          key: "gp",
                          width: 120,
                          render: (_: unknown, z: Area) => genderPolicyLabels[String(z.genderPolicy || "mixed")] || "—",
                        },
                        { title: "Mô tả", dataIndex: "description", key: "d", ellipsis: true, render: (v: string) => v || "—" },
                      ]}
                    />
                  </div>
                </>
              ) : null}

              {detailIsAdmin ? (
                <>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Hồ sơ <strong>quản trị viên</strong> — quản lý hệ thống, không có hồ sơ lưu trú KTX.
                  </div>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="Email đăng nhập">{du?.email || "—"}</Descriptions.Item>
                    <Descriptions.Item label="SĐT">{du?.phone || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Quản trị cấp cao">{du?.isSuperAdmin ? <Tag color="magenta">Có</Tag> : <Tag>Không</Tag>}</Descriptions.Item>
                    <Descriptions.Item label="Ngày tạo tài khoản">
                      {du?.createdAt ? dayjs(du.createdAt).format("DD/MM/YYYY HH:mm") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Phạm vi nghiệp vụ">
                      Toàn hệ thống KTX (người dùng, khu/phòng, đơn, hợp đồng, hóa đơn, cấu hình…). Không áp dụng phòng/giường/hợp đồng nội trú cá nhân.
                    </Descriptions.Item>
                  </Descriptions>
                </>
              ) : null}
            </Space>
          </Spin>
        )}
      </Modal>

      <Modal
        title={rejectModal ? `Từ chối tài khoản — ${rejectModal.fullName}` : "Từ chối tài khoản"}
        open={!!rejectModal}
        onCancel={() => {
          setRejectModal(null);
          rejectForm.resetFields();
        }}
        footer={null}
      >
        <Form form={rejectForm} layout="vertical" onFinish={submitRejectPendingAccount}>
          <Form.Item
            name="rejectionReason"
            label="Lý do từ chối"
            rules={[{ required: true, message: "Vui lòng nhập lý do từ chối" }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setRejectModal(null)}>Hủy</Button>
              <Button danger type="primary" htmlType="submit">
                Xác nhận từ chối
              </Button>
            </Space>
          </Form.Item>
        </Form>
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
