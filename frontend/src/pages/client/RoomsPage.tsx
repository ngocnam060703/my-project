import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Row, Col, Card, Select, InputNumber, Button, Tag, Spin, Empty, message, Space, Skeleton, Statistic } from "antd";
import { DeleteOutlined, ApartmentOutlined, FilterOutlined } from "@ant-design/icons";
import { roomsApi, areasApi } from "../../api";
import type { Area, Room } from "../../types";

const RoomsPage: React.FC = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{
    area?: string;
    status?: "available" | "full" | "maintenance";
    minPrice?: number;
    maxPrice?: number;
    minCapacity?: number;
    capacity?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }>({});

  const loadAreas = async () => {
    const res = await areasApi.getAll();
    setAreas(res.data?.areas ?? res.data ?? []);
  };

  const loadRooms = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (filters.area) params.area = filters.area;
      if (filters.status) params.status = filters.status;
      if (filters.minPrice) params.minPrice = filters.minPrice;
      if (filters.maxPrice) params.maxPrice = filters.maxPrice;
      if (filters.minCapacity) params.minCapacity = filters.minCapacity;
      if (filters.capacity) params.capacity = filters.capacity;
      if (filters.sortBy) params.sortBy = filters.sortBy;
      if (filters.sortOrder) params.sortOrder = filters.sortOrder;
      const res = await roomsApi.getAll(params);
      setRooms(res.data.rooms);
    } catch {
      message.error("Không tải được danh sách phòng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAreas(); }, []);
  useEffect(() => { loadRooms(); }, [filters]);

  const getRoomStatus = (r: Room) => {
    if (r.status === "maintenance") return { text: "Bảo trì", color: "orange" };
    if (r.currentOccupancy >= r.capacity) return { text: "Đã đầy", color: "red" };
    if (r.currentOccupancy >= r.capacity - 1 && r.capacity > 1) return { text: "Sắp đầy", color: "gold" };
    return { text: "Còn trống", color: "green" };
  };

  const clearFilters = () => setFilters({});

  const statsAvailable = rooms.filter((r) => r.status === "available").length;
  const statsFull = rooms.filter((r) => r.status === "full").length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><ApartmentOutlined /> Danh sách phòng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Lọc theo khu, trạng thái, giá, sức chứa.</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Còn trống</span>} value={statsAvailable} suffix="phòng" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Đã đầy" value={statsFull} suffix="phòng" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng phòng" value={rooms.length} suffix="phòng" />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 22, borderRadius: 12, borderColor: "rgba(13, 148, 136, 0.15)" }}>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <span style={{ color: "#6b7280", fontSize: 14 }}>Bộ lọc</span>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Select
              placeholder="Chọn khu"
              allowClear
              style={{ width: "100%" }}
              value={filters.area}
              onChange={(v) => setFilters((f) => ({ ...f, area: v }))}
            >
              {areas.map((a) => (
                <Select.Option key={a._id} value={a._id}>{a.name}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8}>
            <Select
              placeholder="Trạng thái"
              allowClear
              style={{ width: "100%" }}
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            >
              <Select.Option value="available">Còn trống</Select.Option>
              <Select.Option value="full">Đã đầy</Select.Option>
              <Select.Option value="maintenance">Bảo trì</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Giá từ" style={{ width: "100%" }} min={0} value={filters.minPrice} onChange={(v) => setFilters((f) => ({ ...f, minPrice: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Giá đến" style={{ width: "100%" }} min={0} value={filters.maxPrice} onChange={(v) => setFilters((f) => ({ ...f, maxPrice: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Sức chứa từ" style={{ width: "100%" }} min={1} value={filters.minCapacity} onChange={(v) => setFilters((f) => ({ ...f, minCapacity: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Sức chứa đến" style={{ width: "100%" }} min={1} value={filters.capacity} onChange={(v) => setFilters((f) => ({ ...f, capacity: v || undefined }))} />
          </Col>
          <Col xs={24} sm={8}>
            <Space>
              <Select placeholder="Sắp xếp" style={{ width: 120 }} value={filters.sortBy} onChange={(v) => setFilters((f) => ({ ...f, sortBy: v }))}>
                <Select.Option value="price">Giá</Select.Option>
                <Select.Option value="capacity">Sức chứa</Select.Option>
                <Select.Option value="roomNumber">Số phòng</Select.Option>
              </Select>
              <Select placeholder="Thứ tự" style={{ width: 100 }} value={filters.sortOrder} onChange={(v) => setFilters((f) => ({ ...f, sortOrder: v }))}>
                <Select.Option value="asc">Tăng dần</Select.Option>
                <Select.Option value="desc">Giảm dần</Select.Option>
              </Select>
              <Button icon={<DeleteOutlined />} onClick={clearFilters}>Xóa bộ lọc</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ marginTop: 18 }}>
          <Spin size="large" style={{ display: "block", margin: "20px auto" }} />
          <div style={{ marginTop: 16 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </div>
        </div>
      ) : rooms.length === 0 ? (
        <Empty description="Không có phòng nào" />
      ) : (
        <Row gutter={[16, 16]}>
          {rooms.map((r) => {
            const status = getRoomStatus(r);
            return (
              <Col xs={24} sm={12} lg={8} key={r._id}>
                <Card
                  hoverable
                  style={{ borderRadius: 12, borderColor: "rgba(13, 148, 136, 0.12)" }}
                  title={`Phòng ${r.roomNumber}`}
                  extra={<Tag color={status.color}>{status.text} {r.status !== "maintenance" && `(${r.currentOccupancy}/${r.capacity})`}</Tag>}
                  actions={[
                    <Button type="link" key="detail" onClick={() => navigate(`/student/rooms/${r._id}`)}>Xem chi tiết</Button>,
                    r.status !== "maintenance" && (
                      <Button
                        type="link"
                        key="register"
                        onClick={() => navigate(`/student/dorm-registration?roomId=${r._id}`)}
                      >
                        Đăng ký nội trú
                      </Button>
                    ),
                  ].filter(Boolean) as React.ReactNode[]}
                >
                  <p style={{ marginBottom: 8, color: "#4b5563" }}>
                    Khu: <strong>{typeof r.area === "object" ? r.area?.name : (r.area as string)}</strong>
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>Số chỗ còn lại:</strong> {r.capacity - r.currentOccupancy} / {r.capacity}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>Giá:</strong> {r.price?.toLocaleString("vi-VN")}đ/tháng
                  </p>
                  <p style={{ marginBottom: 10 }}>
                    <strong>Tầng:</strong> {r.floor}
                  </p>
                  {!!r.amenities?.length && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {r.amenities.slice(0, 5).map((a) => (
                        <Tag key={a} color="cyan">{a}</Tag>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

    </div>
  );
};

export default RoomsPage;
