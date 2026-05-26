import React, { useState, useEffect, useCallback } from "react";
import { Table, Button, Modal, Form, Select, InputNumber, message, Tag, Space, Card, Row, Col, Statistic, Input, Popover, Typography } from "antd";
import { CheckOutlined, EyeOutlined } from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { formatDateTimeVi } from "../../utils/formatDateTime";
import {
  billTypeLabel,
  billTypeShort,
  billTypeTagColor,
  billDetailTitle,
  isSpecialBill,
  isTransferSupplementBill,
} from "../../utils/billTypeLabels";
import { billPaymentMethodLabel, billPaymentPayerLabel } from "../../utils/billPaymentLabels";
import { roomSelectLabel } from "../../utils/roomDisplay";
import BillsFilterToolbar from "../../components/admin/BillsFilterToolbar";
import { billsApi, client, roomServicesApi, usersApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import type { Bill } from "../../types";
const statusMap: Record<string, { color: string; text: string }> = {
  unpaid: { color: "orange", text: "Chưa thanh toán" },
  pending: { color: "orange", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const formatMoney = (v: number | undefined) => (v ?? 0).toLocaleString("vi-VN") + "đ";

const billCodeDisplay = (b: Bill) => b.billCode || "—";
type PersonalLine = NonNullable<Bill["personalServiceBreakdown"]>[number];

const formatPersonalServiceLine = (it: PersonalLine) => {
  const name = it.name || "Dịch vụ";
  const amt = formatMoney(it.amount || 0);
  const suffix = it.unit === "once" ? ` (${it.quantity ?? 0} lần)` : " (/ tháng)";
  return `${name}: ${amt}${suffix}`;
};

const isWifiServiceName = (name?: string) => {
  const n = String(name || "").toLowerCase();
  return n.includes("wifi") || n.includes("wi-fi") || n.includes("wi fi");
};

async function roomHasWifiServiceAssigned(roomId: string): Promise<boolean> {
  const rsRes = await roomServicesApi.list({ room: roomId, limit: 100 });
  const items =
    (rsRes.data as { items?: Array<{ service?: { name?: string; type?: string; isActive?: boolean } }> })?.items || [];
  return items.some((row) => {
    const svc = row.service;
    if (!svc || typeof svc !== "object") return false;
    if (svc.type !== "common" || svc.isActive === false) return false;
    return isWifiServiceName(svc.name);
  });
}

const BillsPage: React.FC = () => {
  const { socket } = useSocket();
  const now = new Date();  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [data, setData] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ unpaidTotal: 0, paidTotal: 0, unpaidCount: 0, paidTotalAllTime: 0 });
  const [rooms, setRooms] = useState<
    { _id: string; roomNumber: string; capacity?: number; currentOccupancy?: number; status?: string; price?: number; pricePerPerson?: number }[]
  >([]);  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Bill | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<{ status?: string; room?: string; month?: number; year?: number; billType?: string }>({
    month: currentMonth,
    year: currentYear,
  });
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterStudentId, setCounterStudentId] = useState<string | null>(null);
  const [counterBillId, setCounterBillId] = useState<string | null>(null);
  const [counterBills, setCounterBills] = useState<Bill[]>([]);
  const [counterLoading, setCounterLoading] = useState(false);
  const [studentOptions, setStudentOptions] = useState<{ value: string; label: string }[]>([]);
  const [studentSearchLoading, setStudentSearchLoading] = useState(false);

  const [counterCodeInput, setCounterCodeInput] = useState("");
  const [counterCodeLoading, setCounterCodeLoading] = useState(false);
  const [roomFeeLines, setRoomFeeLines] = useState<
    Array<{ contractNumber?: string; studentName?: string; studentId?: string; roomFee: number }>
  >([]);
  const [roomFeePreviewLoading, setRoomFeePreviewLoading] = useState(false);
  const [roomWifiAssigned, setRoomWifiAssigned] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.room) params.room = filters.room;
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      const billTypes = ["monthly", "penalty", "damage_reimbursement", "transfer_supplement"] as const;
      if (filters.billType && billTypes.includes(filters.billType as (typeof billTypes)[number])) {
        params.billType = filters.billType;
      }
      if (debouncedSearch) params.search = debouncedSearch;
      const [billsRes, roomsRes] = await Promise.all([
        client.get("/bills", { params }),
        client.get("/rooms", { params: { limit: 500 } }),
      ]);
      setData(billsRes.data.bills || []);
      setTotal(billsRes.data.total || 0);
      setSummary(billsRes.data.summary || { unpaidTotal: 0, paidTotal: 0, unpaidCount: 0, paidTotalAllTime: 0 });
      setRooms((roomsRes.data.rooms || []) as typeof rooms);    } catch {
      message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [page, filters.status, filters.room, filters.month, filters.year, filters.billType, debouncedSearch]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onBillPaid = () => void load();
    socket.on("bill:paid", onBillPaid);
    return () => {
      socket.off("bill:paid", onBillPaid);
    };
  }, [socket, load]);
  const fetchRoomCosts = useCallback(async (roomId: string, month: number, year: number) => {
    try {
      const hasWifi = await roomHasWifiServiceAssigned(roomId);
      setRoomWifiAssigned(hasWifi);
      const feesRes = await billsApi.getRoomUtilityFees({ roomId, month, year });
      const fees = feesRes.data;
      form.setFieldsValue({
        electricityFee: fees?.hasElectricityReading ? fees.electricityFee ?? 0 : 0,
        waterFee: fees?.hasWaterReading ? fees.waterFee ?? 0 : 0,
        sharedCommonFee: hasWifi ? fees?.wifiMonthlyFee ?? 0 : 0,
      });
    } catch (err) {
      console.error("Không lấy được chi phí phòng:", err);
      setRoomWifiAssigned(false);
      form.setFieldsValue({
        electricityFee: 0,
        waterFee: 0,
        sharedCommonFee: 0,
      });
    }
  }, [form]);

  const applyRoomPriceDisplay = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r._id === roomId);
      form.setFieldsValue({ roomPricePreview: Math.round(Number(room?.price || 0)) });
    },
    [rooms, form],
  );

  const fetchRoomContractFees = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        setRoomFeeLines([]);
        form.setFieldsValue({ roomFeePreview: undefined });
        return;
      }
      setRoomFeePreviewLoading(true);
      try {
        const res = await billsApi.getRoomBillingPreview(roomId);
        const lines = res.data?.lines || [];
        setRoomFeeLines(lines);
        const roomPrice =
          res.data?.roomPrice != null
            ? Math.round(Number(res.data.roomPrice))
            : Math.round(Number(rooms.find((r) => r._id === roomId)?.price || 0));
        form.setFieldsValue({
          roomPricePreview: roomPrice,
          roomFeePreview: lines.length === 1 ? lines[0].roomFee : undefined,
        });
      } catch {
        setRoomFeeLines([]);
        form.setFieldsValue({ roomFeePreview: undefined });
      } finally {
        setRoomFeePreviewLoading(false);
      }
    },
    [form, applyRoomPriceDisplay],
  );

  useEffect(() => {
    if (modalOpen) {
      const values = form.getFieldsValue();
      if (typeof values.roomId === "string" && typeof values.month === "number" && typeof values.year === "number") {
        fetchRoomCosts(values.roomId, values.month, values.year);
        applyRoomPriceDisplay(values.roomId);
        void fetchRoomContractFees(values.roomId);
      }
    }
  }, [modalOpen, form, fetchRoomCosts, fetchRoomContractFees, applyRoomPriceDisplay]);

  const handleCreate = async (v: Record<string, unknown>) => {
    try {
      const electricityFee = (v.electricityFee as number) ?? 0;
      const waterFee = (v.waterFee as number) ?? 0;
      const sharedCommonFee = roomWifiAssigned ? ((v.sharedCommonFee as number) ?? 0) : 0;
      const otherFee = (v.otherFee as number) ?? 0;
      const roomId = v.roomId as string;
      const res = await billsApi.create({
        roomId,
        month: v.month as number,
        year: v.year as number,
        electricityFee,
        waterFee,
        sharedCommonFee,
        otherFee,
        dueDate: v.dueDate ? new Date(v.dueDate as string).toISOString().split("T")[0] : undefined,
      });
      const created = (res.data as { created?: number })?.created;
      const skipped = (res.data as { skipped?: number })?.skipped;
      const updated = (res.data as { updated?: number })?.updated;
      if (created != null || updated != null || skipped != null) {
        message.success(
          `Hóa đơn tháng: tạo ${created || 0}, cập nhật ${updated || 0}, bỏ qua ${skipped || 0}. Các loại khác (phạt, bồi thường…) không bị gộp.`,
        );
      } else {
        message.success("Tạo hóa đơn thành công");
      }
      setModalOpen(false);
      form.resetFields();
      setRoomFeeLines([]);
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const handleMarkPaid = (r: Bill) => {
    const code = billCodeDisplay(r);
    Modal.confirm({
      title: "Xác nhận thanh toán tại quầy",
      width: 480,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            Xác nhận sinh viên <strong>{(r.user as { fullName?: string })?.fullName || "—"}</strong> đã thanh toán{" "}
            <strong>{formatMoney(r.total)}</strong>
            {isSpecialBill(r.billType)
              ? ` (${billTypeLabel(r.billType).toLowerCase()})`
              : ` (hóa đơn ${r.month}/${r.year})`}.
          </div>
          <div style={{ fontSize: 13, color: "#374151" }}>
            <div><strong>Mã hóa đơn:</strong> {code}</div>
            <div><strong>Phương thức:</strong> Sinh viên đã thanh toán tại quầy</div>
          </div>
        </div>
      ),      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await billsApi.markPaid(r._id, { paymentMethod: "counter", paymentReference: code !== "—" ? code : undefined });
          message.success("Đã ghi nhận thanh toán tại quầy");
          load();
        } catch (err: unknown) {
          message.error(
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              "Không xác nhận được thanh toán",
          );
        }
      },
    });
  };

  const searchStudents = async (q: string) => {
    if (!q.trim()) {
      setStudentOptions([]);
      return;
    }
    setStudentSearchLoading(true);
    try {
      const res = await usersApi.getAll({ role: "user", search: q.trim(), limit: 20 });
      const list = (res.data as { users?: { _id: string; fullName?: string; studentId?: string }[] })?.users || [];
      setStudentOptions(
        list.map((u) => ({
          value: u._id,
          label: `${u.fullName || "—"}${u.studentId ? ` (${u.studentId})` : ""}`,
        })),
      );
    } catch {
      setStudentOptions([]);
    } finally {
      setStudentSearchLoading(false);
    }
  };

  const loadCounterBills = async (studentId: string) => {
    setCounterLoading(true);
    setCounterBillId(null);
    try {
      const res = await billsApi.getAll({ user: studentId, limit: 50 });
      const list = ((res.data as { bills?: Bill[] })?.bills || []).filter(
        (b) => b.status === "pending" || b.status === "unpaid" || b.status === "overdue",
      );
      setCounterBills(list);
    } catch {
      message.error("Không tải được hóa đơn của sinh viên");
      setCounterBills([]);
    } finally {
      setCounterLoading(false);
    }
  };

  const submitCounterPay = async () => {
    const bill = counterBills.find((b) => b._id === counterBillId);
    if (!bill) {
      message.warning("Chọn hóa đơn cần xác nhận");
      return;
    }
    const code = billCodeDisplay(bill);
    try {
      await billsApi.markPaid(bill._id, { paymentMethod: "counter", paymentReference: code !== "—" ? code : undefined });      message.success(`Đã xác nhận thanh toán hóa đơn ${code}`);
      setCounterOpen(false);
      setCounterStudentId(null);
      setCounterBillId(null);
      setCounterBills([]);
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const lookupBillByCode = async () => {
    const code = counterCodeInput.trim();
    if (!code) {
      message.warning("Nhập mã hóa đơn");
      return;
    }
    setCounterCodeLoading(true);
    setCounterBillId(null);
    setCounterBills([]);
    setCounterStudentId(null);
    try {
      const res = await billsApi.getAll({ search: code, limit: 20 });
      const list = ((res.data as { bills?: Bill[] })?.bills || []).filter(
        (b) => b.status === "pending" || b.status === "unpaid" || b.status === "overdue",
      );
      if (!list.length) {
        message.warning("Không tìm thấy hóa đơn chưa thanh toán với mã này");
        return;
      }
      const exact = list.find((b) => (b.billCode || "").toUpperCase() === code.toUpperCase()) || list[0];
      setCounterBills(list);
      setCounterBillId(exact._id);
      const uid = (exact.user as { _id?: string })?._id;
      if (uid) setCounterStudentId(String(uid));
      if (list.length > 1) {
        message.info(`Tìm thấy ${list.length} hóa đơn — đã chọn mã khớp nhất`);
      }
    } catch {
      message.error("Không tra cứu được mã hóa đơn");
    } finally {
      setCounterCodeLoading(false);
    }
  };

  const billToExcelRow = (b: Bill) => ({
    "Mã HĐ": b.billCode || "",
    "Loại": billTypeShort(b.billType),
    "Tháng/Năm": `${b.month}/${b.year}`,
    "Sinh viên": (b.user as { fullName?: string })?.fullName,
    "MSSV": (b.user as { studentId?: string })?.studentId || "",
    "Phòng": (b.room as { roomNumber?: string })?.roomNumber,
    "Tổng": b.total,
    "Hạn TT": new Date(b.dueDate).toLocaleDateString("vi-VN"),
    "Ngày tạo hóa đơn": formatDateTimeVi(b.createdAt),
    "Ngày đã thanh toán": formatDateTimeVi(b.paidAt),
    "Phương thức thanh toán": b.status === "paid" ? billPaymentMethodLabel(b.paymentMethod) : "",
    "Người thanh toán": billPaymentPayerLabel(b),    "Trạng thái": statusMap[b.status]?.text || b.status,
  });

  const selectedCounterBill = counterBills.find((b) => b._id === counterBillId) || null;

  const cols = [
    {
      title: "Mã HĐ",
      dataIndex: "billCode",
      key: "billCode",
      width: 130,
      render: (v: string, r: Bill) => v || billCodeDisplay(r),    },
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
      render: (_: unknown, r: Bill) => (
        <Tag color={billTypeTagColor(r.billType)}>{billTypeShort(r.billType)}</Tag>
      ),
    },
    {
      title: "Sinh viên",
      key: "user",
      width: 200,
      fixed: "left" as const,
      ellipsis: true,
      render: (_: unknown, r: Bill) => {
        const u = r.user as { fullName?: string; studentId?: string } | undefined;
        return (
          <div>
            <div>{u?.fullName || "—"}</div>
            {u?.studentId ? <div style={{ fontSize: 11, color: "#6b7280" }}>{u.studentId}</div> : null}
          </div>
        );
      },
    },
    {
      title: "Phòng",
      dataIndex: ["room", "roomNumber"],
      key: "room",
      width: 80,
    },
    {
      title: "Chi tiết phí",
      key: "fees",
      width: 150,
      render: (_: unknown, r: Bill) => {
        const content =
          isSpecialBill(r.billType) ? (
            <div style={{ minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {isTransferSupplementBill(r.billType)
                  ? "Phụ thu chuyển phòng"
                  : r.billType === "damage_reimbursement"
                    ? "Chi tiết bồi thường"
                    : "Chi tiết phạt"}
              </div>
              {(r.penaltyBreakdown || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                  {(r.penaltyBreakdown || []).map((line, idx) => (
                    <li key={idx}>
                      {line.label}: <strong>{formatMoney(line.amount)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>—</div>
              )}
            </div>
          ) : (
            <div style={{ minWidth: 280 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Chi tiết phí</div>
              <div>Tiền phòng: <strong>{formatMoney(r.roomFee)}</strong></div>
              <div>Điện: <strong>{formatMoney(r.electricityFee)}</strong></div>
              <div>Nước: <strong>{formatMoney(r.waterFee)}</strong></div>
              {(r.commonServiceBreakdown?.length || 0) > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 600 }}>DV phòng chung</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                    {(r.commonServiceBreakdown || []).map((it, idx) => (
                      <li key={`${it.service || it.name || "common"}-${idx}`}>
                        {it.name || "Dịch vụ"}: <strong>{formatMoney(it.totalAmount)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : r.sharedCommonFee ? (
                <div>DV phòng chung: <strong>{formatMoney(r.sharedCommonFee)}</strong></div>
              ) : (
                <div>DV phòng chung: —</div>
              )}
              {r.otherFee ? <div>Phí khác: <strong>{formatMoney(r.otherFee)}</strong></div> : <div>Phí khác: —</div>}
              {(r.personalServiceBreakdown || []).length ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>Dịch vụ cá nhân</div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                    {(r.personalServiceBreakdown || []).map((it, idx) => (
                      <li key={`${it.service || it.name || "svc"}-${idx}`}>{formatPersonalServiceLine(it)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>Dịch vụ cá nhân: —</div>
              )}
            </div>
          );
        return (
          <Popover content={content} title={null} trigger="hover">
            <Button size="small">Xem</Button>
          </Popover>
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
      title: "Ngày tạo hóa đơn",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (d: string) => formatDateTimeVi(d),
    },
    {
      title: "Ngày thanh toán",
      dataIndex: "paidAt",
      key: "paidAt",
      width: 170,
      render: (d?: string) => formatDateTimeVi(d),
    },
    {
      title: "Phương thức TT",
      key: "payMethod",
      width: 200,
      ellipsis: true,
      render: (_: unknown, r: Bill) =>
        r.status === "paid" ? billPaymentMethodLabel(r.paymentMethod) : "—",
    },
    {
      title: "Người thanh toán",
      key: "payer",
      width: 140,
      render: (_: unknown, r: Bill) => billPaymentPayerLabel(r),
    },
    {
      title: "Trạng thái",      dataIndex: "status",
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

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý hóa đơn</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Tạo, xem và quản lý hóa đơn tiền phòng, điện nước</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng chưa thu (theo bộ lọc)</span>} value={summary.unpaidTotal} formatter={(v) => formatMoney(Number(v))} valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng doanh thu (toàn hệ thống)</span>} value={summary.paidTotalAllTime} formatter={(v) => formatMoney(Number(v))} valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Hóa đơn chưa thanh toán" value={summary.unpaidCount} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Tổng hóa đơn" value={total} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <BillsFilterToolbar
          filters={filters}
          searchInput={searchInput}
          currentMonth={currentMonth}
          currentYear={currentYear}
          genMonth={genMonth}
          genYear={genYear}
          onFiltersChange={setFilters}
          onSearchChange={setSearchInput}
          onPageReset={() => setPage(1)}
          onClearFilters={() => {
            setSearchInput("");
            setFilters({ month: currentMonth, year: currentYear });
            setPage(1);
          }}
          onGenMonthChange={setGenMonth}
          onGenYearChange={setGenYear}
          onGenerateMonth={async () => {
            try {
              const r = await billsApi.generate({ month: genMonth, year: genYear });
              message.success(`Tạo hóa đơn xong: ${r.data?.created || 0}, bỏ qua: ${r.data?.skipped || 0}`);
              void load();
            } catch (err: unknown) {
              message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Không tạo được hóa đơn tháng");
            }
          }}
          onOpenCounter={() => setCounterOpen(true)}
          onExportExcel={() => exportToExcel(data.map(billToExcelRow), "danh-sach-hoa-don", "Hóa đơn")}
          onOpenCreate={() => setModalOpen(true)}
        />

        <Table          columns={cols}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{ total, current: page, pageSize: 10, onChange: setPage, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hóa đơn` }}
          scroll={{ x: 1400 }}          size="middle"
        />
      </Card>

      <Modal
        title="Tạo hóa đơn"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setRoomFeeLines([]);
        }}
        footer={null}
        width={520}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ month: currentMonth, year: currentYear }} onValuesChange={(changedValues, allValues) => {
          if (changedValues.roomId || changedValues.month || changedValues.year) {
            const { roomId, month, year } = allValues;
            if (typeof roomId === "string" && typeof month === "number" && typeof year === "number") {
              fetchRoomCosts(roomId, month, year);
              applyRoomPriceDisplay(roomId);
              void fetchRoomContractFees(roomId);
            }
          }
        }}>
          <Form.Item name="roomId" label="Phòng" rules={[{ required: true, message: "Chọn phòng" }]}>
            <Select
              placeholder="Chọn phòng để tạo hóa đơn"
              showSearch
              optionFilterProp="children"
              onChange={(rid) => {
                const id = String(rid);
                applyRoomPriceDisplay(id);
                void fetchRoomContractFees(id);
              }}
            >
              {rooms.map((r) => (
                <Select.Option key={r._id} value={r._id}>
                  {roomSelectLabel(r)}
                </Select.Option>
              ))}            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="month" label="Tháng" rules={[{ required: true }]}><InputNumber min={1} max={12} style={{ width: "100%" }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="year" label="Năm" rules={[{ required: true }]}><InputNumber min={2020} style={{ width: "100%" }} /></Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="roomPricePreview"
            label="Giá phòng (đ)"
            extra="Chỉ để hiển thị — giá phòng/tháng trong danh mục phòng (không phải số tiền ghi vào hóa đơn)."
          >
            <InputNumber min={0} style={{ width: "100%" }} disabled formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} />
          </Form.Item>
          <Form.Item
            label="Giá đầu người (đ)"
            extra="Số tiền tiền phòng mỗi sinh viên phải đóng — lấy từ contractPrice trên HĐ đang hiệu lực."
          >
            {roomFeePreviewLoading ? (
              <Typography.Text type="secondary">Đang tải từ hợp đồng…</Typography.Text>
            ) : roomFeeLines.length === 0 ? (
              <Typography.Text type="secondary">Chọn phòng có HĐ active.</Typography.Text>
            ) : roomFeeLines.length === 1 ? (
              <Form.Item name="roomFeePreview" noStyle>
                <InputNumber
                  min={0}
                  style={{ width: "100%" }}
                  disabled
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                />
              </Form.Item>
            ) : (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "10px 12px",
                  background: "#f0fdf4",
                }}
              >
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  {roomFeeLines.map((line, idx) => (
                    <li key={`${line.contractNumber || "c"}-${idx}`}>
                      <strong>{line.studentName || "—"}</strong>
                      {line.studentId ? ` (${line.studentId})` : ""} — HĐ {line.contractNumber || "—"}:{" "}
                      <strong style={{ color: "#0d9488" }}>{formatMoney(line.roomFee)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Form.Item>
          <Form.Item name="electricityFee" label="Tiền điện (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="waterFee" label="Tiền nước (đ)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          {roomWifiAssigned ? (
            <Form.Item
              name="sharedCommonFee"
              label="Tiền Wi‑Fi — tổng gói phòng / tháng (đ)"
              extra="Chỉ hiện khi phòng đã gán dịch vụ Wi‑Fi. Mỗi SV trả = tổng gói ÷ số slot (capacity)."
              initialValue={0}
            >
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          ) : (
            <Form.Item
              label="Tiền Wi‑Fi"
              extra="Phòng chưa gán dịch vụ Wi‑Fi — không tính phí Wi‑Fi trên hóa đơn."
            >
              <InputNumber disabled value={0} style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item name="otherFee" label="Phí khác (gửi xe...)" initialValue={0}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="dueDate" label="Hạn thanh toán"><Input type="date" /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>Tạo hóa đơn</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Thu tiền tại quầy"
        open={counterOpen}
        onCancel={() => {
          setCounterOpen(false);
          setCounterStudentId(null);
          setCounterBillId(null);
          setCounterBills([]);
          setCounterCodeInput("");
        }}
        onOk={() => void submitCounterPay()}
        okText="Xác nhận thu tại quầy"        cancelText="Hủy"
        okButtonProps={{ disabled: !counterBillId }}
        width={560}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Tra cứu theo mã hóa đơn</div>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                placeholder="VD: HD20260001"                value={counterCodeInput}
                onChange={(e) => setCounterCodeInput(e.target.value)}
                onPressEnter={() => void lookupBillByCode()}
              />
              <Button loading={counterCodeLoading} onClick={() => void lookupBillByCode()}>
                Tìm
              </Button>
            </Space.Compact>
          </div>
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12 }}>— hoặc —</div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Chọn sinh viên</div>
            <Select
              showSearch
              placeholder="Nhập tên hoặc MSSV"
              filterOption={false}
              style={{ width: "100%" }}
              loading={studentSearchLoading}
              options={studentOptions}
              value={counterStudentId}
              onSearch={(v) => void searchStudents(v)}
              onChange={(v) => {
                setCounterStudentId(v);
                setCounterCodeInput("");
                void loadCounterBills(v);
              }}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Hóa đơn chưa thanh toán</div>
            <Select
              placeholder={counterBills.length ? "Chọn hóa đơn" : "Chọn sinh viên hoặc tra mã HĐ trước"}
              style={{ width: "100%" }}
              loading={counterLoading || counterCodeLoading}
              disabled={counterBills.length === 0}
              value={counterBillId}
              onChange={setCounterBillId}
              options={counterBills.map((b) => ({
                value: b._id,
                label: `${billCodeDisplay(b)} — ${formatMoney(b.total)} (${b.month}/${b.year})`,              }))}
            />
          </div>
          {selectedCounterBill && (
            <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 8, fontSize: 13 }}>
              <div><strong>Mã hóa đơn:</strong> {billCodeDisplay(selectedCounterBill)}</div>
              <div><strong>Số tiền:</strong> {formatMoney(selectedCounterBill.total)}</div>
              <div><strong>Phương thức:</strong> Sinh viên đã thanh toán tại quầy</div>            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={`Chi tiết hóa đơn ${detailModal ? billDetailTitle(detailModal.billType, detailModal.month, detailModal.year) : ""}`}
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
            <p><strong>Sinh viên:</strong> {(detailModal.user as { fullName?: string; studentId?: string })?.fullName}{(detailModal.user as { studentId?: string })?.studentId ? ` (${(detailModal.user as { studentId?: string }).studentId})` : ""}</p>
            <p><strong>Mã hóa đơn:</strong> {billCodeDisplay(detailModal)}</p>
            <p><strong>Phòng:</strong> {roomSelectLabel((detailModal.room as { roomNumber?: string; capacity?: number; currentOccupancy?: number; status?: string }) || {})}</p>            {isSpecialBill(detailModal.billType) ? (
              <>
                <p><strong>Loại:</strong> <Tag color={billTypeTagColor(detailModal.billType)}>{billTypeLabel(detailModal.billType)}</Tag></p>
                <p><strong>Kỳ tham chiếu:</strong> Tháng {detailModal.month}/{detailModal.year}</p>
                {(detailModal.penaltyBreakdown?.length || 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>
                      {isTransferSupplementBill(detailModal.billType) ? "Cách tính phụ thu:" : "Mục phạt / bồi thường:"}
                    </strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {detailModal.penaltyBreakdown?.map((line, idx) => (
                        <li key={idx}>
                          {line.label}: <strong>{formatMoney(line.amount)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {isTransferSupplementBill(detailModal.billType) ? (
                  <p className="text-muted small mb-0" style={{ marginTop: 8 }}>
                    Đây <strong>không</strong> phải tiền phòng tháng đủ — chỉ là phần chênh lệch sau khi prorate tháng đầu HĐ mới và bù trừ tiền phòng cũ.
                  </p>
                ) : null}
                {detailModal.note && !isTransferSupplementBill(detailModal.billType) ? (
                  <p style={{ color: "#6b7280", marginTop: 8 }}><strong>Ghi chú:</strong> {detailModal.note}</p>
                ) : null}
              </>
            ) : (
              <>
                <p><strong>Kỳ:</strong> Tháng {detailModal.month}/{detailModal.year}</p>
                <hr style={{ margin: "12px 0" }} />
                <p><strong>Số người trong phòng:</strong> {detailModal.occupants || 1}</p>
                <p><strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}</p>
                <p><strong>Tiền điện:</strong> {formatMoney(detailModal.electricityFee)}</p>
                <p><strong>Tiền nước:</strong> {formatMoney(detailModal.waterFee)}</p>
                {(detailModal.commonServiceBreakdown?.length || 0) > 0 ? (
                  <div style={{ marginTop: 4 }}>
                    <strong>Dịch vụ phòng chung:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {(detailModal.commonServiceBreakdown ?? []).map((it, idx) => (
                        <li key={`${it.service || it.name || "common"}-${idx}`}>
                          {it.name || "Dịch vụ"}: <strong>{formatMoney(it.totalAmount)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : detailModal.sharedCommonFee ? (
                  <p><strong>Dịch vụ phòng chung:</strong> {formatMoney(detailModal.sharedCommonFee)}</p>
                ) : null}
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
            <p>
              <strong>{isTransferSupplementBill(detailModal.billType) ? "Phụ thu còn lại:" : "Tổng cộng:"}</strong>{" "}
              <span style={{ fontSize: 18, color: "#0d9488" }}>{formatMoney(detailModal.total)}</span>
            </p>
            <hr style={{ margin: "12px 0" }} />
            <p><strong>Hạn thanh toán:</strong> {new Date(detailModal.dueDate).toLocaleDateString("vi-VN")}</p>
            <p><strong>Ngày tạo:</strong> {formatDateTimeVi(detailModal.createdAt)}</p>
            {detailModal.paidAt && <p><strong>Ngày thanh toán:</strong> {formatDateTimeVi(detailModal.paidAt)}</p>}
            {detailModal.status === "paid" && (
              <>
                <p><strong>Phương thức thanh toán:</strong> {billPaymentMethodLabel(detailModal.paymentMethod)}</p>
                <p><strong>Người thanh toán:</strong> {billPaymentPayerLabel(detailModal)}</p>                {detailModal.paymentReference ? (
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
