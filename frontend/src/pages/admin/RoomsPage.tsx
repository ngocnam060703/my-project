import React, { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, message, Tag, Space, Row, Col, Statistic, List, Checkbox } from "antd";
import { PlusOutlined, ApartmentOutlined, EditOutlined, DeleteOutlined, FilterOutlined, EyeOutlined, DownloadOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { roomsApi, areasApi, facilitiesApi } from "../../api";
import type { Room } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  available: { color: "green", text: "Còn trống" },
  full: { color: "red", text: "Đã đầy" },
  maintenance: { color: "orange", text: "Bảo trì" },
};

const formatPrice = (v: number) => (v ?? 0).toLocaleString("vi-VN") + "đ";
const removeWifiFromAmenities = (arr: string[] = []) =>
  arr.map((s) => String(s || "").trim()).filter(Boolean).filter((s) => !/^wi-?fi$/i.test(s));
type FacilityLocation = {
  room?: string | { _id?: string };
  facility?: { _id?: string; name?: string };
  quantity?: number;
};
type ResidentRow = {
  contractId: string;
  status: string;
  contractNumber?: string;
  startDate?: string;
  endDate?: string;
  isRoomLeader?: boolean;
  user?: { _id?: string; fullName?: string; studentId?: string; email?: string; phone?: string; gender?: string };
};

