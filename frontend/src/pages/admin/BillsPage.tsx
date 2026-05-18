import React, { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Select, InputNumber, message, Tag, Space, Card, Row, Col, Statistic, Input } from "antd";
import { PlusOutlined, CheckOutlined, DownloadOutlined, FilterOutlined, EyeOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { billsApi, client } from "../../api";
import type { Bill } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  unpaid: { color: "orange", text: "Chưa thanh toán" },
  pending: { color: "orange", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const formatMoney = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN") + "đ";

const paymentMethodLabel = (m?: string) => {
  if (m === "online") return "Thanh toán online";
  if (m === "counter") return "Thu tại quầy";
  if (m === "manual") return "Xác nhận / chuyển khoản";
  return "—";
};

type PersonalLine = NonNullable<Bill["personalServiceBreakdown"]>[number];

const formatPersonalServiceLine = (it: PersonalLine) => {
  const name = it.name || "Dịch vụ";
  const amt = formatMoney(it.amount || 0);
  const suffix = it.unit === "once" ? ` (${it.quantity ?? 0} lần)` : " (/ tháng)";
  return `${name}: ${amt}${suffix}`;
};

const BillsPage: React.FC = () => {
  const [data, setData] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [rooms, setRooms] = useState<{ _id: string; roomNumber: string; area?: { _id?: string; name?: string }; capacity?: number; price?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Bill | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ status?: string; room?: string; month?: number; year?: number; billType?: string }>({});
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [payModal, setPayModal] = useState<{ bill: Bill; method: "counter" | "manual"; reference: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.room) params.room = filters.room;
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      if (filters.billType === "monthly" || filters.billType === "penalty") params.billType = filters.billType;
      const [billsRes, roomsRes, contractsRes] = await Promise.all([
        client.get("/bills", { params }),
        client.get("/rooms", { params: { limit: 500 } }),
        client.get("/contracts", { params: { limit: 1000, status: "active" } }),
      ]);
      setData(billsRes.data.bills || []);
      setTotal(billsRes.data.total || 0);
      const allRooms = (roomsRes.data.rooms || []) as { _id: string; roomNumber: string; area?: { _id?: string; name?: string }; capacity?: number; price?: number }[];
      const contracts = (contractsRes.data.contracts || []) as { room?: string | { _id?: string } }[];
      const roomIdsWithActiveContracts = new Set(
        contracts
          .map((c) => {
            const r = c.room;
            if (!r) return "";
            return typeof r === "string" ? r : String(r._id || "");
          })
          .filter(Boolean),
      );
      setRooms(allRooms.filter((r) => roomIdsWithActiveContracts.has(String(r._id))));
    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filters.status, filters.room, filters.month, filters.year, filters.billType]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      const electricityFee = (v.electricityFee as number) ?? 0;
      const waterFee = (v.waterFee as number) ?? 0;
      const otherFee = (v.otherFee as number) ?? 0;
      const res = await billsApi.create({
        roomId: v.roomId as string,
        month: v.month as number,
        year: v.year as number,
        electricityFee,
        waterFee,
        otherFee,
        dueDate: v.dueDate ? new Date(v.dueDate as string).toISOString().split("T")[0] : undefined,
      });
      const created = (res.data as { created?: number })?.created;
      const skipped = (res.data as { skipped?: number })?.skipped;
      if (created != null || skipped != null) {
        message.success(`Tạo theo phòng xong: ${created || 0}, bỏ qua: ${skipped || 0}`);
      } else {
        message.success("Tạo hóa đơn thành công");
      }
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleMarkPaid = (r: Bill) => {
    setPayModal({ bill: r, method: "counter", reference: "" });
  };

  const unpaidTotal = data.filter((b) => b.status === "pending" || b.status === "unpaid" || b.status === "overdue").reduce((s, b) => s + (b.total || 0), 0);
  const unpaidCount = data.filter((b) => b.status === "pending" || b.status === "unpaid" || b.status === "overdue").length;

  const cols = [
    {
      title: "Tháng/Năm",
      key: "my",
      width: 90,
      render: (_: unknown, r: Bill) => <strong>{r.month}/{r.year}</strong>,
    },
    {
      title: "Loại",
      key: "billType",
      width: 100,
      render: (_: unknown, r: Bill) =>
        r.billType === "penalty" ? <Tag color="red">Phạt VP</Tag> : <Tag color="blue">Tháng</Tag>,
    },
    {
      title: "Sinh viên",
      dataIndex: ["user", "fullName"],
      key: "user",
      ellipsis: true,
    },
    {
      title: "Phòng",
      dataIndex: ["room", "roomNumber"],
      key: "room",
      width: 80,
    },
    {
      title: "Tiền phòng",
      dataIndex: "roomFee",
      key: "roomFee",
      width: 110,
      render: (v: number, r: Bill) => (r.billType === "penalty" ? "-" : <span style={{ color: "#0d9488" }}>{formatMoney(v)}</span>),
    },
    {
      title: "Điện",
      dataIndex: "electricityFee",
      key: "electricityFee",
      width: 90,
      render: (v: number, r: Bill) => (r.billType === "penalty" ? "-" : formatMoney(v)),
    },
    {
      title: "Nước",
      dataIndex: "waterFee",
      key: "waterFee",
      width: 90,
      render: (v: number, r: Bill) => (r.billType === "penalty" ? "-" : formatMoney(v)),
    },
    {
      title: "Dịch vụ cá nhân / Phạt",
      dataIndex: "personalServiceFee",
      key: "personalServiceFee",
      width: 260,
      render: (_: number, r: Bill) => {
        if (r.billType === "penalty") {
          const lines = r.penaltyBreakdown || [];
          if (!lines.length) return "-";
          return (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 13 }}>
              {lines.map((line, idx) => (
                <li key={idx}>{line.label}: {formatMoney(line.amount)}</li>
              ))}
            </ul>
          );
        }
        const items = r.personalServiceBreakdown || [];
        if (!items.length) return "-";
        return (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 13 }}>
            {items.map((it, idx) => (
              <li key={`${it.service || it.name || "svc"}-${idx}`}>{formatPersonalServiceLine(it)}</li>
            ))}
          </ul>
        );
      },
    },
    {
      title: "Tổng",
      dataIndex: "total",
      key: "total",
      width: 110,
      render: (v: number) => <strong style={{ color: "#134e4a" }}>{formatMoney(v)}</strong>,
    },
    {
      title: "Hạn TT",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 100,
      render: (d: string) => new Date(d).toLocaleDateString("vi-VN"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (s: string) => <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>{statusMap[s]?.text || s}</Tag>,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, r: Bill) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          {(r.status === "pending" || r.status === "unpaid" || r.status === "overdue") && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleMarkPaid(r)}>Đã TT</Button>
          )}
        </Space>
      ),
    },
  ];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý hóa đơn</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Tạo, xem và quản lý hóa đơn tiền phòng, điện nước</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng chưa thu</span>} value={unpaidTotal} formatter={(v) => formatMoney(Number(v))} valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Hóa đơn chưa thanh toán" value={unpaidCount} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng hóa đơn" value={total} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 150 }}
            value={filters.status}
            onChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}
          >
            <Select.Option value="unpaid">Chưa thanh toán (unpaid)</Select.Option>
            <Select.Option value="pending">Chưa thanh toán (legacy)</Select.Option>
            <Select.Option value="paid">Đã thanh toán</Select.Option>
            <Select.Option value="overdue">Quá hạn</Select.Option>
          </Select>
          <Select
            placeholder="Loại HĐ"
            allowClear
            style={{ width: 140 }}
            value={filters.billType}
            onChange={(v) => { setFilters((f) => ({ ...f, billType: v })); setPage(1); }}
          >
            <Select.Option value="monthly">Hóa đơn tháng</Select.Option>
            <Select.Option value="penalty">Hóa đơn phạt</Select.Option>
          </Select>
          <InputNumber placeholder="Tháng" min={1} max={12} style={{ width: 90 }} value={filters.month} onChange={(v) => { setFilters((f) => ({ ...f, month: v || undefined })); setPage(1); }} />
          <InputNumber placeholder="Năm" min={2020} style={{ width: 100 }} value={filters.year} onChange={(v) => { setFilters((f) => ({ ...f, year: v || undefined })); setPage(1); }} />
          <Input placeholder="Lọc phòng" style={{ width: 120 }} value={filters.room} onChange={(e) => { setFilters((f) => ({ ...f, room: e.target.value || undefined })); setPage(1); }} />
          <Button onClick={() => { setFilters({}); setPage(1); }}>Xóa bộ lọc</Button>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => exportToExcel(data.map((b) => ({
              "Loại": b.billType === "penalty" ? "Phạt VP" : "Tháng",
              "Tháng/Năm": `${b.month}/${b.year}`,
              "Sinh viên": (b.user as { fullName?: string })?.fullName,
              "Phòng": (b.room as { roomNumber?: string })?.roomNumber,
              "Tiền phòng": b.billType === "penalty" ? "" : b.roomFee,
              "Điện": b.billType === "penalty" ? "" : b.electricityFee,
              "Nước": b.billType === "penalty" ? "" : b.waterFee,
              "Dịch vụ cá nhân / Phạt": b.billType === "penalty"
                ? (b.penaltyBreakdown || []).map((x) => `${x.label || "Mục"}: ${x.amount ?? 0}`).join("; ")
                : (b.personalServiceBreakdown || []).map((x) => formatPersonalServiceLine(x)).join("; "),
              "Phí dịch vụ cá nhân": b.personalServiceFee || 0,
              "Tổng": b.total,
              "Hạn": new Date(b.dueDate).toLocaleDateString("vi-VN"),
              "Trạng thái": statusMap[b.status]?.text || b.status,
            })), "danh-sach-hoa-don", "Hóa đơn")}>Xuất Excel</Button>
            <InputNumber value={genMonth} min={1} max={12} onChange={(v) => setGenMonth(Number(v || 1))} placeholder="Tháng" style={{ width: 90 }} />
            <InputNumber value={genYear} min={2020} onChange={(v) => setGenYear(Number(v || new Date().getFullYear()))} placeholder="Năm" style={{ width: 100 }} />
            <Button onClick={async () => {
              try {
                const r = await billsApi.generate({ month: genMonth, year: genYear });
                message.success(`Tạo hóa đơn xong: ${r.data?.created || 0}, bỏ qua: ${r.data?.skipped || 0}`);
                load();
              } catch (err: unknown) {
                message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tạo được hóa đơn tháng");
              }
            }}>Tạo theo tháng</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Tạo hóa đơn</Button>
          </Space>
        </div>

        <Table
          columns={cols}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hóa đơn` }}
          scroll={{ x: 1220 }}
          size="middle"
        />
      </Card>

      <Modal title="Tạo hóa đơn" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={500}>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ month: currentMonth, year: currentYear }}>
          <Form.Item name="areaId" label="Khu (lọc phòng)">
            <Select allowClear placeholder="Chọn khu để lọc phòng">
              {Array.from(new Map(rooms.filter((r) => r.area?._id).map((r) => [String(r.area?._id), r.area])).values()).map((a) => (
                <Select.Option key={a?._id} value={a?._id}>
                  {a?.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const areaId = form.getFieldValue("areaId") as string | undefined;
              const filteredRooms = areaId ? rooms.filter((r) => String(r.area?._id || "") === String(areaId)) : rooms;
              return (
                <Form.Item name="roomId" label="Phòng" rules={[{ required: true, message: "Chọn phòng" }]}>
                  <Select
                    placeholder="Chọn phòng để tạo hóa đơn"
                    showSearch
                    optionFilterProp="children"
                    onChange={(rid) => {
                      const room = rooms.find((r) => r._id === rid);
                      form.setFieldsValue({ roomFeePreview: room?.price || 0 });
                    }}
                  >
                    {filteredRooms.map((r) => (
                      <Select.Option key={r._id} value={r._id}>
                        Phòng {r.roomNumber} {r.area?.name ? `- Khu ${r.area.name}` : ""} {r.capacity ? `(${r.capacity} người)` : ""}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="month" label="Tháng" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: "100%" }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="year" label="Năm" rules={[{ required: true }]}><InputNumber min={2020} style={{ width: "100%" }} /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="roomFeePreview" label="Tiền phòng (đ) — tự lấy theo loại phòng">
            <InputNumber min={0} style={{ width: "100%" }} disabled />
          </Form.Item>
          <Form.Item name="electricityFee" label="Tiền điện (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="waterFee" label="Tiền nước (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="otherFee" label="Phí khác (Wifi, gửi xe...)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="dueDate" label="Hạn thanh toán"><Input type="date" /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>Tạo hóa đơn</Button></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={payModal ? `Xác nhận thanh toán hóa đơn ${payModal.bill.month}/${payModal.bill.year}` : "Xác nhận thanh toán"}
        open={!!payModal}
        onCancel={() => setPayModal(null)}
        onOk={async () => {
          if (!payModal) return;
          try {
            await billsApi.markPaid(payModal.bill._id, {
              paymentMethod: payModal.method,
              paymentReference: payModal.reference.trim() || undefined,
            });
            message.success("Đã ghi nhận thanh toán");
            setPayModal(null);
            void load();
          } catch (err: unknown) {
            message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
          }
        }}
      >
        {payModal && (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <strong>Sinh viên:</strong> {(payModal.bill.user as { fullName?: string })?.fullName || "—"}
            </div>
            <div>
              <strong>Số tiền:</strong> {formatMoney(payModal.bill.total)}
            </div>
            <div>
              <strong>Phương thức thu:</strong>
              <Select
                style={{ width: "100%", marginTop: 6 }}
                value={payModal.method}
                onChange={(v) =>
                  setPayModal((prev) => (prev ? { ...prev, method: v as "counter" | "manual" } : null))
                }
              >
                <Select.Option value="counter">Thu tại quầy</Select.Option>
                <Select.Option value="manual">Chuyển khoản / xác nhận thủ công</Select.Option>
              </Select>
            </div>
            <div>
              <strong>Mã tham chiếu (không bắt buộc):</strong>
              <Input
                placeholder="Ví dụ: FT240518-001"
                style={{ marginTop: 6 }}
                value={payModal.reference}
                onChange={(e) =>
                  setPayModal((prev) => (prev ? { ...prev, reference: e.target.value } : null))
                }
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={`Chi tiết hóa đơn ${detailModal ? (detailModal.billType === "penalty" ? "phạt vi phạm" : `${detailModal.month}/${detailModal.year}`) : ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>,
          detailModal && (detailModal.status === "pending" || detailModal.status === "unpaid" || detailModal.status === "overdue") && (
            <Button key="pay" type="primary" icon={<CheckOutlined />} onClick={() => { handleMarkPaid(detailModal); setDetailModal(null); }}>Xác nhận đã thanh toán</Button>
          ),
        ].filter(Boolean) as React.ReactNode[]}
        width={420}
      >
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p><strong>Sinh viên:</strong> {(detailModal.user as { fullName?: string })?.fullName}</p>
            <p><strong>Phòng:</strong> {(detailModal.room as { roomNumber?: string })?.roomNumber} — {(detailModal.room as { area?: { name?: string } })?.area?.name || ""}</p>
            {detailModal.billType === "penalty" ? (
              <>
                <p><strong>Loại:</strong> <Tag color="red">Hóa đơn phạt vi phạm</Tag></p>
                {(detailModal.penaltyBreakdown?.length || 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Mục phạt / bồi thường:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {detailModal.penaltyBreakdown?.map((line, idx) => (
                        <li key={idx}>{line.label}: {formatMoney(line.amount)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <p><strong>Kỳ:</strong> Tháng {detailModal.month}/{detailModal.year}</p>
                <hr style={{ margin: "12px 0" }} />
                <p><strong>Số người trong phòng:</strong> {detailModal.occupants || 1}</p>
                <p><strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}</p>
                <p><strong>Tiền điện:</strong> {formatMoney(detailModal.electricityFee)}</p>
                <p><strong>Tiền nước:</strong> {formatMoney(detailModal.waterFee)}</p>
                {detailModal.sharedCommonFee ? <p><strong>Wifi:</strong> {formatMoney(detailModal.sharedCommonFee)}</p> : null}
                {detailModal.otherFee ? <p><strong>Phí khác:</strong> {formatMoney(detailModal.otherFee)}</p> : null}
                {detailModal.personalServiceFee ? <p><strong>Dịch vụ cá nhân:</strong> {formatMoney(detailModal.personalServiceFee)}</p> : null}
                {(detailModal.personalServiceBreakdown?.length || 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Chi tiết dịch vụ cá nhân:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {detailModal.personalServiceBreakdown?.map((it, idx) => (
                        <li key={`${it.service || it.name || "svc"}-${idx}`}>{formatPersonalServiceLine(it)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailModal.note ? <p style={{ color: "#6b7280" }}><strong>Cách tính:</strong> {detailModal.note}</p> : null}
              </>
            )}
            <p><strong>Tổng cộng:</strong> <span style={{ fontSize: 18, color: "#0d9488" }}>{formatMoney(detailModal.total)}</span></p>
            <hr style={{ margin: "12px 0" }} />
            <p><strong>Hạn thanh toán:</strong> {new Date(detailModal.dueDate).toLocaleDateString("vi-VN")}</p>
            {detailModal.paidAt && <p><strong>Ngày thanh toán:</strong> {new Date(detailModal.paidAt).toLocaleDateString("vi-VN")}</p>}
            {detailModal.status === "paid" && (
              <>
                <p><strong>Phương thức thanh toán:</strong> {paymentMethodLabel(detailModal.paymentMethod)}</p>
                {detailModal.paymentReference ? (
                  <p><strong>Mã tham chiếu:</strong> {detailModal.paymentReference}</p>
                ) : null}
              </>
            )}
            <p><strong>Trạng thái:</strong> <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag></p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BillsPage;
