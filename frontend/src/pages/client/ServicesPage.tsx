import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, InputNumber, Space, Table, Tag, message } from "antd";
import { servicesApi } from "../../api";

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

const getUnitLabel = (s: Service) => {
  if (s.unit === "once") return "/ lần";
  if (s.type === "common") return "/ phòng / tháng";
  return "/ tháng";
};

const ServicesPage: React.FC = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const [services, setServices] = useState<Service[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [historyRegs, setHistoryRegs] = useState<Registration[]>([]);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});

  const load = async () => {
    try {
      const [sRes, rRes] = await Promise.all([
        servicesApi.getAll({ activeOnly: "true" }),
        servicesApi.getMyRegistrations({ month, year }),
      ]);
      setServices(sRes.data || []);
      setRegs(rRes.data || []);
      const hRes = await servicesApi.getMyRegistrations();
      setHistoryRegs(hRes.data || []);
    } catch {
      message.error("Không tải được dịch vụ");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const regByService = useMemo(() => {
    const m: Record<string, Registration> = {};
    regs.forEach((r) => {
      const sid = r.service?._id;
      if (sid) m[String(sid)] = r;
    });
    return m;
  }, [regs]);

  const common = services.filter((s) => s.type === "common");
  const personal = services.filter((s) => s.type === "personal");

  const registerPersonal = async (s: Service, quantity?: number, enabled?: boolean) => {
    try {
      await servicesApi.upsertMyRegistration({
        serviceId: s._id,
        month,
        year,
        quantity: quantity ?? 1,
        enabled: enabled ?? true,
      });
      message.success("Đã cập nhật đăng ký dịch vụ");
      await load();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Cập nhật thất bại");
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      <Card title="Dịch vụ chung">
        <Table
          rowKey="_id"
          dataSource={common}
          pagination={false}
          columns={[
            { title: "Tên dịch vụ", dataIndex: "name", key: "name" },
            { title: "Loại", key: "type", render: () => <Tag color="blue">Chung</Tag> },
            { title: "Giá", dataIndex: "price", key: "price", render: (v: number) => `${(v || 0).toLocaleString("vi-VN")}đ` },
            { title: "Đơn vị", key: "unit", render: (_: unknown, s: Service) => getUnitLabel(s) },
            { title: "Ghi chú", key: "note", render: (_: unknown, s: Service) => (s.name === "Tiền phòng" ? "Chia theo số người" : "Tự động tính vào hóa đơn") },
          ]}
        />
      </Card>

      <Card title="Dịch vụ cá nhân (đăng ký)">
        <Table
          rowKey="_id"
          dataSource={personal}
          pagination={false}
          columns={[
            { title: "Tên dịch vụ", dataIndex: "name", key: "name" },
            { title: "Giá", dataIndex: "price", key: "price", render: (v: number) => `${(v || 0).toLocaleString("vi-VN")}đ` },
            { title: "Đơn vị", key: "unit", render: (_: unknown, s: Service) => getUnitLabel(s) },
            {
              title: "Đăng ký",
              key: "register",
              render: (_: unknown, s: Service) => {
                const reg = regByService[s._id];
                if (s.unit === "once") {
                  const currentQty = Number(reg?.quantity || 0);
                  const val = qtyDraft[s._id] ?? currentQty;
                  return (
                    <Space>
                      <InputNumber min={0} value={val} onChange={(v) => setQtyDraft((p) => ({ ...p, [s._id]: Number(v || 0) }))} />
                      <Button type="primary" onClick={() => void registerPersonal(s, val, true)}>Lưu SL</Button>
                      <Button
                        onClick={() => {
                          const nextQty = currentQty + 1;
                          setQtyDraft((p) => ({ ...p, [s._id]: nextQty }));
                          void registerPersonal(s, nextQty, true);
                        }}
                      >
                        +1 lần
                      </Button>
                    </Space>
                  );
                }
                const enabled = reg?.enabled ?? false;
                return (
                  <Button type={enabled ? "default" : "primary"} onClick={() => void registerPersonal(s, 1, !enabled)}>
                    {enabled ? "Hủy đăng ký" : "Đăng ký"}
                  </Button>
                );
              },
            },
          ]}
        />
      </Card>

      <Card title="Lịch sử dịch vụ đã đăng ký">
        <Table
          rowKey="_id"
          dataSource={historyRegs}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: "Chưa có lịch sử đăng ký dịch vụ" }}
          columns={[
            { title: "Dịch vụ", key: "service", render: (_: unknown, r: Registration) => r.service?.name || "-" },
            {
              title: "Kỳ áp dụng",
              key: "period",
              width: 110,
              render: (_: unknown, r: Registration) => `${r.month || "-"}/${r.year || "-"}`,
            },
            { title: "Số lượng", dataIndex: "quantity", key: "quantity", width: 90, render: (q: number) => q ?? 0 },
            {
              title: "Trạng thái",
              key: "enabled",
              width: 120,
              render: (_: unknown, r: Registration) =>
                r.service?.unit === "once" ? <Tag color="blue">Theo lượt</Tag> : r.enabled ? <Tag color="green">Đang bật</Tag> : <Tag color="default">Đã tắt</Tag>,
            },
            {
              title: "Ngày đăng ký",
              key: "createdAt",
              width: 120,
              render: (_: unknown, r: Registration) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "-"),
            },
          ]}
        />
      </Card>
    </Space>
  );
};

export default ServicesPage;
