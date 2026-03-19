import React, { useEffect, useMemo, useState } from "react";
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, message, Tag, Space, Typography } from "antd";
import { PlusOutlined, ApartmentOutlined } from "@ant-design/icons";
import { roomsApi, areasApi } from "../../api";

const RoomsPage: React.FC = () => {
  const { Title } = Typography;
  const [data, setData] = useState<unknown[]>([]);
  const [areas, setAreas] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [query, setQuery] = useState<string>("");
  const [filters, setFilters] = useState<{
    area?: string;
    status?: "available" | "full" | "maintenance";
  }>({});

  const load = async () => {
    setLoading(true);
    const [roomsRes, areasRes] = await Promise.all([
      roomsApi.getAll({
        area: filters.area,
        status: filters.status,
      }),
      areasApi.getAll(),
    ]);
    setData(roomsRes.data.rooms);
    setAreas(areasRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filters.area, filters.status]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      const amenitiesInput = (v.amenities as string | undefined) || "";
      const amenities = amenitiesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await roomsApi.create({
        ...v,
        amenities,
      });
      message.success("Thêm thành công");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const visibleRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return (data as { roomNumber?: string }[]).filter((r) => (r.roomNumber || "").toLowerCase().includes(q));
  }, [data, query]);

  const columns = [
    { title: "Số phòng", dataIndex: "roomNumber", key: "roomNumber" },
    { title: "Khu", dataIndex: ["area", "name"], key: "area" },
    { title: "Tầng", dataIndex: "floor", key: "floor" },
    { title: "Sức chứa", dataIndex: "capacity", key: "capacity" },
    { title: "Đã ở", dataIndex: "currentOccupancy", key: "currentOccupancy" },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      render: (v: number) => v?.toLocaleString("vi-VN") + "đ/tháng",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (s: string) => {
        const statusColor: Record<string, string> = { available: "green", full: "red", maintenance: "orange" };
        const label: Record<string, string> = { available: "Còn trống", full: "Đã đầy", maintenance: "Bảo trì" };
        return <Tag color={statusColor[s] || "default"}>{label[s] || s}</Tag>;
      },
    },
    {
      title: "Tiện ích",
      dataIndex: "amenities",
      key: "amenities",
      render: (a?: string[]) =>
        a?.length ? (
          <Space wrap>
            {a.slice(0, 4).map((x) => (
              <Tag key={x} color="blue">
                {x}
              </Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: "#999" }}>-</span>
        ),
    },
  ];

  return (
    <div>
      <Card style={{ borderRadius: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              <ApartmentOutlined /> Quản lý phòng
            </Title>
            <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
              Lọc theo khu/trạng thái, xem tiện ích và giá theo thực tế.
            </p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Thêm phòng
          </Button>
        </div>

        <Card type="inner" style={{ borderRadius: 12, marginBottom: 16 }}>
          <Space wrap>
            <Select
              allowClear
              placeholder="Lọc khu"
              style={{ width: 220 }}
              onChange={(v) => setFilters((f) => ({ ...f, area: v }))}
              value={filters.area}
            >
              {(areas as { _id: string; name: string }[]).map((a) => (
                <Select.Option key={a._id} value={a._id}>
                  {a.name}
                </Select.Option>
              ))}
            </Select>

            <Select
              allowClear
              placeholder="Lọc trạng thái"
              style={{ width: 200 }}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              value={filters.status}
            >
              <Select.Option value="available">Còn trống</Select.Option>
              <Select.Option value="full">Đã đầy</Select.Option>
              <Select.Option value="maintenance">Bảo trì</Select.Option>
            </Select>

            <Input
              placeholder="Tìm theo số phòng (VD: 101)"
              style={{ width: 260 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <Button
              onClick={() => {
                setFilters({});
                setQuery("");
              }}
            >
              Xóa lọc
            </Button>
          </Space>
        </Card>

        <Table
          columns={columns}
          dataSource={visibleRooms}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />

        <Modal title="Thêm phòng" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
          <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ capacity: 4, floor: 1, status: "available", currentOccupancy: 0 }}>
            <Form.Item name="roomNumber" label="Số phòng" rules={[{ required: true }]}>
              <Input />
            </Form.Item>

            <Form.Item name="area" label="Khu" rules={[{ required: true }]}>
              <Select>
                {(areas as { _id: string; name: string }[]).map((a) => (
                  <Select.Option key={a._id} value={a._id}>
                    {a.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="capacity" label="Sức chứa" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="price" label="Giá (đ/tháng)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="floor" label="Tầng" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="status" label="Trạng thái">
              <Select>
                <Select.Option value="available">Còn trống</Select.Option>
                <Select.Option value="full">Đã đầy</Select.Option>
                <Select.Option value="maintenance">Bảo trì</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item name="currentOccupancy" label="Đã ở (số người)">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item name="description" label="Mô tả">
              <Input.TextArea rows={3} />
            </Form.Item>

            <Form.Item name="amenities" label="Tiện ích (ngăn cách bởi dấu , )">
              <Input placeholder="VD: Wi-Fi, Điều hòa, Bàn học" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                Thêm
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
};

export default RoomsPage;