const RoomsPage: React.FC = () => {
  const [data, setData] = useState<Room[]>([]);
  const [total, setTotal] = useState(0);
  const [areas, setAreas] = useState<{ _id: string; name: string }[]>([]);
  const [roomFacilities, setRoomFacilities] = useState<Record<string, { name: string; quantity: number }[]>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Room | null>(null);
  const [residentModal, setResidentModal] = useState<{
    open: boolean;
    roomId?: string;
    room?: { roomNumber?: string; area?: { name?: string }; capacity?: number; currentOccupancy?: number };
    residents: ResidentRow[];
    loading: boolean;
    settingLeaderUserId?: string;
  }>({ open: false, residents: [], loading: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [query, setQuery] = useState<string>("");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<{ available: number; full: number; maintenance: number }>({ available: 0, full: 0, maintenance: 0 });
  const [filters, setFilters] = useState<{
    area?: string;
    status?: string;
    minPrice?: number;
    maxPrice?: number;
    minCapacity?: number;
    capacity?: number;
  }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.area) params.area = filters.area;
      if (filters.status) params.status = filters.status;
      if (filters.minPrice != null) params.minPrice = filters.minPrice;
      if (filters.maxPrice != null) params.maxPrice = filters.maxPrice;
      if (filters.minCapacity != null) params.minCapacity = filters.minCapacity;
      if (filters.capacity != null) params.capacity = filters.capacity;
      if (query.trim()) params.roomNumber = query.trim();
      const [roomsRes, areasRes, locationsRes] = await Promise.all([
        roomsApi.getAll(params),
        areasApi.getAll(),
        facilitiesApi.getLocations({ limit: 2000 }),
      ]);
      setData(roomsRes.data.rooms || []);
      setTotal(roomsRes.data.total || 0);
      setStats(roomsRes.data.stats || { available: 0, full: 0, maintenance: 0 });
      setAreas(areasRes.data?.areas ?? areasRes.data ?? []);
      const grouped: Record<string, { name: string; quantity: number }[]> = {};
      const locations = (locationsRes.data?.items || []) as FacilityLocation[];
      locations.forEach((loc) => {
        const rid = typeof loc.room === "string" ? loc.room : String(loc.room?._id || "");
        const name = String(loc.facility?.name || "").trim();
        if (!rid || !name) return;
        if (!grouped[rid]) grouped[rid] = [];
        grouped[rid].push({ name, quantity: Number(loc.quantity || 0) });
      });
      setRoomFacilities(grouped);
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { load(); }, [page, filters.area, filters.status, filters.minPrice, filters.maxPrice, filters.minCapacity, filters.capacity, query]);

  const visibleRooms = data;

  const defaultRoomKit = (labels: string[]) => {
    const arr = labels.map((s) => s.toLowerCase());
    const kit: string[] = [];
    if (arr.some((x) => x.includes("giường") || x.includes("giuong"))) kit.push("bed");
    if (arr.some((x) => x.includes("tủ") || x.includes("tu"))) kit.push("cabinet");
    if (arr.some((x) => x.includes("quạt") || x.includes("quat"))) kit.push("fan");
    if (arr.some((x) => x.includes("điều hòa") || x.includes("dieu hoa") || x.includes("lạnh"))) kit.push("ac");
    return kit;
  };

  const kitToAmenities = (kit: string[]) => {
    const out: string[] = [];
    if (kit.includes("bed")) out.push("Giường");
    if (kit.includes("cabinet")) out.push("Tủ");
    if (kit.includes("fan")) out.push("Quạt");
    if (kit.includes("ac")) out.push("Điều hòa");
    return out;
  };

  const amenitiesExtras = (kit: string[], all: string[]) => {
    const kitAmenities = kitToAmenities(kit);
    const kitLowerList = kitAmenities.map((x) => x.toLowerCase());
    return all.filter((a) => {
      const t = String(a).trim().toLowerCase();
      if (!t) return false;
      return !kitLowerList.some((k) => t.includes(k) || (t.length > 2 && k.includes(t)));
    });
  };

  const handleSubmit = async (v: Record<string, unknown>) => {
    try {
      const kit = (v.roomKit as string[]) || [];
      const fromKit = kitToAmenities(kit);
      const amenitiesInput = (v.amenities as string | undefined) || "";
      const fromText = removeWifiFromAmenities(amenitiesInput.split(",").map((s) => s.trim()).filter(Boolean));
      const merged = removeWifiFromAmenities([...fromKit, ...fromText]);
      const amenities = Array.from(new Set(merged.map((x) => String(x).trim()).filter(Boolean)));
      const { roomKit: _rk, ...rest } = v;
      const payload = { ...rest, amenities };
      if (editingId) {
        await roomsApi.update(editingId, payload);
        message.success("Cập nhật thành công");
      } else {
        await roomsApi.create(payload);
        message.success("Thêm phòng thành công");
      }
      setModalOpen(false);
      setEditingId(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleEdit = (r: Room) => {
    setEditingId(r._id);
    const am = (r.amenities || []).map(String);
    const rk = defaultRoomKit(am);
    form.setFieldsValue({
      roomNumber: r.roomNumber,
      area: typeof r.area === "object" ? r.area?._id : r.area,
      roomKit: rk,
      amenities: amenitiesExtras(rk, am).join(", "),
      capacity: r.capacity,
      price: r.price,
      floor: r.floor ?? 1,
      status: r.status,
      currentOccupancy: r.currentOccupancy,
      description: r.description,
    });
    setModalOpen(true);
  };

  const handleDelete = (r: Room) => {
    Modal.confirm({
      title: "Xác nhận xóa phòng",
      content: `Xóa phòng ${r.roomNumber}? Không thể xóa phòng đang có người ở.`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await roomsApi.delete(r._id);
          message.success("Đã xóa");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const openResidents = async (r: Room) => {
    setResidentModal({ open: true, roomId: r._id, loading: true, residents: [], room: { roomNumber: r.roomNumber, area: typeof r.area === "object" ? r.area : undefined, capacity: r.capacity, currentOccupancy: r.currentOccupancy } });
    try {
      const res = await roomsApi.getResidents(r._id);
      setResidentModal({ open: true, roomId: r._id, loading: false, residents: res.data?.residents || [], room: res.data?.room || undefined });
    } catch {
      setResidentModal((prev) => ({ ...prev, loading: false }));
      message.error("Không tải được danh sách sinh viên trong phòng");
    }
  };

  const setRoomLeader = async (resident: ResidentRow) => {
    if (!residentModal.roomId || !resident.user?._id) return;
    try {
      setResidentModal((prev) => ({ ...prev, settingLeaderUserId: resident.user?._id }));
      await roomsApi.setRoomLeader(residentModal.roomId, resident.user._id);
      setResidentModal((prev) => ({
        ...prev,
        residents: prev.residents.map((r) => ({ ...r, isRoomLeader: r.user?._id === resident.user?._id })),
        settingLeaderUserId: undefined,
      }));
      message.success("Đã cập nhật trưởng phòng");
      load();
    } catch (err: unknown) {
      setResidentModal((prev) => ({ ...prev, settingLeaderUserId: undefined }));
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không cập nhật được trưởng phòng");
    }
  };

  const columns = [
    { title: "Số phòng", dataIndex: "roomNumber", key: "roomNumber", width: 100, render: (v: string) => <strong>{v || "-"}</strong> },
    { title: "Khu", dataIndex: ["area", "name"], key: "area", width: 100, render: (v: string, r: Room) => (typeof r.area === "object" ? r.area?.name : v) || "-" },
    { title: "Tầng", dataIndex: "floor", key: "floor", width: 70 },
    {
      title: "Sức chứa",
      key: "capacity",
      width: 100,
      render: (_: unknown, r: Room) => `${r.currentOccupancy ?? 0}/${r.capacity}`,
    },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (v: number) => <span style={{ color: "#0d9488" }}>{formatPrice(v)}/tháng</span>,
    },
    {
      title: "Giá/đầu người",
      key: "pricePerPerson",
      width: 120,
      render: (_: unknown, r: Room) => {
        const p = r.pricePerPerson ?? (r.capacity > 0 ? Math.round(r.price / r.capacity) : 0);
        return <span style={{ color: "#0369a1" }}>{formatPrice(p)}/người</span>;
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "CSVC phòng",
      key: "facilities",
      render: (_: unknown, r: Room) => {
        const items = roomFacilities[r._id] || [];
        return items.length ? (
          <Space wrap size="small">
            {items.slice(0, 4).map((x) => (
              <Tag key={`${r._id}-${x.name}`} color="cyan">{x.name}{x.quantity > 0 ? ` (${x.quantity})` : ""}</Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: "#999" }}>-</span>
        );
      },
    },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      fixed: "right" as const,
      render: (_: unknown, r: Room) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          <Button type="link" size="small" onClick={() => openResidents(r)}>Sinh viên</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>Sửa</Button>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(r)} disabled={(r.currentOccupancy ?? 0) > 0}>Xóa</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><ApartmentOutlined /> Quản lý phòng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Thêm, sửa phòng và xem thống kê theo khu, tầng</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Phòng còn trống</span>} value={stats.available} suffix="phòng" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Phòng đã đầy" value={stats.full} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Tổng phòng" value={total} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Bảo trì" value={stats.maintenance} suffix="phòng" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Select placeholder="Lọc khu" allowClear style={{ width: 160 }} value={filters.area} onChange={(v) => { setFilters((f) => ({ ...f, area: v })); setPage(1); }}>
            {areas.map((a) => <Select.Option key={a._id} value={a._id}>{a.name}</Select.Option>)}
          </Select>
          <Select placeholder="Trạng thái" allowClear style={{ width: 140 }} value={filters.status} onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}>
            <Select.Option value="available">Còn trống</Select.Option>
            <Select.Option value="full">Đã đầy</Select.Option>
            <Select.Option value="maintenance">Bảo trì</Select.Option>
          </Select>
          <InputNumber placeholder="Giá từ" min={0} style={{ width: 100 }} value={filters.minPrice} onChange={(v) => { setFilters((f) => ({ ...f, minPrice: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Giá đến" min={0} style={{ width: 100 }} value={filters.maxPrice} onChange={(v) => { setFilters((f) => ({ ...f, maxPrice: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Sức chứa từ" min={1} style={{ width: 110 }} value={filters.minCapacity} onChange={(v) => { setFilters((f) => ({ ...f, minCapacity: v ?? undefined })); setPage(1); }} />
          <InputNumber placeholder="Sức chứa đến" min={1} style={{ width: 110 }} value={filters.capacity} onChange={(v) => { setFilters((f) => ({ ...f, capacity: v ?? undefined })); setPage(1); }} />
          <Input placeholder="Tìm số phòng" style={{ width: 130 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={() => { setFilters({}); setQuery(""); setPage(1); }}>Xóa lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(visibleRooms.map((r) => ({
              "Số phòng": r.roomNumber,
              "Khu": typeof r.area === "object" ? r.area?.name : "-",
              "Tầng": r.floor,
              "Sức chứa": `${r.currentOccupancy}/${r.capacity}`,
              "Giá": r.price,
              "Trạng thái": statusMap[r.status]?.text || r.status,
              "CSVC phòng": (roomFacilities[r._id] || []).map((x) => `${x.name}${x.quantity > 0 ? ` (${x.quantity})` : ""}`).join(", "),
            })), "danh-sach-phong", "Phòng")}>Xuất Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); form.setFieldsValue({ capacity: 4, floor: 1, status: "available", currentOccupancy: 0, roomKit: ["bed", "cabinet", "fan"] }); setModalOpen(true); }}>Thêm phòng</Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={visibleRooms}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} phòng` }}
          scroll={{ x: 900 }}
          size="middle"
        />
      </Card>

      <Modal title={editingId ? "Sửa phòng" : "Thêm phòng"} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingId(null); }} footer={null} width={520}>
        <Form form={form} onFinish={handleSubmit} layout="vertical" initialValues={{ capacity: 4, floor: 1, status: "available", currentOccupancy: 0, roomKit: ["bed", "cabinet", "fan"] }}>
          <Form.Item name="roomNumber" label="Số phòng" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="area" label="Khu" rules={[{ required: true }]}>
            <Select>{areas.map((a) => <Select.Option key={a._id} value={a._id}>{a.name}</Select.Option>)}</Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="capacity" label="Sức chứa" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="floor" label="Tầng" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Form.Item name="price" label="Giá (đ/tháng)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="status" label="Trạng thái"><Select><Select.Option value="available">Còn trống</Select.Option><Select.Option value="full">Đã đầy</Select.Option><Select.Option value="maintenance">Bảo trì</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="currentOccupancy" label="Đã ở"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="roomKit" label="CSVC khi tạo phòng">
            <Checkbox.Group
              options={[
                { label: "Giường", value: "bed" },
                { label: "Tủ", value: "cabinet" },
                { label: "Quạt", value: "fan" },
                { label: "Điều hòa", value: "ac" },
              ]}
            />
          </Form.Item>
          <Form.Item name="amenities" label="Tiện ích thêm (ngăn cách bằng dấu phẩy)"><Input placeholder="VD: Bàn học, Wi-Fi" /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>{editingId ? "Cập nhật" : "Thêm phòng"}</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Chi tiết phòng ${detailModal?.roomNumber || ""}`} open={!!detailModal} onCancel={() => setDetailModal(null)} footer={[<Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>, detailModal && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailModal(null); handleEdit(detailModal); setModalOpen(true); }}>Sửa</Button>]}>
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Số phòng:</strong> {detailModal.roomNumber}</p>
            <p><strong>Khu:</strong> {typeof detailModal.area === "object" ? detailModal.area?.name : "-"}</p>
            <p><strong>Tầng:</strong> {detailModal.floor ?? "-"}</p>
            <p><strong>Sức chứa:</strong> {detailModal.currentOccupancy ?? 0}/{detailModal.capacity}</p>
            <p><strong>Giá:</strong> <span style={{ color: "#0d9488" }}>{formatPrice(detailModal.price)}/tháng</span></p>
            <p><strong>Giá/đầu người:</strong>{" "}
              <span style={{ color: "#0369a1" }}>
                {formatPrice(detailModal.pricePerPerson ?? (detailModal.capacity > 0 ? Math.round(detailModal.price / detailModal.capacity) : 0))}/người
              </span>
            </p>
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
            {detailModal.description && <p><strong>Mô tả:</strong> {detailModal.description}</p>}
            {(roomFacilities[detailModal._id] || []).length ? (
              <p>
                <strong>CSVC phòng:</strong>{" "}
                <Space wrap>
                  {(roomFacilities[detailModal._id] || []).map((x) => (
                    <Tag key={`${detailModal._id}-${x.name}`} color="cyan">
                      {x.name}{x.quantity > 0 ? ` (${x.quantity})` : ""}
                    </Tag>
                  ))}
                </Space>
              </p>
            ) : null}
            <Button style={{ marginTop: 8 }} onClick={() => openResidents(detailModal)}>
              Xem sinh viên trong phòng
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        title={`Sinh viên phòng ${residentModal.room?.roomNumber || ""}`}
        open={residentModal.open}
        onCancel={() => setResidentModal({ open: false, residents: [], loading: false, roomId: undefined, settingLeaderUserId: undefined })}
        footer={[<Button key="close" onClick={() => setResidentModal({ open: false, residents: [], loading: false, roomId: undefined, settingLeaderUserId: undefined })}>Đóng</Button>]}
      >
        <p style={{ marginBottom: 12 }}>
          <strong>Khu:</strong> {residentModal.room?.area?.name || "-"} |{" "}
          <strong>Sức chứa:</strong> {residentModal.room?.currentOccupancy ?? 0}/{residentModal.room?.capacity ?? 0}
        </p>
        <List
          loading={residentModal.loading}
          locale={{ emptyText: "Phòng này chưa có sinh viên ở" }}
          dataSource={residentModal.residents}
          renderItem={(it) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{it.user?.fullName || "-"}</span>
                    {it.isRoomLeader ? <Tag color="gold">Trưởng phòng</Tag> : null}
                    <Tag color={it.status === "active" ? "green" : "blue"}>{it.status === "active" ? "Đang ở" : "Chờ thanh toán"}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={6}>
                    <span>
                      MSSV: {it.user?.studentId || "-"} | SĐT: {it.user?.phone || "-"} | Email: {it.user?.email || "-"}
                    </span>
                    <div>
                      <Button
                        size="small"
                        type={it.isRoomLeader ? "default" : "primary"}
                        disabled={!!it.isRoomLeader}
                        loading={residentModal.settingLeaderUserId === it.user?._id}
                        onClick={() => setRoomLeader(it)}
                      >
                        {it.isRoomLeader ? "Đang là trưởng phòng" : "Chọn làm trưởng phòng"}
                      </Button>
                    </div>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
};

export default RoomsPage;
