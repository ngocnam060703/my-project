import React, { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Statistic, Table, Space, Button, Modal, Form, Input, Select, InputNumber, message, Tag, Tabs } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { facilitiesApi, facilityReportsApi, client } from "../../api";

type Facility = {
  _id: string;
  name: string;
  code: string;
  category?: string;
  status: "active" | "broken" | "repairing";
  quantityTotal: number;
};

type FacilityReport = {
  _id: string;
  facility?: { _id?: string; name?: string; code?: string };
  room?: { _id?: string; roomNumber?: string; area?: { name?: string } };
  reportedBy?: { fullName?: string; studentId?: string };
  description: string;
  status: "pending" | "approved" | "rejected" | "fixing" | "done";
  adminNote?: string;
  createdAt: string;
};

type FacilityLocation = {
  _id: string;
  quantity: number;
  floor?: number;
  facility?: { _id?: string; name?: string; code?: string; category?: string };
  area?: { _id?: string; name?: string };
  room?: { _id?: string; roomNumber?: string; floor?: number; area?: { name?: string } };
};
type LocationTableRow = {
  _id: string;
  roomKey: string;
  roomName: string;
  areaName: string;
  floorText: string;
  facilityCode: string;
  facilityName: string;
  quantity: number;
  rowSpan: number;
};

const facilityStatusColor: Record<string, string> = {
  active: "green",
  broken: "red",
  repairing: "gold",
};

const reportStatusColor: Record<string, string> = {
  pending: "gold",
  approved: "blue",
  rejected: "red",
  fixing: "processing",
  done: "green",
};
const reportStatusText: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  fixing: "Đang sửa",
  done: "Đã sửa xong",
};

const FacilitiesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reports, setReports] = useState<FacilityReport[]>([]);
  const [stats, setStats] = useState<{ total: number; active: number; broken: number; repairing: number }>({
    total: 0,
    active: 0,
    broken: 0,
    repairing: 0,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [locations, setLocations] = useState<FacilityLocation[]>([]);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [assignTarget, setAssignTarget] = useState<Facility | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FacilityReport | null>(null);
  const [rooms, setRooms] = useState<{ _id: string; roomNumber: string; area?: { _id?: string; name?: string }; floor?: number }[]>([]);
  const [areas, setAreas] = useState<{ _id: string; name: string }[]>([]);
  const [locationBusyId, setLocationBusyId] = useState<string | null>(null);
  const [locationTabAreaFilter, setLocationTabAreaFilter] = useState<string | undefined>(undefined);
  const [locationTabRoomFilter, setLocationTabRoomFilter] = useState<string | undefined>(undefined);
  const [fForm] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [rejectForm] = Form.useForm();

  const loadAll = async () => {
    setLoading(true);
    const [fRes, sRes, rRes, roomRes, areaRes, locRes] = await Promise.allSettled([
      facilitiesApi.getAll({ limit: 200 }),
      facilitiesApi.getStats(),
      facilityReportsApi.getAll({ limit: 200 }),
      client.get("/rooms"),
      client.get("/areas"),
      facilitiesApi.getLocations({ limit: 500 }),
    ]);

    const getError = (x: PromiseSettledResult<unknown>) =>
      (x.status === "rejected"
        ? (x.reason as { response?: { status?: number; data?: { message?: string } }; message?: string })
        : null);

    if (fRes.status === "fulfilled") {
      const d = (fRes.value as { data?: { facilities?: Facility[] } })?.data;
      setFacilities(d?.facilities || []);
    } else {
      setFacilities([]);
    }

    if (sRes.status === "fulfilled") {
      const d = (sRes.value as { data?: { total?: number; active?: number; broken?: number; repairing?: number } })?.data;
      setStats({
        total: Number(d?.total || 0),
        active: Number(d?.active || 0),
        broken: Number(d?.broken || 0),
        repairing: Number(d?.repairing || 0),
      });
    } else {
      setStats({ total: 0, active: 0, broken: 0, repairing: 0 });
    }

    if (rRes.status === "fulfilled") {
      const d = (rRes.value as { data?: { reports?: FacilityReport[] } })?.data;
      setReports(d?.reports || []);
    } else {
      setReports([]);
    }

    if (roomRes.status === "fulfilled") {
      const d = (roomRes.value as { data?: { rooms?: { _id: string; roomNumber: string; area?: { _id?: string; name?: string }; floor?: number }[] } })?.data;
      setRooms(d?.rooms || []);
    } else {
      setRooms([]);
    }

    if (areaRes.status === "fulfilled") {
      const raw = (areaRes.value as { data?: unknown })?.data;
      const arr = Array.isArray(raw) ? raw : ((raw as { areas?: { _id: string; name: string }[] } | undefined)?.areas || []);
      setAreas(arr);
    } else {
      setAreas([]);
    }

    if (locRes.status === "fulfilled") {
      const d = (locRes.value as { data?: { items?: FacilityLocation[] } })?.data;
      setLocations(d?.items || []);
    } else {
      setLocations([]);
    }

    const firstErr = [fRes, sRes, rRes].map(getError).find(Boolean);
    if (firstErr) {
      const st = firstErr?.response?.status;
      const apiMsg = firstErr?.response?.data?.message;
      const msg =
        apiMsg ||
        (st === 404
          ? "API CSVC chưa có trên backend (404). Hãy restart backend để nạp route mới."
          : st === 401
            ? "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại."
            : st === 403
              ? "Tài khoản không có quyền truy cập dữ liệu CSVC."
              : "Không tải được dữ liệu CSVC");
      message.error({ key: "fac-load-error", content: msg });
    }

    const locErr = getError(locRes);
    if (locErr?.response?.status === 404) {
      message.warning({
        key: "fac-locations-missing",
        content: "Endpoint CSVC theo phòng chưa có ở backend hiện tại. Hãy restart backend để nạp route mới.",
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const pendingCount = useMemo(() => reports.filter((r) => r.status === "pending").length, [reports]);
  const allocatedByFacility = useMemo(() => {
    const m: Record<string, number> = {};
    locations.forEach((loc) => {
      const fid = String(loc.facility?._id || "");
      if (!fid) return;
      m[fid] = (m[fid] || 0) + Number(loc.quantity || 0);
    });
    return m;
  }, [locations]);

  const filteredLocationsForRoomTab = useMemo(() => {
    return locations.filter((loc) => {
      const roomId = String(loc.room?._id || "");
      const areaFromLoc = String(loc.area?._id || "");
      const areaFromRoom =
        loc.room?.area && typeof loc.room.area === "object"
          ? String((loc.room.area as { _id?: string })._id || "")
          : "";
      if (locationTabRoomFilter && roomId !== locationTabRoomFilter) return false;
      if (locationTabAreaFilter) {
        const matchesArea =
          areaFromLoc === locationTabAreaFilter || areaFromRoom === locationTabAreaFilter;
        if (!matchesArea) return false;
      }
      return true;
    });
  }, [locations, locationTabAreaFilter, locationTabRoomFilter]);

  const roomOptionsForLocationTab = useMemo(() => {
    const list = locationTabAreaFilter
      ? rooms.filter((r) => String(r.area?._id || "") === locationTabAreaFilter)
      : rooms;
    return list.map((r) => ({
      value: r._id,
      label: `Phòng ${r.roomNumber}${r.area?.name ? ` - ${r.area.name}` : ""}`,
    }));
  }, [rooms, locationTabAreaFilter]);

  const locationRows = useMemo<LocationTableRow[]>(() => {
    const grouped = new Map<string, FacilityLocation[]>();
    filteredLocationsForRoomTab.forEach((loc) => {
      const roomId = String(loc.room?._id || "");
      const key = roomId || `__no-room-${loc._id}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(loc);
    });

    const rows: LocationTableRow[] = [];
    Array.from(grouped.entries()).forEach(([roomKey, list]) => {
      const sorted = [...list].sort((a, b) => {
        const ac = String(a.facility?.code || "");
        const bc = String(b.facility?.code || "");
        return ac.localeCompare(bc);
      });
      sorted.forEach((loc, idx) => {
        const roomNo = String(loc.room?.roomNumber || "-");
        const areaName = String(loc.area?.name || loc.room?.area?.name || "-");
        const floor = loc.floor ?? loc.room?.floor ?? "-";
        rows.push({
          _id: loc._id,
          roomKey,
          roomName: `Phòng ${roomNo}`,
          areaName: `Khu ${areaName}`,
          floorText: `Tầng ${floor}`,
          facilityCode: String(loc.facility?.code || "-"),
          facilityName: String(loc.facility?.name || "-"),
          quantity: Number(loc.quantity || 0),
          rowSpan: idx === 0 ? sorted.length : 0,
        });
      });
    });
    return rows;
  }, [filteredLocationsForRoomTab]);

  const submitCreate = async (v: Record<string, unknown>) => {
    try {
      await facilitiesApi.create({
        name: String(v.name || ""),
        code: String(v.code || ""),
        category: String(v.category || ""),
        status: String(v.status || "active"),
        quantityTotal: Number(v.quantityTotal || 0),
      });
      message.success("Đã tạo CSVC");
      setCreateOpen(false);
      fForm.resetFields();
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Tạo thất bại");
    }
  };

  const submitEdit = async (v: Record<string, unknown>) => {
    if (!editTarget) return;
    try {
      await facilitiesApi.update(editTarget._id, {
        name: v.name,
        code: v.code,
        category: v.category,
        status: v.status,
        quantityTotal: v.quantityTotal,
      });
      message.success("Đã cập nhật CSVC");
      setEditTarget(null);
      fForm.resetFields();
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Cập nhật thất bại");
    }
  };

  const submitAssign = async (v: Record<string, unknown>) => {
    if (!assignTarget) return;
    try {
      await facilitiesApi.assignLocation({
        facilityId: assignTarget._id,
        areaId: v.areaId ? String(v.areaId) : undefined,
        roomId: String(v.roomId),
        floor: Number(v.floor || 1),
        quantity: Number(v.quantity || 1),
      });
      message.success("Đã phân bổ CSVC");
      setAssignTarget(null);
      assignForm.resetFields();
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Phân bổ thất bại");
    }
  };

  const handleDelete = (f: Facility) => {
    Modal.confirm({
      title: `Xóa CSVC ${f.code}?`,
      content: "Xóa sẽ gỡ luôn các phân bổ và báo hỏng liên quan.",
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await facilitiesApi.delete(f._id);
          message.success("Đã xóa CSVC");
          await loadAll();
        } catch (e: unknown) {
          message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Xóa thất bại");
        }
      },
    });
  };

  const updateReport = async (id: string, action: "approve" | "done", adminNote?: string) => {
    try {
      if (action === "approve") await facilityReportsApi.approve(id, adminNote);
      else await facilityReportsApi.done(id, adminNote);
      message.success("Đã cập nhật báo hỏng");
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Cập nhật thất bại");
    }
  };

  const submitReject = async (v: { adminNote: string }) => {
    if (!rejectTarget) return;
    try {
      await facilityReportsApi.reject(rejectTarget._id, v.adminNote);
      message.success("Đã từ chối báo hỏng");
      setRejectTarget(null);
      rejectForm.resetFields();
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Từ chối thất bại");
    }
  };

  const updateLocationQuantity = async (id: string, nextQty: number) => {
    try {
      setLocationBusyId(id);
      await facilitiesApi.updateLocation(id, { quantity: nextQty });
      await loadAll();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Cập nhật số lượng thất bại");
    } finally {
      setLocationBusyId(null);
    }
  };

  const removeLocation = async (id: string) => {
    Modal.confirm({
      title: "Xóa phân bổ CSVC?",
      content: "Phân bổ này sẽ bị xóa khỏi phòng.",
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          setLocationBusyId(id);
          await facilitiesApi.deleteLocation(id);
          message.success("Đã xóa phân bổ");
          await loadAll();
        } catch (e: unknown) {
          message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Xóa phân bổ thất bại");
        } finally {
          setLocationBusyId(null);
        }
      },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}><ToolOutlined /> Quản lý CSVC</h2>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={6}><Card><Statistic title="Tổng CSVC" value={stats.total} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="Đang hoạt động" value={stats.active} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="Đã hỏng" value={stats.broken} /></Card></Col>
        <Col xs={24} sm={6}><Card><Statistic title="Báo hỏng chờ duyệt" value={pendingCount} /></Card></Col>
      </Row>

      <Tabs
        items={[
          {
            key: "facilities",
            label: "CSVC",
            children: (
              <Card
                title="Danh sách CSVC"
                extra={<Button type="primary" onClick={() => { fForm.resetFields(); setEditTarget(null); setCreateOpen(true); }}>Thêm CSVC</Button>}
              >
                <Table
                  rowKey="_id"
                  loading={loading}
                  dataSource={facilities}
                  columns={[
                    { title: "Mã", dataIndex: "code", key: "code", width: 120 },
                    { title: "Tên", dataIndex: "name", key: "name", width: 180 },
                    { title: "Loại", dataIndex: "category", key: "category", width: 140, render: (v: string) => v || "-" },
                    { title: "Trạng thái", dataIndex: "status", key: "status", width: 120, render: (v: string) => <Tag color={facilityStatusColor[v]}>{v}</Tag> },
                    { title: "Tổng SL", dataIndex: "quantityTotal", key: "quantityTotal", width: 100 },
                    {
                      title: "Đã phân bổ / Tổng",
                      key: "allocatedTotal",
                      width: 140,
                      render: (_: unknown, r: Facility) => {
                        const allocated = Number(allocatedByFacility[r._id] || 0);
                        const totalQty = Number(r.quantityTotal || 0);
                        return (
                          <span style={{ fontWeight: 500 }}>
                            {allocated} / {totalQty}
                          </span>
                        );
                      },
                    },
                    {
                      title: "Thao tác",
                      key: "action",
                      width: 280,
                      render: (_: unknown, r: Facility) => (
                        <Space wrap>
                          <Button size="small" onClick={() => {
                            setEditTarget(r);
                            fForm.setFieldsValue({ ...r });
                            setCreateOpen(true);
                          }}>Sửa</Button>
                          <Button size="small" onClick={() => {
                            setAssignTarget(r);
                            assignForm.setFieldsValue({ quantity: 1, floor: 1 });
                          }}>Phân bổ</Button>
                          <Button size="small" danger onClick={() => handleDelete(r)}>Xóa</Button>
                        </Space>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                />
              </Card>
            ),
          },
          {
            key: "reports",
            label: "Báo hỏng",
            children: (
              <Card title="Xử lý báo hỏng">
                <Table
                  rowKey="_id"
                  loading={loading}
                  dataSource={reports}
                  columns={[
                    { title: "SV", key: "sv", width: 160, render: (_: unknown, r: FacilityReport) => `${r.reportedBy?.fullName || "-"} ${r.reportedBy?.studentId ? `(${r.reportedBy.studentId})` : ""}` },
                    { title: "Phòng", key: "room", width: 120, render: (_: unknown, r: FacilityReport) => r.room?.roomNumber || "-" },
                    { title: "CSVC", key: "facility", width: 180, render: (_: unknown, r: FacilityReport) => `${r.facility?.name || "-"} ${r.facility?.code ? `(${r.facility.code})` : ""}` },
                    { title: "Mô tả", dataIndex: "description", key: "description", ellipsis: true },
                    {
                      title: "Trạng thái",
                      dataIndex: "status",
                      key: "status",
                      width: 120,
                      render: (v: string) => <Tag color={reportStatusColor[v]}>{reportStatusText[v] || v}</Tag>,
                    },
                    {
                      title: "Thao tác",
                      key: "action",
                      width: 260,
                      render: (_: unknown, r: FacilityReport) => (
                        <Space wrap>
                          {r.status === "pending" && <Button size="small" type="primary" onClick={() => void updateReport(r._id, "approve")}>Duyệt</Button>}
                          {r.status === "pending" && <Button size="small" danger onClick={() => { setRejectTarget(r); rejectForm.resetFields(); }}>Từ chối</Button>}
                          {r.status === "fixing" && <Button size="small" onClick={() => void updateReport(r._id, "done")}>Đã sửa</Button>}
                        </Space>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                />
              </Card>
            ),
          },
          {
            key: "locations",
            label: "Theo phòng",
            children: (
              <Card title="CSVC theo từng phòng">
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    allowClear
                    placeholder="Lọc theo khu"
                    style={{ width: 220 }}
                    value={locationTabAreaFilter}
                    onChange={(v) => {
                      setLocationTabAreaFilter(v);
                      setLocationTabRoomFilter(undefined);
                    }}
                    showSearch
                    optionFilterProp="label"
                    options={areas.map((a) => ({ value: a._id, label: a.name }))}
                  />
                  <Select
                    allowClear
                    placeholder="Lọc theo phòng"
                    style={{ width: 260 }}
                    value={locationTabRoomFilter}
                    onChange={(v) => setLocationTabRoomFilter(v)}
                    showSearch
                    optionFilterProp="label"
                    options={roomOptionsForLocationTab}
                  />
                  <Button
                    onClick={() => {
                      setLocationTabAreaFilter(undefined);
                      setLocationTabRoomFilter(undefined);
                    }}
                  >
                    Xóa lọc
                  </Button>
                </Space>
                <Table
                  rowKey="_id"
                  loading={loading}
                  dataSource={locationRows}
                  columns={[
                    {
                      title: "Phòng",
                      dataIndex: "roomName",
                      key: "room",
                      width: 230,
                      onCell: (record: LocationTableRow) => ({ rowSpan: record.rowSpan }),
                      render: (_: unknown, r: LocationTableRow) => (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontWeight: 600 }}>{r.roomName}</div>
                          <div style={{ color: "#64748b" }}>{r.areaName}</div>
                          <div style={{ color: "#64748b" }}>{r.floorText}</div>
                        </div>
                      ),
                    },
                    {
                      title: "Thiết bị",
                      key: "device",
                      render: (_: unknown, r: LocationTableRow) => (
                        <div style={{ fontWeight: 600 }}>
                          {r.facilityCode} - {r.facilityName}
                        </div>
                      ),
                    },
                    {
                      title: "Số lượng phân bổ",
                      dataIndex: "quantity",
                      key: "quantity",
                      width: 210,
                      render: (v: number, r: LocationTableRow) => (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
                          <Button
                            size="small"
                            disabled={v <= 1 || locationBusyId === r._id}
                            onClick={() => void updateLocationQuantity(r._id, Math.max(1, Number(v || 1) - 1))}
                          >
                            -
                          </Button>
                          <InputNumber value={v} min={0} readOnly controls={false} style={{ width: 80 }} />
                          <Button
                            size="small"
                            disabled={locationBusyId === r._id}
                            onClick={() => void updateLocationQuantity(r._id, Number(v || 0) + 1)}
                          >
                            +
                          </Button>
                        </div>
                      ),
                    },
                    {
                      title: "",
                      key: "delete",
                      width: 80,
                      render: (_: unknown, r: LocationTableRow) => (
                        <Button
                          size="small"
                          danger
                          type="text"
                          loading={locationBusyId === r._id}
                          onClick={() => void removeLocation(r._id)}
                        >
                          Xóa
                        </Button>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title={editTarget ? "Sửa CSVC" : "Thêm CSVC"}
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setEditTarget(null); fForm.resetFields(); }}
        onOk={() => fForm.submit()}
        okText={editTarget ? "Lưu" : "Tạo"}
        cancelText="Hủy"
      >
        <Form form={fForm} layout="vertical" onFinish={editTarget ? submitEdit : submitCreate}>
          <Form.Item name="code" label="Mã" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Tên" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="Loại"><Input /></Form.Item>
          <Form.Item name="status" label="Trạng thái" initialValue="active">
            <Select options={[{ value: "active", label: "active" }, { value: "broken", label: "broken" }, { value: "repairing", label: "repairing" }]} />
          </Form.Item>
          <Form.Item name="quantityTotal" label="Tổng số lượng" initialValue={1}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Phân bổ CSVC: ${assignTarget?.name || ""}`}
        open={!!assignTarget}
        onCancel={() => { setAssignTarget(null); assignForm.resetFields(); }}
        onOk={() => assignForm.submit()}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Form form={assignForm} layout="vertical" onFinish={submitAssign}>
          <Form.Item name="areaId" label="Khu">
            <Select allowClear options={areas.map((a) => ({ value: a._id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="roomId" label="Phòng" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={rooms.map((r) => ({
                value: r._id,
                label: `Phòng ${r.roomNumber}${r.area?.name ? ` - ${r.area.name}` : ""}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="floor" label="Tầng" initialValue={1}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="quantity" label="Số lượng" rules={[{ required: true }]} initialValue={1}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Từ chối báo hỏng"
        open={!!rejectTarget}
        onCancel={() => { setRejectTarget(null); rejectForm.resetFields(); }}
        onOk={() => rejectForm.submit()}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
      >
        <Form form={rejectForm} layout="vertical" onFinish={submitReject}>
          <Form.Item name="adminNote" label="Lý do từ chối" rules={[{ required: true, message: "Nhập lý do từ chối" }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FacilitiesPage;
