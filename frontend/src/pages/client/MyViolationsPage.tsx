/**
 * Sinh viên — vi phạm của tôi (UI đồng bộ tab «Danh sách đã ghi» trang admin).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Image,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  WarningOutlined,
  ReloadOutlined,
  EyeOutlined,
  DollarOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { isAxiosError } from "axios";
import { billsApi, violationsApi } from "../../api";
import {
  violationFineDisplay,
  violationRecordedCompensation,
  violationCompensationDisplay,
  violationRecordedFine,
  violationRecordedTotal,
} from "../../utils/violationDisplay";
import type { Violation } from "../../types";

const LIMIT = 10;

const severityVi: Record<string, string> = {
  light: "Nhẹ",
  medium: "Trung bình",
  heavy: "Nặng",
};

const actionTypeVi: Record<string, string> = {
  warning: "Cảnh cáo / nhắc nhở",
  fine: "Phạt tiền",
  compensation: "Bồi thường",
  expulsion: "Buộc rời KTX",
};

function defaultSchoolYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function isViolationPending(r: Violation) {
  return !r.status || r.status === "pending";
}

function billIdOf(r: Violation): string | null {
  if (!r.bill) return null;
  if (typeof r.bill === "string") return r.bill;
  return r.bill._id ? String(r.bill._id) : null;
}

function paymentStatusTag(r: Violation, billPaid: boolean) {
  if (isViolationPending(r)) {
    return <Tag color="orange">Chờ xử lý</Tag>;
  }
  const total = violationRecordedTotal(r);
  const bid = billIdOf(r);
  if (total > 0 && bid) {
    return billPaid ? <Tag color="green">Đã đóng phạt</Tag> : <Tag color="volcano">Chờ thanh toán</Tag>;
  }
  return <Tag color="green">Đã xử lý</Tag>;
}

type BillLookup = { _id?: string; status?: string };

const MyViolationsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Violation[]>([]);
  const [billPaidMap, setBillPaidMap] = useState<Map<string, boolean>>(new Map());
  const [schoolYear, setSchoolYear] = useState(defaultSchoolYear());
  const [semester, setSemester] = useState("HK1");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Violation | null>(null);
  const [statsPoints, setStatsPoints] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let violationsRaw: Violation[] = [];
      try {
        const res = await violationsApi.getMyViolations();
        violationsRaw = Array.isArray(res.data) ? res.data : [];
      } catch {
        const res = await violationsApi.getMy();
        violationsRaw = Array.isArray(res.data) ? res.data : [];
      }

      let billsRaw: BillLookup[] = [];
      try {
        const billsRes = await billsApi.getMyBills();
        billsRaw = Array.isArray(billsRes.data) ? billsRes.data : [];
      } catch {
        const billsRes = await billsApi.getMy();
        billsRaw = Array.isArray(billsRes.data) ? billsRes.data : [];
      }

      const paid = new Map<string, boolean>();
      for (const b of billsRaw) {
        if (b._id) paid.set(String(b._id), String(b.status || "") === "paid");
      }
      setBillPaidMap(paid);

      violationsRaw.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRows(violationsRaw);
    } catch (e) {
      setRows([]);
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Không tải được vi phạm" : "Lỗi tải dữ liệu",
      );
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadStats = useCallback(async () => {
    try {
      const r = await violationsApi.getMyStats({ schoolYear, semester });
      const pts = (r.data as { totalPoints?: number })?.totalPoints;
      setStatsPoints(typeof pts === "number" ? pts : null);
    } catch {
      setStatsPoints(null);
    }
  }, [schoolYear, semester]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const filteredRows = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.schoolYear && r.schoolYear !== schoolYear) return false;
      if (r.semester && r.semester !== semester) return false;
      if (!q) return true;
      const name = String(r.ruleName || "").toLowerCase();
      const desc = String(r.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [rows, schoolYear, semester, searchInput]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * LIMIT;
    return filteredRows.slice(start, start + LIMIT);
  }, [filteredRows, page]);

  const pendingPayCount = useMemo(
    () =>
      filteredRows.filter((r) => {
        const bid = billIdOf(r);
        return !isViolationPending(r) && violationRecordedTotal(r) > 0 && bid && !billPaidMap.get(bid);
      }).length,
    [filteredRows, billPaidMap],
  );

  const totalPoints = useMemo(() => {
    if (statsPoints != null) return statsPoints;
    return filteredRows.reduce((s, r) => s + Number(r.points || 0), 0);
  }, [filteredRows, statsPoints]);

  const openPay = (r: Violation) => {
    const bid = billIdOf(r);
    if (!bid) return;
    navigate(`/student/my-bills?billId=${encodeURIComponent(bid)}`);
  };

  const columns = [
    {
      title: "STT",
      key: "stt",
      width: 56,
      render: (_: unknown, __: Violation, index: number) => (page - 1) * LIMIT + index + 1,
    },
    {
      title: "Thời gian",
      key: "t",
      width: 160,
      render: (_: unknown, r: Violation) =>
        r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—",
    },
    {
      title: "Vi phạm",
      dataIndex: "ruleName",
      ellipsis: true,
      render: (v: string) => v || "—",
    },
    {
      title: "Mức độ",
      key: "sev",
      width: 100,
      render: (_: unknown, r: Violation) => <Tag>{severityVi[r.severity] || r.severity || "—"}</Tag>,
    },
    { title: "Điểm", dataIndex: "points", width: 64 },
    {
      title: "Trạng thái",
      key: "st",
      width: 120,
      render: (_: unknown, r: Violation) => {
        const bid = billIdOf(r);
        return paymentStatusTag(r, bid ? !!billPaidMap.get(bid) : false);
      },
    },
    {
      title: "Quyết định",
      key: "res",
      width: 140,
      ellipsis: true,
      render: (_: unknown, r: Violation) =>
        r.resolution ? (
          <span>
            {actionTypeVi[r.resolution.actionType] || r.resolution.actionType}
            {r.resolution.penaltyAmount ? ` · ${r.resolution.penaltyAmount.toLocaleString("vi-VN")}đ` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "Phạt",
      key: "fine",
      width: 96,
      align: "right" as const,
      render: (_: unknown, r: Violation) => `${violationFineDisplay(r).toLocaleString("vi-VN")}đ`,
    },
    {
      title: "Bồi thường",
      key: "comp",
      width: 96,
      align: "right" as const,
      render: (_: unknown, r: Violation) => `${violationRecordedCompensation(r).toLocaleString("vi-VN")}đ`,
    },
    {
      title: "Tổng",
      key: "total",
      width: 100,
      align: "right" as const,
      render: (_: unknown, r: Violation) => `${violationRecordedTotal(r).toLocaleString("vi-VN")}đ`,
    },
    {
      title: "Thao tác",
      key: "act",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, r: Violation) => {
        const bid = billIdOf(r);
        const needPay = bid && violationRecordedTotal(r) > 0 && !billPaidMap.get(bid) && !isViolationPending(r);
        return (
          <Space size={4} wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>
              Chi tiết
            </Button>
            {needPay && (
              <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPay(r)}>
                Thanh toán
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>
          <WarningOutlined /> Vi phạm của tôi
        </h2>
        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
          Theo dõi vi phạm nội quy, điểm kỷ luật và thanh toán phạt (nếu có hóa đơn)
        </p>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Ngưỡng nhắc nhở" value="1–2 điểm" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Cảnh cáo / Nghiêm trọng" value="3–6 điểm" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Buộc rời KTX" value="≥ 7 điểm" valueStyle={{ color: "#cf1322" }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              background: "linear-gradient(135deg, #d97706 0%, #92400e 100%)",
              color: "#fff",
            }}
          >
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Chờ thanh toán phạt</span>}
              value={pendingPayCount}
              suffix="lần"
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)",
              color: "#fff",
            }}
          >
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Vi phạm đã ghi (kỳ)</span>}
              value={filteredRows.length}
              suffix="lần"
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              borderRadius: 12,
              background: "linear-gradient(135deg, #4f46e5 0%, #312e81 100%)",
              color: "#fff",
            }}
          >
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Điểm kỷ luật tích lũy</span>}
              value={totalPoints}
              suffix="điểm"
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <FilterOutlined style={{ color: "#6b7280" }} />
          <Input
            placeholder="Tìm theo tên vi phạm, mô tả..."
            allowClear
            style={{ width: 260 }}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
          />
          <span style={{ color: "#6b7280" }}>Năm học:</span>
          <Input
            style={{ width: 130 }}
            value={schoolYear}
            onChange={(e) => {
              setSchoolYear(e.target.value);
              setPage(1);
            }}
          />
          <span style={{ color: "#6b7280" }}>Học kỳ:</span>
          <Select
            style={{ width: 100 }}
            value={semester}
            onChange={(v) => {
              setSemester(v);
              setPage(1);
            }}
            options={[
              { value: "HK1", label: "HK1" },
              { value: "HK2", label: "HK2" },
              { value: "HK3", label: "HK3" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            Làm mới
          </Button>
        </div>

        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
          Tổng {filteredRows.length} bản ghi · {schoolYear} · {semester}
        </Typography.Text>

        <Table
          rowKey="_id"
          loading={loading}
          columns={columns}
          dataSource={pageRows}
          scroll={{ x: 1200 }}
          locale={{ emptyText: <Empty description="Chưa có vi phạm trong kỳ đã chọn" /> }}
          pagination={{
            current: page,
            pageSize: LIMIT,
            total: filteredRows.length,
            showSizeChanger: false,
            showTotal: (t, range) => `${range[0]}-${range[1]} / ${t} bản ghi`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      <Modal
        title="Chi tiết vi phạm"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={[
          detail && billIdOf(detail) && violationRecordedTotal(detail) > 0 && !billPaidMap.get(billIdOf(detail)!) && !isViolationPending(detail) ? (
            <Button key="pay" type="primary" icon={<DollarOutlined />} onClick={() => openPay(detail)}>
              Thanh toán phạt
            </Button>
          ) : null,
          <Button key="close" onClick={() => setDetail(null)}>
            Đóng
          </Button>,
        ].filter(Boolean)}
        width={720}
        destroyOnClose
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Thời gian">
                {detail.createdAt ? new Date(detail.createdAt).toLocaleString("vi-VN") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Phòng">
                {typeof detail.room === "object"
                  ? `Phòng ${detail.room?.roomNumber}${typeof detail.room.area === "object" && detail.room.area?.name ? ` — ${detail.room.area.name}` : ""}`
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Năm học / HK">
                {detail.schoolYear} · {detail.semester}
              </Descriptions.Item>
              <Descriptions.Item label="Vi phạm">{detail.ruleName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái xử lý">
                {isViolationPending(detail) ? "Chờ xử lý" : "Đã xử lý"}
              </Descriptions.Item>
              {detail.resolution && (
                <>
                  <Descriptions.Item label="Quyết định kỷ luật">
                    {actionTypeVi[detail.resolution.actionType] || detail.resolution.actionType}
                  </Descriptions.Item>
                  {(detail.resolution.penaltyAmount || 0) > 0 &&
                    (detail.resolution.actionType === "fine" || detail.resolution.actionType === "compensation") && (
                      <Descriptions.Item
                        label={
                          detail.resolution.actionType === "compensation"
                            ? "Bồi thường (theo quyết định)"
                            : "Tiền phạt (theo quyết định)"
                        }
                      >
                        {detail.resolution.penaltyAmount!.toLocaleString("vi-VN")}đ
                      </Descriptions.Item>
                    )}
                  <Descriptions.Item label="Ghi chú xử lý">{detail.resolution.note?.trim() || "—"}</Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="Mức độ">{severityVi[detail.severity] || detail.severity}</Descriptions.Item>
              <Descriptions.Item label="Điểm">{detail.points}</Descriptions.Item>
              <Descriptions.Item label="Phạt (ghi nhận)">{violationRecordedFine(detail).toLocaleString("vi-VN")}đ</Descriptions.Item>
              <Descriptions.Item label="Bồi thường (ghi nhận)">
                {violationRecordedCompensation(detail).toLocaleString("vi-VN")}đ
              </Descriptions.Item>
              <Descriptions.Item label="Tổng ghi nhận">{violationRecordedTotal(detail).toLocaleString("vi-VN")}đ</Descriptions.Item>
              <Descriptions.Item label="Thanh toán">
                {(() => {
                  const bid = billIdOf(detail);
                  if (isViolationPending(detail)) return "Chưa có — đang chờ BQL xử lý";
                  if (violationRecordedTotal(detail) <= 0) return "Không phát sinh tiền phạt";
                  if (!bid) return "—";
                  return billPaidMap.get(bid) ? "Đã thanh toán" : "Chưa thanh toán — xem Hóa đơn";
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả">{detail.description?.trim() || "—"}</Descriptions.Item>
            </Descriptions>
            {detail.images && detail.images.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text strong>Ảnh minh chứng</Typography.Text>
                <Image.PreviewGroup>
                  <Space wrap style={{ marginTop: 8 }}>
                    {detail.images.map((src, i) => (
                      <Image key={i} src={src} alt="" width={120} style={{ objectFit: "cover", borderRadius: 4 }} />
                    ))}
                  </Space>
                </Image.PreviewGroup>
              </div>
            )}
            {isViolationPending(detail) && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 16 }}
                message="Đang chờ Ban quản lý xử lý"
                description="Sau khi có quyết định, nếu có tiền phạt bạn sẽ thấy hóa đơn tại mục Hóa đơn của tôi."
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default MyViolationsPage;
