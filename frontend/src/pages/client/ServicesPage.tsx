import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  InputNumber,
  Row,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloudOutlined,
  GiftOutlined,
  HistoryOutlined,
  PlusOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/vi";
import { servicesApi } from "../../api";

dayjs.locale("vi");

const { Title, Text, Paragraph } = Typography;

type Service = {
  _id: string;
  name: string;
  type: "common" | "personal";
  price: number;
  unit: "monthly" | "once";
  description?: string;
  isActive: boolean;
};

type Registration = {
  _id: string;
  service?: { _id?: string; name?: string; unit?: "monthly" | "once" };
  month?: number;
  year?: number;
  quantity: number;
  enabled: boolean;
  createdAt?: string;
};

const formatMoney = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;

const getUnitHint = (s: Service) => {
  if (s.unit === "once") return "Tính theo số lượt bạn khai báo";
  if (s.type === "common") return "Tự động vào hóa đơn phòng, chia theo số người ở";
  return "Bật cho tháng đã chọn — tính trên hóa đơn cá nhân";
};

const cardShell = (accent: string) => ({
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.06)",
  background: `linear-gradient(135deg, ${accent}08 0%, #fff 48%, #fafafa 100%)`,
  height: "100%",
});

const ServicesPage: React.FC = () => {
  const [period, setPeriod] = useState<Dayjs>(() => dayjs());
  const month = period.month() + 1;
  const year = period.year();

  const [services, setServices] = useState<Service[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [historyRegs, setHistoryRegs] = useState<Registration[]>([]);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [periodLocked, setPeriodLocked] = useState(false);
  const [lockBannerMessage, setLockBannerMessage] = useState<string | null>(null);

  const parseRegistrationsPayload = (data: unknown): Registration[] => {
    if (Array.isArray(data)) return data as Registration[];
    if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
      return (data as { items: Registration[] }).items;
    }
    return [];
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes, lockRes, hRes] = await Promise.all([
        servicesApi.getAll({ activeOnly: "true" }),
        servicesApi.getMyRegistrations({ month, year }),
        servicesApi.getPeriodLockStatus({ month, year }),
        servicesApi.getMyRegistrations(),
      ]);
      setServices(sRes.data || []);
      const regPayload = rRes.data;
      setRegs(parseRegistrationsPayload(regPayload));
      const lockFromRegs =
        regPayload &&
        typeof regPayload === "object" &&
        !Array.isArray(regPayload) &&
        (regPayload as { periodLock?: { serviceRegistrationLocked?: boolean; bannerMessage?: string } }).periodLock;
      const locked = lockRes.data?.serviceRegistrationLocked ?? lockFromRegs?.serviceRegistrationLocked ?? false;
      setPeriodLocked(locked);
      setLockBannerMessage(
        lockRes.data?.bannerMessage ||
          (lockFromRegs as { bannerMessage?: string } | undefined)?.bannerMessage ||
          (locked
            ? "Kỳ hóa đơn này đã được chốt sổ. Bạn không thể đăng ký hoặc thay đổi dịch vụ phát sinh. Vui lòng chọn kỳ hóa đơn của tháng tiếp theo nếu muốn đăng ký trước."
            : null),
      );
      setHistoryRegs(parseRegistrationsPayload(hRes.data));
    } catch {
      message.error("Không tải được dịch vụ");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const regByService = useMemo(() => {
    const m: Record<string, Registration> = {};
    regs.forEach((r) => {
      const sid = r.service?._id;
      if (sid) m[String(sid)] = r;
    });
    return m;
  }, [regs]);

  const common = useMemo(() => services.filter((s) => s.type === "common"), [services]);
  const personal = useMemo(() => services.filter((s) => s.type === "personal"), [services]);

  const registerPersonal = async (s: Service, quantity?: number, enabled?: boolean) => {
    if (periodLocked) {
      message.warning("Hóa đơn tháng này đã được chốt. Không thể thay đổi dịch vụ.");
      return;
    }
    setSaving(s._id);
    try {
      await servicesApi.upsertMyRegistration({
        serviceId: s._id,
        month,
        year,
        quantity: quantity ?? 1,
        enabled: enabled ?? true,
      });
      message.success("Đã cập nhật đăng ký");
      await load();
    } catch (e: unknown) {
      message.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Cập nhật thất bại",
      );
    } finally {
      setSaving(null);
    }
  };

  const historyColumns = [
    {
      title: "Dịch vụ",
      key: "service",
      render: (_: unknown, r: Registration) => r.service?.name || "—",
    },
    {
      title: "Kỳ",
      key: "period",
      width: 100,
      render: (_: unknown, r: Registration) => (
        <Text>
          T{r.month}/{r.year}
        </Text>
      ),
    },
    {
      title: "SL",
      dataIndex: "quantity",
      width: 72,
      render: (q: number) => q ?? 0,
    },
    {
      title: "Trạng thái",
      key: "enabled",
      width: 130,
      render: (_: unknown, r: Registration) =>
        r.service?.unit === "once" ? (
          <Tag color="blue">Theo lượt</Tag>
        ) : r.enabled ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đang bật
          </Tag>
        ) : (
          <Tag>Đã tắt</Tag>
        ),
    },
    {
      title: "Cập nhật",
      key: "createdAt",
      width: 120,
      render: (_: unknown, r: Registration) =>
        r.createdAt ? dayjs(r.createdAt).format("DD/MM/YYYY") : "—",
    },
  ];

  const serviceTab = (
    <Space orientation="vertical" size={20} style={{ width: "100%" }}>
      <Card
        style={{ borderRadius: 14, background: "linear-gradient(120deg, #f0f5ff 0%, #fff 55%)" }}
        styles={{ body: { padding: "20px 24px" } }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={14}>
            <Space align="start" size="middle">
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #1677ff, #4096ff)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 22,
                }}
              >
                <RocketOutlined />
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  Đăng ký & xem dịch vụ
                </Title>
                <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
                  Chọn <strong>kỳ hóa đơn</strong> (tháng/năm) để bật dịch vụ theo tháng hoặc khai báo lượt dùng. Dịch vụ chung được tính tự động trên hóa đơn phòng.
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={10} style={{ textAlign: "right" }}>
            <Space orientation="vertical" align="end" size={4} style={{ width: "100%" }}>
              <Text type="secondary">
                <CalendarOutlined /> Kỳ đang thao tác
              </Text>
              <DatePicker
                picker="month"
                value={period}
                onChange={(d) => d && setPeriod(d)}
                format="MM/YYYY"
                allowClear={false}
                style={{ width: "100%", maxWidth: 200 }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {periodLocked && lockBannerMessage ? (
        <Alert
          type="warning"
          showIcon
          message={lockBannerMessage}
          style={{
            marginBottom: 0,
            borderRadius: 12,
            background: "#fffbe6",
            border: "1px solid #ffe58f",
          }}
        />
      ) : null}

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          <div>
            <Space align="center" style={{ marginBottom: 12 }}>
              <CloudOutlined style={{ fontSize: 18, color: "#1677ff" }} />
              <Title level={5} style={{ margin: 0 }}>
                Dịch vụ chung
              </Title>
              <Badge count={common.length} style={{ backgroundColor: "#1677ff" }} />
            </Space>
            {common.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dịch vụ chung" />
            ) : (
              <Row gutter={[16, 16]}>
                {common.map((s) => (
                  <Col xs={24} sm={12} lg={8} key={s._id}>
                    <Card size="small" style={cardShell("#1677ff")} styles={{ body: { minHeight: 140 } }}>
                      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                        <Space wrap>
                          <Tag color="blue">Chung</Tag>
                          {String(s.name).toLowerCase().includes("tiền phòng") ? <Tag color="gold">Tiền phòng</Tag> : null}
                        </Space>
                        <Text strong style={{ fontSize: 16 }}>
                          {s.name}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          {getUnitHint(s)}
                        </Text>
                        <div>
                          <Text strong style={{ fontSize: 18, color: "#1677ff" }}>
                            {formatMoney(s.price)}
                          </Text>
                          <Text type="secondary"> / tháng</Text>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </div>

          <div>
            <Space align="center" style={{ marginBottom: 12 }}>
              <GiftOutlined style={{ fontSize: 18, color: "#722ed1" }} />
              <Title level={5} style={{ margin: 0 }}>
                Dịch vụ cá nhân
              </Title>
              <Badge count={personal.length} style={{ backgroundColor: "#722ed1" }} />
            </Space>
            {personal.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dịch vụ cá nhân" />
            ) : (
              <Row gutter={[16, 16]}>
                {personal.map((s) => {
                  const reg = regByService[s._id];
                  const busy = saving === s._id;
                  const frozen = periodLocked || busy;
                  if (s.unit === "once") {
                    const currentQty = Number(reg?.quantity || 0);
                    const val = qtyDraft[s._id] ?? currentQty;
                    return (
                      <Col xs={24} sm={12} lg={8} key={s._id}>
                        <Card size="small" style={cardShell("#722ed1")} styles={{ body: { minHeight: 200 } }}>
                          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                            <Tag color="purple">Theo lượt</Tag>
                            <Text strong style={{ fontSize: 16 }}>
                              {s.name}
                            </Text>
                            {s.description ? (
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                {s.description}
                              </Text>
                            ) : null}
                            <div>
                              <Text strong style={{ color: "#722ed1" }}>{formatMoney(s.price)}</Text>
                              <Text type="secondary"> / lần</Text>
                            </div>
                            <Space wrap style={{ marginTop: 4 }}>
                              <InputNumber
                                min={0}
                                value={val}
                                onChange={(v) => setQtyDraft((p) => ({ ...p, [s._id]: Number(v || 0) }))}
                                disabled={busy}
                              />
                              <Button type="primary" loading={busy} onClick={() => void registerPersonal(s, val, true)}>
                                Lưu số lượt
                              </Button>
                              <Button
                                icon={<PlusOutlined />}
                                loading={busy}
                                onClick={() => {
                                  const next = currentQty + 1;
                                  setQtyDraft((p) => ({ ...p, [s._id]: next }));
                                  void registerPersonal(s, next, true);
                                }}
                              >
                                +1 lượt
                              </Button>
                            </Space>
                          </Space>
                        </Card>
                      </Col>
                    );
                  }
                  const enabled = reg?.enabled ?? false;
                  return (
                    <Col xs={24} sm={12} lg={8} key={s._id}>
                      <Card size="small" style={cardShell("#52c41a")} styles={{ body: { minHeight: 180 } }}>
                        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                          <Tag color="green">Theo tháng</Tag>
                          <Text strong style={{ fontSize: 16 }}>
                            {s.name}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {getUnitHint(s)}
                          </Text>
                          <div>
                            <Text strong style={{ color: "#389e0d" }}>{formatMoney(s.price)}</Text>
                            <Text type="secondary"> / tháng</Text>
                          </div>
                          <Space style={{ marginTop: 8 }} align="center">
                            <Text type="secondary">Đăng ký tháng {month}/{year}</Text>
                            <Switch
                              checked={enabled}
                              loading={busy}
                              disabled={periodLocked}
                              checkedChildren="Bật"
                              unCheckedChildren="Tắt"
                              onChange={(checked) => void registerPersonal(s, 1, checked)}
                            />
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            )}
          </div>
        </>
      )}
    </Space>
  );

  const historyTab = (
    <Card style={{ borderRadius: 14 }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="_id"
        dataSource={historyRegs}
        columns={historyColumns}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} bản ghi` }}
        locale={{ emptyText: "Chưa có lịch sử đăng ký" }}
        loading={loading}
        scroll={{ x: 520 }}
      />
    </Card>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <Tabs
        defaultActiveKey="services"
        items={[
          {
            key: "services",
            label: (
              <span>
                <CloudOutlined /> Dịch vụ
              </span>
            ),
            children: serviceTab,
          },
          {
            key: "history",
            label: (
              <span>
                <HistoryOutlined /> Lịch sử đăng ký
              </span>
            ),
            children: historyTab,
          },
        ]}
      />
    </div>
  );
};

export default ServicesPage;
