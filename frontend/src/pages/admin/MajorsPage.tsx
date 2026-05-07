import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Input, Modal, Space, Switch, Table, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { majorsApi } from "../../api";

type MajorRow = {
  _id: string;
  name: string;
  faculty?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const MajorsPage: React.FC = () => {
  const [rows, setRows] = useState<MajorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MajorRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await majorsApi.getAll({ q: q.trim() || undefined });
      setRows((res.data?.items || []) as MajorRow[]);
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tải được danh sách ngành");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: "", faculty: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (r: MajorRow) => {
    setEditing(r);
    form.resetFields();
    form.setFieldsValue({ name: r.name, faculty: r.faculty || "", isActive: r.isActive !== false });
    setModalOpen(true);
  };

  const submit = async (v: { name: string; faculty?: string; isActive?: boolean }) => {
    setSaving(true);
    try {
      const payload = { name: String(v.name || "").trim(), faculty: String(v.faculty || "").trim() };
      if (!payload.name) {
        message.error("Vui lòng nhập tên ngành");
        return;
      }
      if (editing?._id) {
        await majorsApi.update(editing._id, { ...payload, isActive: v.isActive !== false });
        message.success("Đã cập nhật ngành");
      } else {
        await majorsApi.create(payload);
        message.success("Đã tạo ngành");
      }
      setModalOpen(false);
      setEditing(null);
      void load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không lưu được ngành");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: MajorRow) => {
    Modal.confirm({
      title: "Xóa ngành?",
      content: `Bạn có chắc muốn xóa ngành “${r.name}” không?`,
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await majorsApi.delete(r._id);
          message.success("Đã xóa ngành");
          void load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không xóa được ngành");
        }
      },
    });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => String(r.name || "").toLowerCase().includes(s) || String(r.faculty || "").toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý ngành</h2>
        <div style={{ color: "#6b7280" }}>Danh sách ngành dùng chung cho dropdown hồ sơ sinh viên.</div>
      </div>

      <Card style={{ borderRadius: 12, marginBottom: 12 }}>
        <Space wrap>
          <Input
            placeholder="Tìm ngành / khoa…"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 320, maxWidth: "100%" }}
          />
          <Button onClick={() => void load()} loading={loading}>
            Tải lại
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm ngành
          </Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }}>
        <Table
          rowKey="_id"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "Tên ngành", dataIndex: "name", key: "name", render: (v: string) => <strong>{v || "-"}</strong> },
            { title: "Khoa", dataIndex: "faculty", key: "faculty", render: (v: string) => v || "-" },
            {
              title: "Trạng thái",
              dataIndex: "isActive",
              key: "isActive",
              width: 120,
              render: (v: boolean) => (v === false ? <Tag color="default">Tắt</Tag> : <Tag color="green">Đang dùng</Tag>),
            },
            {
              title: "Thao tác",
              key: "action",
              width: 180,
              render: (_: unknown, r: MajorRow) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(r)}>
                    Sửa
                  </Button>
                  <Button size="small" danger onClick={() => void remove(r)}>
                    Xóa
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "Sửa ngành" : "Thêm ngành"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Tên ngành" rules={[{ required: true, message: "Nhập tên ngành" }]}>
            <Input placeholder="VD: Công nghệ thông tin" />
          </Form.Item>
          <Form.Item name="faculty" label="Khoa (tuỳ chọn)">
            <Input placeholder="VD: Khoa CNTT" />
          </Form.Item>
          <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>
              Lưu
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MajorsPage;

