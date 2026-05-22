import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, DatePicker, message, Switch, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { registrationPeriodsApi } from "../../api";
import dayjs from "dayjs";

interface Period {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const isOpenNow = (p: Period, now = dayjs()) =>
  !!p.isActive && !now.isBefore(dayjs(p.startDate)) && !now.isAfter(dayjs(p.endDate));

const RegistrationPeriodsPage: React.FC = () => {
  const [data, setData] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await registrationPeriodsApi.getAll();
      setData(res.data || []);
    } catch {
      message.error("Không tải được");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const expiredButActive = data.find((p) => p.isActive && dayjs(nowMs).isAfter(dayjs(p.endDate)));

  useEffect(() => {
    if (!expiredButActive) return;
    void load();
  }, [expiredButActive?._id, nowMs]);

  const onFinish = async (v: { name: string; startDate: ReturnType<typeof dayjs>; endDate: ReturnType<typeof dayjs> }) => {
    try {
      await registrationPeriodsApi.create({
        name: v.name,
        startDate: v.startDate.toISOString(),
        endDate: v.endDate.toISOString(),
      });
      message.success("Đã tạo đợt đăng ký");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleToggleActive = async (record: Period, checked: boolean) => {
    setTogglingId(record._id);
    try {
      await registrationPeriodsApi.update(record._id, { isActive: checked });
      message.success(checked ? "Đã bật đợt đăng ký (các đợt khác tự tắt)" : "Đã tắt đợt đăng ký");
      await load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Quản lý đợt đăng ký nội trú</h2>
      <p style={{ marginBottom: 16, color: "#6b7280" }}>
        Dùng công tắc <strong>Mở đợt</strong> để bật/tắt. Chỉ một đợt được bật cùng lúc; sinh viên chỉ đăng ký khi đợt đang bật và trong khoảng thời gian đợt đó.
      </p>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ marginBottom: 16 }}>
        Thêm đợt đăng ký
      </Button>
      <Table
        loading={loading}
        dataSource={data}
        rowKey="_id"
        columns={[
          { title: "Tên", dataIndex: "name", key: "name" },
          { title: "Từ ngày", dataIndex: "startDate", key: "startDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
          { title: "Đến ngày", dataIndex: "endDate", key: "endDate", render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
          {
            title: "Mở đợt (bật/tắt)",
            key: "toggle",
            width: 200,
            render: (_: unknown, r: Period) => (
              <Space>
                <Switch
                  checked={isOpenNow(r, dayjs(nowMs))}
                  loading={togglingId === r._id}
                  checkedChildren="Bật"
                  unCheckedChildren="Tắt"
                  onChange={(checked) => handleToggleActive(r, checked)}
                />
                <span style={{ color: "#6b7280", fontSize: 12 }}>
                  {isOpenNow(r, dayjs(nowMs)) ? "Đang mở" : r.isActive ? "Đã hết hạn" : "Đã đóng"}
                </span>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="Thêm đợt đăng ký" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Tên đợt" rules={[{ required: true }]}>
            <Input placeholder="VD: Đợt 1 năm 2025" />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Tạo</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RegistrationPeriodsPage;
