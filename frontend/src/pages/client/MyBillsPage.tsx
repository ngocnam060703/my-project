import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Popover,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import { CheckCircleFilled, CloseCircleFilled, CreditCardOutlined, EyeOutlined, FilterOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import type { ColumnsType } from "antd/es/table";
import { useNavigate, useSearchParams } from "react-router-dom";
import { billsApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import type { Bill } from "../../types";
import { formatDateTimeVi } from "../../utils/formatDateTime";
import {
  billDetailTitle,
  billTypeLabel,
  billTypeShort,
  billTypeTagColor,
  isSpecialBill,
  isTransferSupplementBill,
} from "../../utils/billTypeLabels";
import { billPaymentMethodLabel, billPaymentPayerLabel } from "../../utils/billPaymentLabels";
import { roomSelectLabel } from "../../utils/roomDisplay";

const statusMap: Record<string, { color: string; text: string }> = {
  unpaid: { color: "orange", text: "Chưa thanh toán" },
  pending: { color: "orange", text: "Chưa thanh toán" },
  paid: { color: "green", text: "Đã thanh toán" },
  overdue: { color: "red", text: "Quá hạn" },
};

const formatMoney = (v: number | undefined) => `${Math.round(v ?? 0).toLocaleString("vi-VN")}đ`;
const billCodeDisplay = (b: Bill) => b.billCode || "—";

type PersonalLine = NonNullable<Bill["personalServiceBreakdown"]>[number];

const formatPersonalServiceLine = (it: PersonalLine) => {
  const name = it.name || "Dịch vụ";
  const amt = formatMoney(it.amount || 0);
  const suffix = it.unit === "once" ? ` (${it.quantity ?? 0} lần)` : " (/ tháng)";
  return `${name}: ${amt}${suffix}`;
};

const canPayOnline = (status: string) => ["unpaid", "pending", "overdue"].includes(String(status || ""));

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const responseMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (responseMessage) return responseMessage;
    if (error.response?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  return "Không thể tải dữ liệu hóa đơn.";
};

const MyBillsPage: React.FC = () => {
  const { message } = App.useApp();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<Bill | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<{
    status?: string;
    month?: number;
    year?: number;
    billType?: string;
  }>({
    month: currentMonth,
    year: currentYear,
  });
  const openedFromQueryRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let raw: Bill[] = [];
      try {
        const { data } = await billsApi.getMyBills();
        raw = Array.isArray(data) ? (data as Bill[]) : [];
      } catch {
        const { data } = await billsApi.getMy();
        raw = Array.isArray(data) ? (data as Bill[]) : [];
      }
      setAllBills(raw);
    } catch (err) {
      message.error(getErrorMessage(err));
      setAllBills([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onBillPaid = () => void load();
    socket.on("bill:paid", onBillPaid);
    return () => {
      socket.off("bill:paid", onBillPaid);
    };
  }, [socket, load]);

  useEffect(() => {
    const vnpay = searchParams.get("vnpay");
    const responseCode = searchParams.get("vnp_ResponseCode");
    const billId = searchParams.get("billId");
    const success = vnpay === "success" || responseCode === "00";
    const cancel = vnpay === "cancel" || responseCode === "24";
    const hasVnpCallback = vnpay !== null || responseCode !== null;

    if (hasVnpCallback) {
      if (success) {
        message.success({
          content: "Thanh toán thành công!",
          icon: <CheckCircleFilled style={{ color: "#16a34a" }} />,
        });
        void load();
      } else if (cancel) {
        message.warning({
          content: "Đã hủy giao dịch thanh toán",
          icon: <CloseCircleFilled style={{ color: "#f97316" }} />,
        });
      }
      navigate("/student/my-bills", { replace: true });
    }

    if (billId && !openedFromQueryRef.current && allBills.length > 0) {
      openedFromQueryRef.current = true;
      const hit = allBills.find((b) => String(b._id) === billId);
      if (hit) setDetailModal(hit);
      else {
        void billsApi
          .getById(billId)
          .then((res) => setDetailModal(res.data as Bill))
          .catch(() => message.error("Không tải được chi tiết hóa đơn"));
      }
      navigate("/student/my-bills", { replace: true });
    }
  }, [searchParams, message, navigate, load, allBills]);

  const filteredBills = useMemo(() => {
    let list = [...allBills];
    if (filters.status) list = list.filter((b) => b.status === filters.status);
    if (filters.month) list = list.filter((b) => b.month === filters.month);
    if (filters.year) list = list.filter((b) => b.year === filters.year);
    if (filters.billType === "monthly") {
      list = list.filter((b) => !b.billType || b.billType === "monthly");
    } else if (
      filters.billType === "penalty" ||
      filters.billType === "damage_reimbursement" ||
      filters.billType === "transfer_supplement"
    ) {
      list = list.filter((b) => b.billType === filters.billType);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((b) => String(b.billCode || "").toLowerCase().includes(q));
    }
    return list;
  }, [allBills, filters, debouncedSearch]);

  const summary = useMemo(() => {
    let unpaidTotal = 0;
    let paidTotal = 0;
    let unpaidCount = 0;
    for (const b of filteredBills) {
      const t = Number(b.total || 0);
      if (canPayOnline(b.status)) {
        unpaidTotal += t;
        unpaidCount += 1;
      } else if (b.status === "paid") {
        paidTotal += t;
      }
    }
    const paidTotalAllTime = allBills
      .filter((b) => b.status === "paid")
      .reduce((s, b) => s + Number(b.total || 0), 0);
    return { unpaidTotal, paidTotal, unpaidCount, paidTotalAllTime, total: filteredBills.length };
  }, [filteredBills, allBills]);

  const payOnline = async (bill: Bill) => {
    setPayingId(bill._id);
    try {
      const response = await billsApi.payOnline(bill._id);
      const paymentUrl = (response.data as { paymentUrl?: string } | undefined)?.paymentUrl;
      if (!paymentUrl) {
        message.error("Không tạo được đường dẫn thanh toán VNPay.");
        return;
      }
      window.location.href = paymentUrl;
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPayingId(null);
    }
  };

  const cols: ColumnsType<Bill> = [
    {
      title: "Mã HĐ",
      dataIndex: "billCode",
      key: "billCode",
      width: 130,
      fixed: "left",
      render: (v: string, r: Bill) => v || billCodeDisplay(r),
    },
    {
      title: "Tháng/Năm",
      key: "my",
      width: 90,
      render: (_: unknown, r: Bill) => (
        <strong>
          {r.month}/{r.year}
        </strong>
      ),
    },
    {
      title: "Loại",
      key: "billType",
      width: 100,
      render: (_: unknown, r: Bill) => <Tag color={billTypeTagColor(r.billType)}>{billTypeShort(r.billType)}</Tag>,
    },
    {
      title: "Phòng",
      key: "room",
      width: 88,
      render: (_: unknown, r: Bill) => {
        const room = r.room;
        if (room && typeof room === "object") return room.roomNumber || "—";
        return "—";
      },
    },
    {
      title: "Chi tiết phí",
      key: "fees",
      width: 120,
      render: (_: unknown, r: Bill) => {
        const content = isSpecialBill(r.billType) ? (
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
            <div>
              Tiền phòng: <strong>{formatMoney(r.roomFee)}</strong>
            </div>
            <div>
              Điện: <strong>{formatMoney(r.electricityFee)}</strong>
            </div>
            <div>
              Nước: <strong>{formatMoney(r.waterFee)}</strong>
            </div>
            <div>
              Wi‑Fi: <strong>{formatMoney(r.sharedCommonFee)}</strong>
            </div>
            {r.otherFee ? (
              <div>
                Phí khác: <strong>{formatMoney(r.otherFee)}</strong>
              </div>
            ) : (
              <div>Phí khác: —</div>
            )}
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
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—"),
    },
    {
      title: "Ngày tạo HĐ",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (d?: string) => formatDateTimeVi(d),
    },
    {
      title: "Ngày thanh toán",
      dataIndex: "paidAt",
      key: "paidAt",
      width: 150,
      render: (d?: string) => formatDateTimeVi(d),
    },
    {
      title: "Phương thức TT",
      key: "payMethod",
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: Bill) => (r.status === "paid" ? billPaymentMethodLabel(r.paymentMethod) : "—"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (s: string) => (
        <Tag color={statusMap[s]?.color} style={{ fontWeight: 500 }}>
          {statusMap[s]?.text || s}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_: unknown, r: Bill) => (
        <Space wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
            Chi tiết
          </Button>
          {canPayOnline(r.status) && Number(r.total || 0) > 0 ? (
            <Button
              type="link"
              size="small"
              icon={<CreditCardOutlined />}
              loading={payingId === r._id}
              onClick={() => void payOnline(r)}
            >
              VNPay
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Hóa đơn của tôi</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Xem chi tiết, theo dõi trạng thái và thanh toán online các hóa đơn KTX
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Tổng cần thanh toán (theo bộ lọc)</span>}
              value={summary.unpaidTotal}
              formatter={(v) => formatMoney(Number(v))}
              valueStyle={{ color: "#fff", fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", color: "white" }}>
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Đã thanh toán (toàn bộ)</span>}
              value={summary.paidTotalAllTime}
              formatter={(v) => formatMoney(Number(v))}
              valueStyle={{ color: "#fff", fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Hóa đơn chưa thanh toán" value={summary.unpaidCount} suffix="đơn" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Tổng hóa đơn (theo bộ lọc)" value={summary.total} suffix="đơn" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input
            placeholder="Tìm mã hóa đơn (VD: HD20260001)"
            allowClear
            style={{ width: 220 }}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
          />
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 150 }}
            value={filters.status}
            onChange={(v) => {
              setFilters((f) => ({ ...f, status: v }));
              setPage(1);
            }}
            options={[
              { value: "unpaid", label: "Chưa thanh toán" },
              { value: "paid", label: "Đã thanh toán" },
              { value: "overdue", label: "Quá hạn" },
            ]}
          />
          <Select
            placeholder="Loại HĐ"
            allowClear
            style={{ width: 150 }}
            value={filters.billType}
            onChange={(v) => {
              setFilters((f) => ({ ...f, billType: v }));
              setPage(1);
            }}
            options={[
              { value: "monthly", label: "Hóa đơn tháng" },
              { value: "penalty", label: "Hóa đơn phạt VP" },
              { value: "damage_reimbursement", label: "Bồi thường HH" },
              { value: "transfer_supplement", label: "Phụ thu chuyển phòng" },
            ]}
          />
          <InputNumber
            placeholder="Tháng"
            min={1}
            max={12}
            style={{ width: 88 }}
            value={filters.month}
            onChange={(v) => {
              setFilters((f) => ({ ...f, month: v ?? undefined }));
              setPage(1);
            }}
          />
          <InputNumber
            placeholder="Năm"
            min={2020}
            style={{ width: 100 }}
            value={filters.year}
            onChange={(v) => {
              setFilters((f) => ({ ...f, year: v ?? undefined }));
              setPage(1);
            }}
          />
          <Button
            onClick={() => {
              setSearchInput("");
              setFilters({ month: currentMonth, year: currentYear });
              setPage(1);
            }}
          >
            Xóa lọc
          </Button>
        </div>

        <Table<Bill>
          columns={cols}
          dataSource={filteredBills}
          rowKey="_id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: 10,
            total: filteredBills.length,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t} hóa đơn`,
          }}
          scroll={{ x: 1280 }}
          size="middle"
          locale={{ emptyText: "Chưa có hóa đơn phù hợp bộ lọc" }}
        />
      </Card>

      <Modal
        title={`Chi tiết hóa đơn ${detailModal ? billDetailTitle(detailModal.billType, detailModal.month, detailModal.year) : ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>
            Đóng
          </Button>,
          detailModal && canPayOnline(detailModal.status) && Number(detailModal.total || 0) > 0 ? (
            <Button
              key="pay"
              type="primary"
              icon={<CreditCardOutlined />}
              loading={payingId === detailModal._id}
              onClick={() => void payOnline(detailModal)}
            >
              Thanh toán VNPay
            </Button>
          ) : null,
        ].filter(Boolean)}
        width={440}
      >
        {detailModal && (
          <div style={{ lineHeight: 2 }}>
            <p>
              <strong>Mã hóa đơn:</strong> {billCodeDisplay(detailModal)}
            </p>
            <p>
              <strong>Phòng:</strong>{" "}
              {roomSelectLabel(
                (detailModal.room as { roomNumber?: string; capacity?: number; currentOccupancy?: number; status?: string }) ||
                  {},
              )}
            </p>
            {isSpecialBill(detailModal.billType) ? (
              <>
                <p>
                  <strong>Loại:</strong>{" "}
                  <Tag color={billTypeTagColor(detailModal.billType)}>{billTypeLabel(detailModal.billType)}</Tag>
                </p>
                <p>
                  <strong>Kỳ tham chiếu:</strong> Tháng {detailModal.month}/{detailModal.year}
                </p>
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
                  <p className="text-muted small mb-0" style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
                    Đây <strong>không</strong> phải tiền phòng tháng đủ — chỉ là phần chênh lệch sau bù trừ chuyển phòng.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p>
                  <strong>Kỳ:</strong> Tháng {detailModal.month}/{detailModal.year}
                </p>
                <hr style={{ margin: "12px 0" }} />
                <p>
                  <strong>Số người trong phòng:</strong> {detailModal.occupants || 1}
                </p>
                <p>
                  <strong>Tiền phòng:</strong> {formatMoney(detailModal.roomFee)}
                </p>
                <p>
                  <strong>Tiền điện:</strong> {formatMoney(detailModal.electricityFee)}
                </p>
                <p>
                  <strong>Tiền nước:</strong> {formatMoney(detailModal.waterFee)}
                </p>
                {detailModal.sharedCommonFee ? (
                  <p>
                    <strong>Wifi:</strong> {formatMoney(detailModal.sharedCommonFee)}
                  </p>
                ) : null}
                {detailModal.otherFee ? (
                  <p>
                    <strong>Phí khác:</strong> {formatMoney(detailModal.otherFee)}
                  </p>
                ) : null}
                {detailModal.personalServiceFee ? (
                  <p>
                    <strong>Dịch vụ cá nhân:</strong> {formatMoney(detailModal.personalServiceFee)}
                  </p>
                ) : null}
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
                {detailModal.note ? (
                  <p style={{ color: "#6b7280" }}>
                    <strong>Cách tính:</strong> {detailModal.note}
                  </p>
                ) : null}
              </>
            )}
            <p>
              <strong>{isTransferSupplementBill(detailModal.billType) ? "Phụ thu còn lại:" : "Tổng cộng:"}</strong>{" "}
              <span style={{ fontSize: 18, color: "#0d9488" }}>{formatMoney(detailModal.total)}</span>
            </p>
            <hr style={{ margin: "12px 0" }} />
            <p>
              <strong>Hạn thanh toán:</strong> {new Date(detailModal.dueDate).toLocaleDateString("vi-VN")}
            </p>
            <p>
              <strong>Ngày tạo:</strong> {formatDateTimeVi(detailModal.createdAt)}
            </p>
            {detailModal.paidAt && (
              <p>
                <strong>Ngày thanh toán:</strong> {formatDateTimeVi(detailModal.paidAt)}
              </p>
            )}
            {detailModal.status === "paid" && (
              <>
                <p>
                  <strong>Phương thức thanh toán:</strong> {billPaymentMethodLabel(detailModal.paymentMethod)}
                </p>
                <p>
                  <strong>Người thanh toán:</strong> {billPaymentPayerLabel(detailModal)}
                </p>
                {detailModal.paymentReference ? (
                  <p>
                    <strong>Mã tham chiếu:</strong> {detailModal.paymentReference}
                  </p>
                ) : null}
              </>
            )}
            <p>
              <strong>Trạng thái:</strong>{" "}
              <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyBillsPage;
