import React, { useEffect, useState, useCallback } from "react";
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
} from "antd";
import { WarningOutlined, PlusOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { violationsApi, client } from "../../api";
import type { ViolationRule, Violation, User, Room } from "../../types";

const severityVi: Record<string, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
};

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

const ViolationsPage: React.FC = () => {
  const [rules, setRules] = useState<ViolationRule[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [vTotal, setVTotal] = useState(0);
  const [summary, setSummary] = useState<{ user?: User; totalPoints: number; violationCount: number; warning: { text: string; severity: string } }[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [semester, setSemester] = useState("HK1");

  const loadRules = useCallback(async () => {
    try {
      const r = await violationsApi.getRules();
      setRules(r.data || []);
    } catch {
      message.error("Không tải được bảng vi phạm");
    }
  }, []);

  const loadViolations = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, roomRes, userRes] = await Promise.all([
        violationsApi.getAll({ limit: 100, schoolYear, semester }),
        client.get("/rooms", { params: { limit: 500 } }),
        client.get("/users", { params: { role: "user", limit: 500 } }),
      ]);
      setViolations(vRes.data?.violations || []);
      setVTotal(vRes.data?.total || 0);
      setRooms(roomRes.data?.rooms || []);
      setStudents(userRes.data?.users || []);
    } catch {
      message.error("Không tải được danh sách vi phạm");
    } finally {
      setLoading(false);
    }
  }, [schoolYear, semester]);

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
    void loadViolations();
    void loadSummary();
  }, [loadViolations, loadSummary]);

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

  const selectedRuleId = Form.useWatch("ruleId", form);
  const selectedRule = rules.find((r) => r._id === selectedRuleId);

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
        <Col span={8}>
          <Card size="small">
            <Statistic title="Ngưỡng nhắc nhở" value="1–2 điểm" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Cảnh cáo / Nghiêm trọng" value="3–6 điểm" />
          </Card>
        </Col>
        <Col span={8}>
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
                <Table
                  rowKey="_id"
                  dataSource={rules}
                  pagination={false}
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
              <Card>
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={submitViolation}
                  initialValues={{ semester: "HK1", schoolYear: defaultSchoolYear(), fineAmount: 0, compensationAmount: 0 }}
                >
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item name="ruleId" label="Loại vi phạm" rules={[{ required: true }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
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
                  <Form.Item name="roomId" label="Phòng" rules={[{ required: true }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
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
                  <Button type="primary" htmlType="submit">
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
                <Space style={{ marginBottom: 12 }}>
                  <span>Năm học:</span>
                  <Input style={{ width: 140 }} value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
                  <span>Học kỳ:</span>
                  <Select style={{ width: 100 }} value={semester} onChange={setSemester} options={[{ value: "HK1", label: "HK1" }, { value: "HK2", label: "HK2" }, { value: "HK3", label: "HK3" }]} />
                  <Button onClick={() => { void loadViolations(); void loadSummary(); }}>Làm mới</Button>
                </Space>
                <Table
                  rowKey="_id"
                  loading={loading}
                  dataSource={violations}
                  pagination={{ total: vTotal, pageSize: 20, showTotal: (t) => `Tổng ${t}` }}
                  columns={[
                    { title: "Thời gian", key: "t", width: 160, render: (_: unknown, r: Violation) => (r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "-") },
                    { title: "Sinh viên", key: "u", render: (_: unknown, r: Violation) => (typeof r.user === "object" ? r.user?.fullName : "-") },
                    { title: "Phòng", key: "room", render: (_: unknown, r: Violation) => (typeof r.room === "object" ? r.room?.roomNumber : "-") },
                    { title: "Vi phạm", dataIndex: "ruleName", ellipsis: true },
                    { title: "Điểm", dataIndex: "points", width: 60 },
                    { title: "Phạt", dataIndex: "fineAmount", width: 100, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
                    { title: "Bồi thường", dataIndex: "compensationAmount", width: 100, render: (n: number) => `${(n || 0).toLocaleString("vi-VN")}đ` },
                    {
                      title: "Ảnh",
                      key: "img",
                      width: 70,
                      render: (_: unknown, r: Violation) => (r.images?.length ? `${r.images.length} ảnh` : "-"),
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
                <Space style={{ marginBottom: 12 }}>
                  <Input style={{ width: 140 }} value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
                  <Select style={{ width: 100 }} value={semester} onChange={setSemester} options={[{ value: "HK1", label: "HK1" }, { value: "HK2", label: "HK2" }, { value: "HK3", label: "HK3" }]} />
                  <Button onClick={() => void loadSummary()}>Làm mới</Button>
                </Space>
                <Table
                  rowKey={(r) => String((r.user as User)?._id || "")}
                  dataSource={summary}
                  pagination={false}
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
    </div>
  );
};

export default ViolationsPage;
