import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Input, Modal, Space, Table, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { majorsApi } from "../../api";

type MajorRow = {
  _id: string;
  code?: string;
  name: string;
  faculty?: string;
  isActive?: boolean;
  residentsInDorm?: number;
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
  const pageSize = 20;
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await majorsApi.getAll({ q: q.trim() || undefined });
      setRows((res.data?.items || []) as MajorRow[]);
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Không tải được danh sách ngành"
      );
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
    form.setFieldsValue({ code: "", name: "", faculty: "" });
    setModalOpen(true);
  };

  const openEdit = (r: MajorRow) => {
    setEditing(r);
    form.resetFields();
    form.setFieldsValue({
      code: r.code || "",
      name: r.name,
      faculty: r.faculty || "",
    });
    setModalOpen(true);
  };

  const submit = async (v: { code: string; name: string; faculty?: string }) => {
    setSaving(true);
    try {
      const payload = {
        code: String(v.code || "").trim().toUpperCase(),
        name: String(v.name || "").trim(),
        faculty: String(v.faculty || "").trim(),
      };
      if (!payload.code) {
        message.error("Vui lòng nhập mã ngành");
        return;
      }
      if (!payload.name) {
        message.error("Vui lòng nhập tên ngành");
        return;
      }
      if (editing?._id) {
        await majorsApi.update(editing._id, payload);
        message.success("Đã cập nhật ngành");
      } else {
        await majorsApi.create(payload);
        message.success("Đã tạo ngành");
      }
      setModalOpen(false);
      setEditing(null);
      void load();
    } catch (err: unknown) {
      message.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Không lưu được ngành"
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: MajorRow) => {
    Modal.confirm({
      title: "Xóa ngành?",
      content: `Bạn có chắc muốn xóa ngành “${r.name}” (${r.code || "—"})?`,
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await majorsApi.delete(r._id);
          message.success("Đã xóa ngành");
          void load();
        } catch (err: unknown) {
          message.error(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              "Không xóa được ngành"
          );
        }
      },
    });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        String(r.name || "").toLowerCase().includes(s) ||
        String(r.code || "").toLowerCase().includes(s) ||
        String(r.faculty || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý ngành</h2>
        <div style={{ color: "#6b7280" }}>
          Ngành chỉ là tham chiếu cho hồ sơ sinh viên nội trú — thống kê số SV đang có hợp đồng KTX hiệu lực.
        </div>
      </div>

      <Card style={{ borderRadius: 12, marginBottom: 12 }}>
        <Space wrap>
          <Input
            placeholder="Tìm mã / tên ngành / khóa…"
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
          pagination={{ pageSize, current: page, onChange: setPage }}
          columns={[
            {
              title: "STT",
              key: "stt",
              width: 70,
              render: (_: unknown, __: MajorRow, idx: number) => (page - 1) * pageSize + idx + 1,
            },
            {
              title: "Mã ngành",
              dataIndex: "code",
              key: "code",
              width: 110,
              render: (v: string) => <strong style={{ fontFamily: "monospace" }}>{v?.trim() ? v : "—"}</strong>,
            },
            { title: "Khoa/nhóm ngành", dataIndex: "name", key: "name", render: (v: string) => v || "—" },
            { title: "Ngành", dataIndex: "faculty", key: "faculty", render: (v: string) => v || "—" },
            {
              title: "Số SV đang ở KTX",
              dataIndex: "residentsInDorm",
              key: "residentsInDorm",
              width: 160,
              align: "right" as const,
              render: (n: number | undefined) => (typeof n === "number" ? n : 0),
            },
            {
              title: "Thao tác",
              key: "action",
              width: 200,
              render: (_: unknown, r: MajorRow) => (
                <Space>
                  <Button size="small" type="primary" ghost onClick={() => openEdit(r)}>
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
          <Form.Item
            name="code"
            label="Mã ngành"
            rules={[{ required: true, message: "Nhập mã ngành (VD: CNTT, KT)" }]}
          >
            <Input placeholder="VD: CNTT" style={{ textTransform: "uppercase" }} />
          </Form.Item>
          <Form.Item name="name" label="Khoa/nhóm ngành" rules={[{ required: true, message: "Nhập khoa/nhóm ngành" }]}>
            <Input placeholder="VD: Công nghệ thông tin — phải khớp giá trị lưu ở hồ sơ SV" />
          </Form.Item>
          <Form.Item name="faculty" label="Ngành (tuỳ chọn)">
            <Input placeholder="VD: Hệ thống thông tin / An toàn thông tin..." />
          </Form.Item>
          <p style={{ margin: "0 0 16px 0", color: "#6b7280", fontSize: 13 }}>
            Tên ngành cần trùng với chuỗi &quot;Ngành&quot; trên user để thống kê &quot;Số SV đang ở KTX&quot; đúng.
          </p>
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
