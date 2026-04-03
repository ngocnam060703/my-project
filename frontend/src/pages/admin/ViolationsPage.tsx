import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Tabs,
  Form,
  Select,
  Input,
  InputNumber,
  Switch,
  Button,
  message,
  Tag,
  Space,
  Upload,
  Row,
  Col,
  Statistic,
  Modal,
  Descriptions,
  Image,
  Typography,
  Alert,
  Popconfirm,
} from "antd";
import {
  WarningOutlined,
  PlusOutlined,
  ReloadOutlined,
  DownloadOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { violationsApi, disciplinaryApi, client } from "../../api";
import type { ViolationRule, Violation, User, Room } from "../../types";

const severityVi: Record<string, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
};

const actionTypeVi: Record<string, string> = {
  warning: "Cảnh cáo / nhắc nhở",
  fine: "Phạt tiền",
  expulsion: "Buộc rời KTX",
};

function isViolationPending(r: Violation) {
  return !r.status || r.status === "pending";
}

function defaultSchoolYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

function csvEscape(cell: string): string {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const BOM = "\uFEFF";
  const lines = [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))];
  const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ViolationsPage: React.FC = () => {
  const [rules, setRules] = useState<ViolationRule[]>([]);
  const [rulesLoadFailed, setRulesLoadFailed] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [violations, setViolations] = useState<Violation[]>([]);
  const [vTotal, setVTotal] = useState(0);
  const [vPage, setVPage] = useState(1);
  const [vPageSize, setVPageSize] = useState(10);
  const [filterUserId, setFilterUserId] = useState<string | undefined>();
  const [filterRoomId, setFilterRoomId] = useState<string | undefined>();
  const [filterSeverity, setFilterSeverity] = useState<string | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [summary, setSummary] = useState<
    { user?: User; totalPoints: number; violationCount: number; warning: { text: string; severity: string } }[]
  >([]);
  const [summarySearch, setSummarySearch] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<Violation | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [resolveTarget, setResolveTarget] = useState<Violation | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Violation | null>(null);
  const [form] = Form.useForm();
  const [resolveForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [semester, setSemester] = useState("HK1");

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setVPage(1);
  }, [searchDebounced]);

  const loadRules = useCallback(async () => {
    try {
      const r = await violationsApi.getRules();
      const list = Array.isArray(r.data) ? r.data : [];
      setRules(list);
      setRulesLoadFailed(false);
    } catch {
      setRules([]);
      setRulesLoadFailed(true);
      message.error("Không tải được bảng vi phạm");
    }
  }, []);

  const loadRoomsStudents = useCallback(async () => {
    try {
      const [roomRes, userRes] = await Promise.all([
        client.get("/rooms", { params: { limit: 500 } }),
        client.get("/users", { params: { role: "user", limit: 500 } }),
      ]);
      setRooms(roomRes.data?.rooms || []);
      setStudents(userRes.data?.users || []);
    } catch {
      message.error("Không tải danh sách phòng/sinh viên");
    }
  }, []);

  const loadViolations = useCallback(async () => {
    setLoading(true);
    try {
      const vRes = await violationsApi.getAll({
        page: vPage,
        limit: vPageSize,
        schoolYear,
        semester,
        user: filterUserId,
        room: filterRoomId,
        search: searchDebounced || undefined,
        severity: filterSeverity,
        status: filterStatus,
      });
      setViolations(vRes.data?.violations || []);
      setVTotal(vRes.data?.total || 0);
    } catch {
      message.error("Không tải được danh sách vi phạm");
    } finally {
      setLoading(false);
    }
  }, [vPage, vPageSize, schoolYear, semester, filterUserId, filterRoomId, searchDebounced, filterSeverity, filterStatus]);

  const loadSummary = useCallback(async () => {
    try {
      const r = await violationsApi.getStudentsSummary({ schoolYear, semester });
      setSummary(r.data?.students || []);
    } catch {
      message.error("Không tải được tổng điểm");
    }
  }, [schoolYear, semester]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadRoomsStudents();
  }, [loadRoomsStudents]);

  useEffect(() => {
    void loadViolations();
  }, [loadViolations]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const submitViolation = async (v: Record<string, unknown>) => {
    try {
      const imgs: string[] = [];
      for (const f of fileList) {
        if (f.originFileObj) {
          const b64 = await fileToBase64(f.originFileObj as File);
          imgs.push(b64);
        }
      }
      await violationsApi.create({
        ruleId: v.ruleId,
        userId: v.splitToRoom ? undefined : v.userId,
        roomId: v.roomId,
        semester: v.semester,
        schoolYear: v.schoolYear,
        description: v.description || "",
        images: imgs,
        fineAmount: v.fineAmount ?? 0,
        compensationAmount: v.compensationAmount ?? 0,
        splitToRoom: !!v.splitToRoom,
        immediateExpulsion: !!v.immediateExpulsion,
        noIndividualPoints: !!v.noIndividualPoints,
      });
      message.success("Đã ghi nhận vi phạm");
      form.resetFields();
      form.setFieldsValue({ semester: "HK1", schoolYear: defaultSchoolYear() });
      setFileList([]);
      void loadViolations();
      void loadSummary();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const submitResolve = async (vals: { actionType: string; penaltyAmount?: number; note?: string }) => {
    if (!resolveTarget) return;
    const target = resolveTarget;
    setResolveLoading(true);
    try {
      const r = await disciplinaryApi.resolve({
        violationId: target._id,
        actionType: vals.actionType,
        penaltyAmount: vals.actionType === "fine" ? vals.penaltyAmount : undefined,
        note: vals.note,
      });

      const updated = r.data as Violation;
      // Cập nhật ngay trên UI (không reload trang), đảm bảo dòng chuyển sang “Đã xử lý”.
      setViolations((prev) => prev.map((it) => (it._id === target._id ? updated : it)));
      setDetail((prev) => (prev && prev._id === target._id ? updated : prev));
      message.success("Đã xử lý");
      setResolveTarget(null);
      resolveForm.resetFields();
      void loadSummary();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi xử lý");
    } finally {
      setResolveLoading(false);
    }
  };

  const submitEdit = async (vals: { description?: string; fineAmount?: number; compensationAmount?: number }) => {
    if (!editTarget) return;
    try {
      await violationsApi.update(editTarget._id, vals);
      message.success("Đã cập nhật");
      setEditTarget(null);
      editForm.resetFields();
      void loadViolations();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi cập nhật");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await violationsApi.remove(id);
      message.success("Đã xóa");
      void loadViolations();
      void loadSummary();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không xóa được");
    }
  };

  const exportViolationsCsv = async () => {
    const maxRows = 5000;
    setExporting(true);
    try {
      const r = await violationsApi.getAll({
        page: 1,
        limit: maxRows,
        schoolYear,
        semester,
        user: filterUserId,
        room: filterRoomId,
        search: searchDebounced || undefined,
        severity: filterSeverity,
        status: filterStatus,
      });
      const list: Violation[] = r.data?.violations || [];
      const total: number = r.data?.total ?? list.length;
      if (total > maxRows) {
        message.warning(`Chỉ xuất tối đa ${maxRows} bản ghi mới nhất (${total} bản khớp bộ lọc).`);
      }
      const header = [
        "Thời gian",
        "Trạng thái",
        "Xử lý",
        "Sinh viên",
        "MSSV",
        "Phòng",
        "Khu",
        "Vi phạm",
        "Mức độ",
        "Điểm",
        "Phạt (VNĐ)",
        "Bồi thường (VNĐ)",
        "Chia phòng",
        "Mô tả",
        "Người ghi",
      ];
      const rows = list.map((rec) => {
        const u = typeof rec.user === "object" ? rec.user : undefined;
        const rm = typeof rec.room === "object" ? rec.room : undefined;
        const areaName = rm && typeof rm.area === "object" && rm.area?.name ? rm.area.name : "";
        const by = typeof rec.recordedBy === "object" ? rec.recordedBy?.fullName : "";
        const st = !rec.status || rec.status === "pending" ? "Chờ xử lý" : "Đã xử lý";
        const res = rec.resolution
          ? `${actionTypeVi[rec.resolution.actionType] || rec.resolution.actionType}${rec.resolution.penaltyAmount ? ` ${rec.resolution.penaltyAmount}đ` : ""}`
          : "";
        return [
          rec.createdAt ? new Date(rec.createdAt).toLocaleString("vi-VN") : "",
          st,
          res,
          u?.fullName || "",
          u?.studentId || "",
          rm?.roomNumber || "",
          areaName,
          rec.ruleName || "",
          severityVi[rec.severity] || rec.severity,
          String(rec.points ?? 0),
          String(rec.fineAmount ?? 0),
          String(rec.compensationAmount ?? 0),
          rec.splitToRoom ? "Có" : "Không",
          rec.description || "",
          by || "",
        ];
      });
      downloadCsv(`vi-pham-${schoolYear}-${semester}.csv`, header, rows);
      message.success(`Đã xuất ${list.length} dòng`);
    } catch {
      message.error("Xuất CSV thất bại");
    } finally {
      setExporting(false);
    }
  };

  const exportSummaryCsv = () => {
    const q = summarySearch.trim().toLowerCase();
    const list = q
      ? summary.filter((r) => {
          const u = r.user as User | undefined;
          const name = (u?.fullName || "").toLowerCase();
          const id = (u?.studentId || "").toLowerCase();
          return name.includes(q) || id.includes(q);
        })
      : summary;
    const header = ["Sinh viên", "MSSV", "Số lần VP", "Tổng điểm", "Cảnh báo"];
    const rows = list.map((r) => {
      const u = r.user as User | undefined;
      return [u?.fullName || "", u?.studentId || "", String(r.violationCount), String(r.totalPoints), r.warning?.text || ""];
    });
    downloadCsv(`tong-diem-vp-${schoolYear}-${semester}.csv`, header, rows);
    message.success(`Đã xuất ${list.length} sinh viên`);
  };

  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.handlingAction || "").toLowerCase().includes(q)
    );
  }, [rules, ruleSearch]);

  const filteredSummary = useMemo(() => {
    const q = summarySearch.trim().toLowerCase();
    if (!q) return summary;
    return summary.filter((r) => {
      const u = r.user as User | undefined;
      const name = (u?.fullName || "").toLowerCase();
      const id = (u?.studentId || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [summary, summarySearch]);

  const selectedRuleId = Form.useWatch("ruleId", form);
  const selectedRule = rules.find((r) => r._id === selectedRuleId);

  const filterToolbar = (
    <Space wrap style={{ marginBottom: 12 }} size="middle">
      <Input
        placeholder="Tìm theo tên vi phạm, mô tả, sinh viên..."
        allowClear
        style={{ width: 280 }}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />
      <Select
        allowClear
        placeholder="Sinh viên"
        showSearch
        optionFilterProp="label"
        style={{ width: 200 }}
        value={filterUserId}
        onChange={(v) => {
          setFilterUserId(v || undefined);
          setVPage(1);
        }}
        options={students.map((s) => ({
          value: s._id,
          label: `${s.fullName}${s.studentId ? ` (${s.studentId})` : ""}`,
        }))}
      />
      <Select
        allowClear
        placeholder="Phòng"
        showSearch
        optionFilterProp="label"
        style={{ width: 200 }}
        value={filterRoomId}
        onChange={(v) => {
          setFilterRoomId(v || undefined);
          setVPage(1);
        }}
        options={rooms.map((r) => ({
          value: r._id,
          label: `Phòng ${r.roomNumber}${typeof r.area === "object" && r.area?.name ? ` — ${r.area.name}` : ""}`,
        }))}
      />
      <Select
        allowClear
        placeholder="Mức độ"
        style={{ width: 120 }}
        value={filterSeverity}
        onChange={(v) => {
          setFilterSeverity(v || undefined);
          setVPage(1);
        }}
        options={[
          { value: "light", label: "Nhẹ" },
          { value: "medium", label: "Trung bình" },
          { value: "heavy", label: "Nặng" },
        ]}
      />
      <Select
        allowClear
        placeholder="Trạng thái xử lý"
        style={{ width: 150 }}
        value={filterStatus}
        onChange={(v) => {
          setFilterStatus(v || undefined);
          setVPage(1);
        }}
        options={[
          { value: "pending", label: "Chờ xử lý" },
          { value: "resolved", label: "Đã xử lý" },
        ]}
      />
      <span>Năm học:</span>
      <Input
        style={{ width: 130 }}
        value={schoolYear}
        onChange={(e) => {
          setSchoolYear(e.target.value);
          setVPage(1);
        }}
      />
      <span>Học kỳ:</span>
      <Select
        style={{ width: 100 }}
        value={semester}
        onChange={(v) => {
          setSemester(v);
          setVPage(1);
        }}
        options={[
          { value: "HK1", label: "HK1" },
          { value: "HK2", label: "HK2" },
          { value: "HK3", label: "HK3" },
        ]}
      />
      <Button icon={<ReloadOutlined />} onClick={() => { void loadViolations(); void loadSummary(); }}>
        Làm mới
      </Button>
      <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void exportViolationsCsv()}>
        Xuất CSV
      </Button>
    </Space>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>
          <WarningOutlined /> Xử lý vi phạm kỷ luật
        </h2>
        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
          Bảng vi phạm chuẩn, điểm tích lũy theo học kỳ, hóa đơn phạt riêng khi có tiền phạt/bồi thường
        </p>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Ngưỡng nhắc nhở" value="1–2 điểm" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Cảnh cáo / Nghiêm trọng" value="3–6 điểm" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Buộc rời KTX" value="≥ 7 điểm" valueStyle={{ color: "#cf1322" }} />
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: "rules",
            label: "Bảng vi phạm",
            children: (
              <Card>
                <Space style={{ marginBottom: 12 }}>
                  <Input.Search
                    allowClear
                    placeholder="Tìm theo mã, tên vi phạm, cách xử lý..."
                    style={{ width: 320 }}
                    value={ruleSearch}
                    onChange={(e) => setRuleSearch(e.target.value)}
                  />
                  <Typography.Text type="secondary">
                    {filteredRules.length}/{rules.length} quy tắc
                  </Typography.Text>
                </Space>
                <Table
                  rowKey="_id"
                  dataSource={filteredRules}
                  pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (t) => `${t} dòng` }}
                  columns={[
                    { title: "STT", dataIndex: "order", width: 60 },
                    { title: "Mã", dataIndex: "code", width: 90 },
                    { title: "Vi phạm", dataIndex: "name" },
                    { title: "Mức độ", dataIndex: "severity", width: 110, render: (s: string) => severityVi[s] || s },
                    { title: "Điểm", dataIndex: "points", width: 70 },
                    {
                      title: "Tiền phạt (VNĐ)",
                      key: "fine",
                      width: 140,
                      render: (_: unknown, r: ViolationRule) =>
                        r.fineMax > 0 ? `${r.fineMin.toLocaleString("vi-VN")} – ${r.fineMax.toLocaleString("vi-VN")}` : "0",
                    },
                    {
                      title: "Bồi thường",
                      key: "comp",
                      width: 100,
                      render: (_: unknown, r: ViolationRule) => (r.compensationRequired ? "Có" : "Không"),
                    },
                    { title: "Cách xử lý", dataIndex: "handlingAction", ellipsis: true },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "create",
            label: "Ghi nhận vi phạm",
            children: (
              <Card
                title="Biểu mẫu ghi nhận"
                extra={
                  <Button type="primary" onClick={() => form.submit()}>
                    Lưu vi phạm
                  </Button>
                }
              >
                {rulesLoadFailed && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Không tải được danh sách loại vi phạm"
                    description="Kiểm tra đăng nhập admin và API /violations/rules. Thử làm mới trang."
                  />
                )}
                {!rulesLoadFailed && rules.length === 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Chưa có loại vi phạm trong hệ thống"
                    description={
                      <span>
                        Cần nạp dữ liệu mẫu. Trong thư mục <Typography.Text code>backend</Typography.Text> chạy:{" "}
                        <Typography.Text code copyable>
                          npm run seed:violations
                        </Typography.Text>{" "}
                        rồi tải lại trang (tab Bảng vi phạm sẽ có VP001…).
                      </span>
                    }
                  />
                )}
                {rules.length > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    closable
                    style={{ marginBottom: 16 }}
                    message="Cách chọn loại vi phạm"
                    description="Ô «Loại vi phạm» không nhập tự do: hãy chọn một dòng trong danh sách, hoặc gõ mã (VD: VP001) / từ khóa trong tên để lọc. Nếu gõ sai sẽ báo «Không có dữ liệu»."
                  />
                )}
                {rooms.length === 0 && !rulesLoadFailed && (
                  <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Chưa có phòng nào để chọn — kiểm tra mục Quản lý phòng." />
                )}
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={submitViolation}
                  onFinishFailed={() => {
                    const split = form.getFieldValue("splitToRoom");
                    message.warning(
                      split
                        ? "Chọn loại vi phạm từ danh sách và chọn phòng. Với «chia cả phòng», phòng phải đang có ít nhất một hợp đồng hiệu lực."
                        : "Chọn loại vi phạm từ danh sách, phòng và sinh viên vi phạm."
                    );
                  }}
                  initialValues={{ semester: "HK1", schoolYear: defaultSchoolYear(), fineAmount: 0, compensationAmount: 0 }}
                >
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item name="ruleId" label="Loại vi phạm" rules={[{ required: true, message: "Chọn một loại trong danh sách" }]}>
                        <Select
                          showSearch
                          allowClear
                          placeholder="Chọn hoặc gõ VP001, VP002… để lọc"
                          optionFilterProp="label"
                          notFoundContent={
                            rules.length === 0 ? "Chưa có dữ liệu — chạy seed:violations" : "Không khớp — xóa chữ và chọn trong danh sách"
                          }
                          filterOption={(input, option) =>
                            String(option?.label ?? "")
                              .toLowerCase()
                              .includes(input.trim().toLowerCase())
                          }
                          options={rules.map((r) => ({
                            value: r._id,
                            label: `${r.code} — ${r.name} (${severityVi[r.severity]}, +${r.points} điểm)`,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item name="schoolYear" label="Năm học" rules={[{ required: true }]}>
                        <Input placeholder="VD: 2025-2026" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item name="semester" label="Học kỳ" rules={[{ required: true }]}>
                        <Select options={[{ value: "HK1", label: "HK1" }, { value: "HK2", label: "HK2" }, { value: "HK3", label: "HK3 (hè)" }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="roomId" label="Phòng" rules={[{ required: true, message: "Chọn phòng" }]}>
                    <Select
                      showSearch
                      allowClear
                      placeholder={rooms.length ? "Chọn phòng vi phạm" : "Đang không có phòng — tạo phòng trước"}
                      disabled={rooms.length === 0}
                      optionFilterProp="label"
                      notFoundContent="Không có phòng phù hợp"
                      options={rooms.map((r) => ({
                        value: r._id,
                        label: `Phòng ${r.roomNumber}${typeof r.area === "object" && r.area?.name ? ` — ${r.area.name}` : ""}`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="splitToRoom" label="Chia phạt/bồi thường cho cả phòng (không xác định người)" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item shouldUpdate noStyle>
                    {() =>
                      form.getFieldValue("splitToRoom") ? null : (
                        <Form.Item name="userId" label="Sinh viên vi phạm" rules={[{ required: true, message: "Chọn sinh viên hoặc bật chia phòng" }]}>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={students.map((s) => ({
                              value: s._id,
                              label: `${s.fullName}${s.studentId ? ` (${s.studentId})` : ""}`,
                            }))}
                          />
                        </Form.Item>
                      )
                    }
                  </Form.Item>
                  <Form.Item name="noIndividualPoints" label="Không cộng điểm cá nhân (tuỳ trường hợp)" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col xs={24} md={8}>
                      <Form.Item name="fineAmount" label="Tiền phạt (VNĐ)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name="compensationAmount" label="Bồi thường (VNĐ)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  {selectedRule && (
                    <p style={{ color: "#64748b", fontSize: 13 }}>
                      Gợi ý: phạt {selectedRule.fineMin > 0 ? `${selectedRule.fineMin.toLocaleString("vi-VN")} – ${selectedRule.fineMax.toLocaleString("vi-VN")}đ` : "0"}
                      {selectedRule.compensationRequired ? ` | Bồi thường: ${selectedRule.compensationNote || "theo quy định"}` : ""}
                    </p>
                  )}
                  <Form.Item name="immediateExpulsion" label="Chấm dứt hợp đồng ngay (vi phạm nặng)" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item name="description" label="Mô tả / ghi chú">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item label="Ảnh minh chứng">
                    <Upload
                      listType="picture-card"
                      fileList={fileList}
                      beforeUpload={async (file) => {
                        if (file.size > 800 * 1024) {
                          message.warning("Ảnh tối đa ~800KB");
                          return Upload.LIST_IGNORE;
                        }
                        setFileList((prev) => [...prev, { uid: file.uid, name: file.name, status: "done", originFileObj: file }]);
                        return false;
                      }}
                      onRemove={(f) => setFileList((prev) => prev.filter((x) => x.uid !== f.uid))}
                    >
                      {fileList.length >= 5 ? null : (
                        <div>
                          <PlusOutlined />
                          <div style={{ marginTop: 8 }}>Tải ảnh</div>
                        </div>
                      )}
                    </Upload>
                  </Form.Item>
                  <Button type="primary" htmlType="submit" size="large">
                    Lưu vi phạm
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: "list",
            label: "Danh sách đã ghi",
            children: (
              <Card>
                {filterToolbar}
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                  Tổng {vTotal} bản ghi
                  {searchDebounced ? ` · đang lọc theo “${searchDebounced}”` : ""}
                </Typography.Text>
                <Table
                  rowKey="_id"
                  loading={loading}
                  dataSource={violations}
                  scroll={{ x: 1280 }}
                  pagination={{
                    current: vPage,
                    pageSize: vPageSize,
                    total: vTotal,
                    showSizeChanger: true,
                    pageSizeOptions: [10, 20, 50, 100],
                    showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} bản ghi`,
                    onChange: (p, ps) => {
                      setVPage(p);
                      setVPageSize(ps);
                    },
                  }}
                  columns={[
                    { title: "Thời gian", key: "t", width: 160, render: (_: unknown, r: Violation) => (r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "-") },
                    { title: "Sinh viên", key: "u", ellipsis: true, render: (_: unknown, r: Violation) => (typeof r.user === "object" ? r.user?.fullName : "-") },
                    {
                      title: "MSSV",
                      key: "sid",
                      width: 110,
                      render: (_: unknown, r: Violation) => (typeof r.user === "object" ? r.user?.studentId || "—" : "—"),
                    },
                    { title: "Phòng", key: "room", width: 90, render: (_: unknown, r: Violation) => (typeof r.room === "object" ? r.room?.roomNumber : "-") },
                    { title: "Vi phạm", dataIndex: "ruleName", ellipsis: true },
                    {
                      title: "Mức độ",
                      key: "sev",
                      width: 100,
                      render: (_: unknown, r: Violation) => <Tag>{severityVi[r.severity] || r.severity}</Tag>,
                    },
                    { title: "Điểm", dataIndex: "points", width: 60 },
                    {
                      title: "TT",
                      key: "st",
                      width: 100,
                      render: (_: unknown, r: Violation) =>
                        isViolationPending(r) ? <Tag color="orange">Chờ xử lý</Tag> : <Tag color="green">Đã xử lý</Tag>,
                    },
                    {
                      title: "Quyết định",
                      key: "res",
                      width: 130,
                      ellipsis: true,
                      render: (_: unknown, r: Violation) =>
                        r.resolution ? (
                          <span>
                            {actionTypeVi[r.resolution.actionType] || r.resolution.actionType}
                            {r.resolution.penaltyAmount ? ` · ${r.resolution.penaltyAmount.toLocaleString("vi-VN")}đ` : ""}
                          </span>
                        ) : (
                          "—"
                        ),
                    },
                    { title: "Phạt", dataIndex: "fineAmount", width: 100, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
                    { title: "Bồi thường", dataIndex: "compensationAmount", width: 100, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
                    {
                      title: "Ảnh",
                      key: "img",
                      width: 70,
                      render: (_: unknown, r: Violation) => (r.images?.length ? `${r.images.length} ảnh` : "-"),
                    },
                    {
                      title: "Thao tác",
                      key: "act",
                      width: 220,
                      fixed: "right" as const,
                      render: (_: unknown, r: Violation) => (
                        <Space size={0} wrap>
                          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)} aria-label="Chi tiết" />
                          {isViolationPending(r) && (
                            <Button
                              type="link"
                              size="small"
                              icon={<CheckCircleOutlined />}
                              onClick={() => {
                                setResolveTarget(r);
                                resolveForm.resetFields();
                                resolveForm.setFieldsValue({ actionType: "warning" });
                              }}
                            >
                              Xử lý
                            </Button>
                          )}
                          {isViolationPending(r) && (
                            <Button
                              type="link"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setEditTarget(r);
                                editForm.setFieldsValue({
                                  description: r.description,
                                  fineAmount: r.fineAmount,
                                  compensationAmount: r.compensationAmount,
                                });
                              }}
                            >
                              Sửa
                            </Button>
                          )}
                          {isViolationPending(r) && !r.bill && (
                            <Popconfirm title="Xóa bản ghi vi phạm?" okText="Xóa" cancelText="Hủy" onConfirm={() => void handleDelete(r._id)}>
                              <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="Xóa" />
                            </Popconfirm>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "summary",
            label: "Điểm theo sinh viên",
            children: (
              <Card>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input
                    style={{ width: 140 }}
                    value={schoolYear}
                    onChange={(e) => {
                      setSchoolYear(e.target.value);
                      setVPage(1);
                    }}
                  />
                  <Select
                    style={{ width: 100 }}
                    value={semester}
                    onChange={(v) => {
                      setSemester(v);
                      setVPage(1);
                    }}
                    options={[
                      { value: "HK1", label: "HK1" },
                      { value: "HK2", label: "HK2" },
                      { value: "HK3", label: "HK3" },
                    ]}
                  />
                  <Input.Search
                    allowClear
                    placeholder="Tìm tên hoặc MSSV..."
                    style={{ width: 240 }}
                    value={summarySearch}
                    onChange={(e) => setSummarySearch(e.target.value)}
                  />
                  <Button icon={<ReloadOutlined />} onClick={() => void loadSummary()}>
                    Làm mới
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={exportSummaryCsv}>
                    Xuất CSV
                  </Button>
                </Space>
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                  {filteredSummary.length} sinh viên
                </Typography.Text>
                <Table
                  rowKey={(r) => String((r.user as User)?._id || "")}
                  dataSource={filteredSummary}
                  pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (t) => `${t} sinh viên` }}
                  columns={[
                    { title: "Sinh viên", render: (_: unknown, r) => (r.user as User)?.fullName || "-" },
                    { title: "MSSV", render: (_: unknown, r) => (r.user as User)?.studentId || "-" },
                    { title: "Số lần VP", dataIndex: "violationCount", width: 100 },
                    { title: "Tổng điểm", dataIndex: "totalPoints", width: 100, render: (n: number) => <strong>{n}</strong> },
                    {
                      title: "Cảnh báo",
                      key: "w",
                      render: (_: unknown, r) => {
                        const sev = r.warning?.severity;
                        const color = sev === "critical" ? "red" : sev === "high" ? "orange" : sev === "medium" ? "gold" : "blue";
                        return <Tag color={color}>{r.warning?.text}</Tag>;
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="Chi tiết vi phạm"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Thời gian">
                {detail.createdAt ? new Date(detail.createdAt).toLocaleString("vi-VN") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Sinh viên">
                {typeof detail.user === "object" ? `${detail.user?.fullName || ""} (${detail.user?.studentId || "—"})` : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Phòng">
                {typeof detail.room === "object"
                  ? `Phòng ${detail.room?.roomNumber}${typeof detail.room.area === "object" && detail.room.area?.name ? ` — ${detail.room.area.name}` : ""}`
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Năm học / HK">
                {detail.schoolYear} · {detail.semester}
              </Descriptions.Item>
              <Descriptions.Item label="Vi phạm">{detail.ruleName}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái xử lý">
                {isViolationPending(detail) ? "Chờ xử lý (pending)" : "Đã xử lý (resolved)"}
              </Descriptions.Item>
              {detail.resolution && (
                <>
                  <Descriptions.Item label="Quyết định kỷ luật">
                    {actionTypeVi[detail.resolution.actionType] || detail.resolution.actionType}
                  </Descriptions.Item>
                  {(detail.resolution.penaltyAmount || 0) > 0 && (
                    <Descriptions.Item label="Tiền phạt (theo quyết định)">
                      {detail.resolution.penaltyAmount!.toLocaleString("vi-VN")}đ
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="Ghi chú xử lý">{detail.resolution.note?.trim() || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Người xử lý">
                    {typeof detail.resolution.resolvedBy === "object" ? detail.resolution.resolvedBy?.fullName || "—" : "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Thời điểm xử lý">
                    {detail.resolution.resolvedAt ? new Date(detail.resolution.resolvedAt).toLocaleString("vi-VN") : "—"}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="Mức độ">{severityVi[detail.severity] || detail.severity}</Descriptions.Item>
              <Descriptions.Item label="Điểm">{detail.points}</Descriptions.Item>
              <Descriptions.Item label="Phạt">{(detail.fineAmount || 0).toLocaleString("vi-VN")}đ</Descriptions.Item>
              <Descriptions.Item label="Bồi thường">{(detail.compensationAmount || 0).toLocaleString("vi-VN")}đ</Descriptions.Item>
              <Descriptions.Item label="Chia phòng">{detail.splitToRoom ? "Có" : "Không"}</Descriptions.Item>
              <Descriptions.Item label="Không cộng điểm cá nhân">{detail.noIndividualPoints ? "Có" : "Không"}</Descriptions.Item>
              <Descriptions.Item label="Kỷ luật nặng (chấm dứt HĐ)">{detail.immediateExpulsion ? "Có" : "Không"}</Descriptions.Item>
              <Descriptions.Item label="Người ghi">
                {typeof detail.recordedBy === "object" ? detail.recordedBy?.fullName || "—" : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả">{detail.description?.trim() ? detail.description : "—"}</Descriptions.Item>
            </Descriptions>
            {detail.images && detail.images.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text strong>Ảnh minh chứng</Typography.Text>
                <Image.PreviewGroup>
                  <Space wrap style={{ marginTop: 8 }}>
                    {detail.images.map((src, i) => (
                      <Image key={i} src={src} alt="" width={120} style={{ objectFit: "cover", borderRadius: 4 }} />
                    ))}
                  </Space>
                </Image.PreviewGroup>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        title="Xử lý vi phạm"
        open={!!resolveTarget}
        onCancel={() => {
          setResolveTarget(null);
          resolveForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        width={480}
      >
        {resolveTarget && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              <strong>{resolveTarget.ruleName}</strong>
              {typeof resolveTarget.user === "object" && resolveTarget.user?.fullName
                ? ` — ${resolveTarget.user.fullName}`
                : ""}
            </Typography.Paragraph>
            <Form form={resolveForm} layout="vertical" onFinish={submitResolve}>
              <Form.Item name="actionType" label="Hình thức xử lý" rules={[{ required: true, message: "Chọn hình thức" }]}>
                <Select
                  options={[
                    { value: "warning", label: actionTypeVi.warning },
                    { value: "fine", label: actionTypeVi.fine },
                    { value: "expulsion", label: actionTypeVi.expulsion },
                  ]}
                />
              </Form.Item>
              <Form.Item shouldUpdate={(prev, cur) => prev.actionType !== cur.actionType} noStyle>
                {() =>
                  resolveForm.getFieldValue("actionType") === "fine" ? (
                    <Form.Item
                      name="penaltyAmount"
                      label="Số tiền phạt (VNĐ)"
                      rules={[{ required: true, message: "Nhập số tiền phạt" }]}
                    >
                      <InputNumber min={1} style={{ width: "100%" }} placeholder="VD: 100000" />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
              <Form.Item name="note" label="Ghi chú quyết định">
                <Input.TextArea rows={3} placeholder="Tùy chọn" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={resolveLoading}>
                Xác nhận xử lý
              </Button>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        title="Sửa vi phạm (chỉ khi chưa xử lý)"
        open={!!editTarget}
        onCancel={() => {
          setEditTarget(null);
          editForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        width={520}
      >
        {editTarget && (
          <Form form={editForm} layout="vertical" onFinish={submitEdit}>
            <Form.Item name="description" label="Mô tả / ghi chú">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="fineAmount" label="Tiền phạt ghi nhận (VNĐ)">
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="compensationAmount" label="Bồi thường (VNĐ)">
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" htmlType="submit">
              Lưu thay đổi
            </Button>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default ViolationsPage;
