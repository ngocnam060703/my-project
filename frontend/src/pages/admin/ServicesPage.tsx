import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  AppstoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { servicesApi } from "../../api";

const { Text, Paragraph } = Typography;

type Service = {
  _id: string;
  name: string;
  type: "common" | "personal";
  price: number;
  unit: "monthly" | "once";
  description?: string;
  isActive: boolean;
};

type FilterSeg = "all" | "common" | "personal";

const formatMoney = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;

const getUnitLabel = (s: Service) => {
  if (s.unit === "once") return "Theo lần";
  if (s.type === "common") return "Phòng / tháng";
  return "Cá nhân / tháng";
};

const ServicesPage: React.FC = () => {
  const [data, setData] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<FilterSeg>("all");
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await servicesApi.getAll();
      setData(res.data || []);
    } catch {
      message.error("Không tải được dịch vụ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = data;
    if (segment === "common") rows = rows.filter((s) => s.type === "common");
    if (segment === "personal") rows = rows.filter((s) => s.type === "personal");
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, segment, search]);

  const stats = useMemo(() => {
    const active = data.filter((s) => s.isActive).length;
    const common = data.filter((s) => s.type === "common").length;
    const personal = data.filter((s) => s.type === "personal").length;
    const estCommonMonth = data
      .filter((s) => s.isActive && s.type === "common" && !String(s.name).toLowerCase().includes("tiền phòng"))
      .reduce((a, s) => a + Number(s.price || 0), 0);
    return { active, common, personal, total: data.length, estCommonMonth };
  }, [data]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, unit: "monthly", type: "personal" });
    setDrawerOpen(true);
  };

  const openEdit = (r: Service) => {
    setEditing(r);
    form.setFieldsValue(r);
    setDrawerOpen(true);
  };

  const submit = async (v: Record<string, unknown>) => {
    try {
      if (editing) await servicesApi.update(editing._id, v);
      else await servicesApi.create(v as never);
      message.success(editing ? "Đã cập nhật dịch vụ" : "Đã thêm dịch vụ");
      setDrawerOpen(false);
      setEditing(null);
      form.resetFields();
      await load();
    } catch (e: unknown) {
      message.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lưu thất bại",
      );
    }
  };

  const onToggle = async (r: Service) => {
    setToggleId(r._id);
    try {
      await servicesApi.toggle(r._id);
      message.success(r.isActive ? "Đã tắt dịch vụ" : "Đã bật dịch vụ");
      await load();
    } catch {
      message.error("Không đổi được trạng thái");
    } finally {
      setToggleId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Dịch vụ KTX
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Cấu hình dịch vụ chung (chia trên hóa đơn phòng) và dịch vụ cá nhân (sinh viên đăng ký). Giá chung được tự động đưa vào hóa đơn tháng.
          </Paragraph>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
              <Statistic title="Tổng dịch vụ" value={stats.total} prefix={<AppstoreOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
              <Statistic
                title="Đang hoạt động"
                value={stats.active}
                valueStyle={{ color: "#059669" }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
              <Statistic title="Dịch vụ chung" value={stats.common} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
              <Statistic title="Dịch vụ cá nhân" value={stats.personal} prefix={<UserOutlined />} />
            </Card>
          </Col>
        </Row>

        <Card
          styles={{ body: { padding: "16px 20px" } }}
          extra={
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
                Làm mới
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Thêm dịch vụ
              </Button>
            </Space>
          }
        >
          <Space wrap style={{ marginBottom: 16 }} size="middle">
            <Input.Search
              allowClear
              placeholder="Tìm theo tên hoặc mô tả…"
              style={{ width: 280, maxWidth: "100%" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Segmented<FilterSeg>
              value={segment}
              onChange={setSegment}
              options={[
                { label: "Tất cả", value: "all" },
                { label: "Chung", value: "common" },
                { label: "Cá nhân", value: "personal" },
              ]}
            />
          </Space>

          <Table<Service>
            rowKey="_id"
            loading={loading}
            dataSource={filtered}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} dịch vụ` }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={search ? "Không khớp bộ lọc" : "Chưa có dịch vụ"}
                />
              ),
            }}
            scroll={{ x: 720 }}
            columns={[
              {
                title: "Dịch vụ",
                key: "name",
                ellipsis: true,
                render: (_: unknown, r: Service) => (
                  <Space direction="vertical" size={0}>
                    <Text strong>{r.name}</Text>
                    {r.description ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.description}
                      </Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: "Loại",
                dataIndex: "type",
                width: 130,
                render: (v: string) =>
                  v === "common" ? (
                    <Tag color="geekblue">Chung</Tag>
                  ) : (
                    <Tag color="purple">Cá nhân</Tag>
                  ),
              },
              {
                title: "Giá",
                dataIndex: "price",
                width: 140,
                render: (v: number) => <Text strong>{formatMoney(v)}</Text>,
              },
              {
                title: "Cách tính",
                key: "unit",
                width: 150,
                render: (_: unknown, r: Service) => <Tag>{getUnitLabel(r)}</Tag>,
              },
              {
                title: "Trạng thái",
                dataIndex: "isActive",
                width: 110,
                render: (v: boolean) => (
                  <Tag color={v ? "success" : "default"}>{v ? "Hoạt động" : "Ngừng"}</Tag>
                ),
              },
              {
                title: "Bật",
                key: "toggle",
                width: 72,
                align: "center",
                render: (_: unknown, r: Service) => (
                  <Tooltip title={r.isActive ? "Tạm ngừng cung cấp" : "Kích hoạt lại"}>
                    <Switch
                      size="small"
                      checked={r.isActive}
                      loading={toggleId === r._id}
                      onChange={() => void onToggle(r)}
                    />
                  </Tooltip>
                ),
              },
              {
                title: "",
                key: "action",
                width: 88,
                fixed: "right",
                render: (_: unknown, r: Service) => (
                  <Button type="link" size="small" onClick={() => openEdit(r)}>
                    Sửa
                  </Button>
                ),
              },
            ]}
          />

          {stats.estCommonMonth > 0 && segment !== "personal" ? (
            <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
              Gợi ý: tổng dịch vụ chung (trừ mục &quot;Tiền phòng&quot;) ~{" "}
              <Text strong>{formatMoney(stats.estCommonMonth)}</Text> / phòng / tháng — cộng vào hóa đơn và chia theo số người ở.
            </Text>
          ) : null}
        </Card>
      </Space>

      <Drawer
        title={editing ? "Sửa dịch vụ" : "Thêm dịch vụ mới"}
        width={420}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => form.submit()} type="primary">
              {editing ? "Lưu" : "Tạo"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Tên dịch vụ" rules={[{ required: true, message: "Bắt buộc" }]}>
            <Input placeholder="VD: WiFi, Gửi xe, Giặt ủi…" />
          </Form.Item>
          <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "common", label: "Dịch vụ chung — giá theo phòng, chia đều số slot (capacity)" },
                { value: "personal", label: "Dịch vụ cá nhân — sinh viên tự đăng ký" },
              ]}
            />
          </Form.Item>
          <Form.Item name="price" label="Giá (VNĐ)" rules={[{ required: true, message: "Bắt buộc" }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "monthly", label: "Theo tháng (bật/tắt mỗi kỳ)" },
                { value: "once", label: "Theo lượt (nhập số lần)" },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="Mô tả (tuỳ chọn)">
            <Input.TextArea rows={3} placeholder="Hiển thị cho admin và có thể dùng cho sinh viên hiểu rõ dịch vụ." />
          </Form.Item>
          <Form.Item name="isActive" label="Đang cung cấp" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

const Title = Typography.Title;

export default ServicesPage;
