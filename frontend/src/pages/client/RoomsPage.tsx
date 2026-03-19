import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Row, Col, Card, Select, InputNumber, Button, Tag, Spin, Empty, message, Space, Skeleton, Typography } from "antd";
import { roomsApi, areasApi } from "../../api";
import type { Area, Room } from "../../types";

const { Title } = Typography;

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
    setAreas(res.data);
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

  const statusColor: Record<string, string> = { available: "green", full: "red", maintenance: "orange" };
  const statusText: Record<string, string> = {
    available: "Còn trống",
    full: "Đã đầy",
    maintenance: "Bảo trì",
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <Title level={2} style={{ margin: 0 }}>Danh sách phòng</Title>
        <p style={{ marginTop: 6, color: "#6b7280" }}>
          Lọc theo khu, trạng thái, giá, sức chứa. Sắp xếp để tìm phòng phù hợp nhanh hơn.
        </p>
      </div>

      <Card style={{ marginBottom: 22, borderRadius: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Select
              placeholder="Chọn khu"
              allowClear
              style={{ width: "100%" }}
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
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            >
              <Select.Option value="available">Còn trống</Select.Option>
              <Select.Option value="full">Đã đầy</Select.Option>
              <Select.Option value="maintenance">Bảo trì</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Giá từ" style={{ width: "100%" }} min={0} onChange={(v) => setFilters((f) => ({ ...f, minPrice: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Giá đến" style={{ width: "100%" }} min={0} onChange={(v) => setFilters((f) => ({ ...f, maxPrice: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Sức chứa từ" style={{ width: "100%" }} min={1} onChange={(v) => setFilters((f) => ({ ...f, minCapacity: v || undefined }))} />
          </Col>
          <Col xs={12} sm={4}>
            <InputNumber placeholder="Sức chứa đến" style={{ width: "100%" }} min={1} onChange={(v) => setFilters((f) => ({ ...f, capacity: v || undefined }))} />
          </Col>
          <Col xs={24} sm={8}>
            <Space>
              <Select placeholder="Sắp xếp" style={{ width: 120 }} onChange={(v) => setFilters((f) => ({ ...f, sortBy: v }))}>
                <Select.Option value="price">Giá</Select.Option>
                <Select.Option value="capacity">Sức chứa</Select.Option>
                <Select.Option value="roomNumber">Số phòng</Select.Option>
              </Select>
              <Select placeholder="Thứ tự" style={{ width: 100 }} onChange={(v) => setFilters((f) => ({ ...f, sortOrder: v }))}>
                <Select.Option value="asc">Tăng dần</Select.Option>
                <Select.Option value="desc">Giảm dần</Select.Option>
              </Select>
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
          {rooms.map((r) => (
            <Col xs={24} sm={12} lg={8} key={r._id}>
              <Card
                hoverable
                style={{ borderRadius: 16 }}
                title={`Phòng ${r.roomNumber}`}
                extra={<Tag color={statusColor[r.status] || "default"}>{statusText[r.status] || r.status}</Tag>}
                actions={[
                  r.currentOccupancy < r.capacity && (
                    <Button type="link" onClick={() => navigate(`/rooms/${r._id}`)}>Xem chi tiết</Button>
                  ),
                ].filter(Boolean) as React.ReactNode[]}
              >
                <p style={{ marginBottom: 8, color: "#4b5563" }}>
                  Khu: <strong>{typeof r.area === "object" ? r.area?.name : (r.area as string)}</strong>
                </p>
                <p style={{ marginBottom: 8 }}>
                  <strong>Sức chứa:</strong> {r.currentOccupancy}/{r.capacity}
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
                      <Tag key={a} color="blue">{a}</Tag>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default RoomsPage;
