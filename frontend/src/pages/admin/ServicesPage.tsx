import React, { useEffect, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from "antd";
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

const getUnitLabel = (s: Service) => {
  if (s.unit === "once") return "/ lần";
  if (s.type === "common") return "/ phòng / tháng";
  return "/ tháng";
};

const ServicesPage: React.FC = () => {
  const [data, setData] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await servicesApi.getAll();
      setData(res.data || []);
    } catch {
      message.error("Không tải được dịch vụ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (v: Record<string, unknown>) => {
    try {
      if (editing) await servicesApi.update(editing._id, v);
      else await servicesApi.create(v as never);
      message.success(editing ? "Đã cập nhật dịch vụ" : "Đã tạo dịch vụ");
      setOpen(false);
      setEditing(null);
      form.resetFields();
      await load();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lưu thất bại");
    }
  };

  return (
    <Card title="Quản lý dịch vụ" extra={<Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>Thêm dịch vụ</Button>}>
      <Table
        rowKey="_id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: "Tên dịch vụ", dataIndex: "name", key: "name" },
          { title: "Loại", dataIndex: "type", key: "type", render: (v: string) => (v === "common" ? "Dịch vụ chung" : "Dịch vụ cá nhân") },
          { title: "Giá", dataIndex: "price", key: "price", render: (v: number) => `${(v || 0).toLocaleString("vi-VN")}đ` },
          { title: "Đơn vị", key: "unit", render: (_: unknown, r: Service) => getUnitLabel(r) },
          { title: "Trạng thái", dataIndex: "isActive", key: "isActive", render: (v: boolean) => <Tag color={v ? "green" : "red"}>{v ? "Hoạt động" : "Ngừng"}</Tag> },
          {
            title: "Bật/tắt",
            key: "toggle",
            render: (_: unknown, r: Service) => (
              <Switch
                checked={r.isActive}
                onChange={async () => {
                  await servicesApi.toggle(r._id);
                  await load();
                }}
              />
            ),
          },
          {
            title: "Thao tác",
            key: "action",
            render: (_: unknown, r: Service) => (
              <Button size="small" onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }}>Sửa</Button>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? "Sửa dịch vụ" : "Thêm dịch vụ"}
        open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Tên dịch vụ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="Loại dịch vụ" rules={[{ required: true }]}><Select options={[{ value: "common", label: "Dịch vụ chung" }, { value: "personal", label: "Dịch vụ cá nhân" }]} /></Form.Item>
          <Form.Item name="price" label="Giá dịch vụ" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true }]}><Select options={[{ value: "monthly", label: "Theo tháng" }, { value: "once", label: "Theo lần" }]} /></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ServicesPage;
