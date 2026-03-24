import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  DatePicker,
  Tag,
  message,
  Space,
  Card,
  Row,
  Col,
  Statistic,
  Select,
} from "antd";
import {
  EyeOutlined,
  StopOutlined,
  DownloadOutlined,
  FilterOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { exportToExcel } from "../../utils/exportExcel";
import { contractsApi, client } from "../../api";
import type { Contract, User } from "../../types";
import dayjs from "dayjs";

const statusMap: Record<string, { color: string; text: string }> = {
  pending_payment: { color: "gold", text: "Chưa hiệu lực (chờ ký + xác nhận ký)" },
  active: { color: "green", text: "Có hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã chấm dứt" },
};

const lessorAddress = "................................................................................................";
const lessorPhone = ".............................................................................................";

const ContractsPage: React.FC = () => {
  const [data, setData] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [rooms, setRooms] = useState<{ _id: string; roomNumber: string; area?: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Contract | null>(null);
  const [extendModal, setExtendModal] = useState<Contract | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ status?: string; room?: string }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.room) params.room = filters.room;
      const [res, roomsRes] = await Promise.all([
        client.get("/contracts", { params }),
        client.get("/rooms"),
      ]);
      setData(res.data.contracts || []);
      setTotal(res.data.total || 0);
      setRooms(roomsRes.data.rooms || []);
    } catch (err: unknown) {
      setData([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) message.error("Bạn không có quyền truy cập");
      else message.error("Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, filters.status, filters.room]);

  const handleTerminate = (c: Contract) => {
    Modal.confirm({
      title: "Chấm dứt hợp đồng",
      content: `Xác nhận chấm dứt hợp đồng ${c.contractNumber}? Sinh viên sẽ bị trả phòng và không thể hoàn tác.`,
      okText: "Chấm dứt",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await contractsApi.terminate(c._id);
          message.success("Đã chấm dứt hợp đồng");
          load();
        } catch (err: unknown) {
          message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
        }
      },
    });
  };

  const handleExtend = async (v: { endDate: dayjs.Dayjs }) => {
    if (!extendModal) return;
    try {
      await contractsApi.extend(extendModal._id, v.endDate.format("YYYY-MM-DD"));
      message.success("Đã gia hạn hợp đồng");
      setExtendModal(null);
      form.resetFields();
      load();
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
    }
  };

  const activeCount = data.filter((c) => c.status === "active").length;
  const terminatedCount = data.filter((c) => c.status === "terminated").length;

  const columns = [
    {
      title: "Số HĐ",
      dataIndex: "contractNumber",
      key: "contractNumber",
      width: 140,
      render: (v: string) => <strong style={{ fontFamily: "monospace" }}>{v || "-"}</strong>,
    },
    {
      title: "Sinh viên",
      key: "user",
      width: 160,
      render: (_: unknown, r: Contract) => (r.user ? (typeof r.user === "object" ? (r.user as { fullName?: string }).fullName : r.user) : "-"),
    },
    {
      title: "Phòng",
      key: "room",
      width: 100,
      render: (_: unknown, r: Contract) => {
        if (!r.room) return "-";
        const room = typeof r.room === "object" ? r.room : null;
        const area = room?.area && typeof room.area === "object" ? room.area.name : "";
        return room ? `${room.roomNumber}${area ? ` (${area})` : ""}` : "-";
      },
    },
    {
      title: "Từ ngày",
      dataIndex: "startDate",
      key: "startDate",
      width: 110,
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-"),
    },
    {
      title: "Đến ngày",
      dataIndex: "endDate",
      key: "endDate",
      width: 110,
      render: (d: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "-"),
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
      width: 220,
      fixed: "right" as const,
      render: (_: unknown, r: Contract) => (
        <Space wrap size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
            Chi tiết
          </Button>
          {r.status === "pending_payment" && (
            <Button
              type="link"
              size="small"
              onClick={async () => {
                try {
                  await contractsApi.confirmPayment(r._id);
                  message.success("Đã xác nhận. Hợp đồng có hiệu lực.");
                  load();
                } catch (err: unknown) {
                  message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
                }
              }}
            >
              Xác nhận
            </Button>
          )}
          {r.status === "active" && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CalendarOutlined />}
                onClick={() => {
                  setExtendModal(r);
                  form.setFieldsValue({ endDate: dayjs(r.endDate) });
                }}
              >
                Gia hạn
              </Button>
              <Button type="link" danger size="small" icon={<StopOutlined />} onClick={() => handleTerminate(r)}>
                Chấm dứt
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý hợp đồng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Xem, gia hạn, chấm dứt và xác nhận hợp đồng
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic
              title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Hợp đồng đang hiệu lực</span>}
              value={activeCount}
              suffix="hợp đồng"
              valueStyle={{ color: "#fff", fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Đã chấm dứt" value={terminatedCount} suffix="hợp đồng" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng hợp đồng" value={total} suffix="hợp đồng" />
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
            onChange={(v) => {
              setFilters((f) => ({ ...f, status: v }));
              setPage(1);
            }}
          >
            <Select.Option value="pending_payment">Chưa hiệu lực (chờ ký + xác nhận )</Select.Option>
            <Select.Option value="active">Có hiệu lực</Select.Option>
            <Select.Option value="expired">Hết hạn</Select.Option>
            <Select.Option value="terminated">Đã chấm dứt</Select.Option>
          </Select>
          <Select
            placeholder="Lọc theo phòng"
            allowClear
            style={{ width: 180 }}
            value={filters.room}
            onChange={(v) => {
              setFilters((f) => ({ ...f, room: v }));
              setPage(1);
            }}
            showSearch
            optionFilterProp="children"
          >
            {rooms.map((r) => (
              <Select.Option key={r._id} value={r._id}>
                Phòng {r.roomNumber} {r.area?.name ? `- ${r.area.name}` : ""}
              </Select.Option>
            ))}
          </Select>
          <Button
            onClick={() => {
              setFilters({});
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            icon={<DownloadOutlined />}
            onClick={() =>
              exportToExcel(
                data.map((c) => ({
                  "Số HĐ": c.contractNumber,
                  "Sinh viên": c.user && typeof c.user === "object" ? (c.user as { fullName?: string }).fullName : "-",
                  "Phòng": c.room && typeof c.room === "object" ? (c.room as { roomNumber?: string }).roomNumber : "-",
                  "Từ ngày": c.startDate ? new Date(c.startDate).toLocaleDateString("vi-VN") : "-",
                  "Đến ngày": c.endDate ? new Date(c.endDate).toLocaleDateString("vi-VN") : "-",
                  "Trạng thái": statusMap[c.status]?.text || c.status,
                })),
                "danh-sach-hop-dong",
                "Hợp đồng",
              )
            }
          >
            Xuất Excel
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize: 10,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t} hợp đồng`,
          }}
          scroll={{ x: 900 }}
          size="middle"
        />
      </Card>

      <Modal
        title={`Chi tiết hợp đồng ${detailModal?.contractNumber || ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>
            Đóng
          </Button>,
          detailModal?.status === "active" && (
            <Button
              key="terminate"
              danger
              icon={<StopOutlined />}
              onClick={() => {
                handleTerminate(detailModal);
                setDetailModal(null);
              }}
            >
              Chấm dứt hợp đồng
            </Button>
          ),
        ].filter(Boolean) as React.ReactNode[]}
        width={900}
      >
        {detailModal && (() => {
          const u = typeof detailModal.user === "object" ? (detailModal.user as User) : null;
          const studentName = u?.fullName || "-";
          const studentGender = u?.gender || "-";
          const studentIdVal = u?.studentId || "-";
          const citizenId = u?.citizenId || "-";
          const dateOfBirth = u?.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString("vi-VN") : "-";
          const ethnicity = "-";
          return (
            <div style={{ maxHeight: "70vh", overflowY: "auto", lineHeight: 1.8, paddingRight: 6 }}>
              <h3 style={{ textAlign: "center", marginBottom: 4 }}>HỢP ĐỒNG THUÊ CHỖ Ở NỘI TRÚ</h3>
              <p style={{ marginBottom: 12, textAlign: "center" }}>
                <strong>Số hợp đồng:</strong> {detailModal.contractNumber || "-"}
              </p>

              <p><strong>BÊN CHO THUÊ (BÊN A):</strong> KÝ TÚC XÁ TRƯỜNG ĐẠI HỌC (ĐH)</p>
              <p><strong>Địa chỉ:</strong> {lessorAddress}</p>
              <p><strong>Điện thoại:</strong> {lessorPhone}</p>

              <p style={{ marginTop: 10 }}><strong>BÊN THUÊ (BÊN B):</strong></p>
              <p><strong>Họ và tên:</strong> {studentName} &nbsp;&nbsp;&nbsp; <strong>Nam/Nữ:</strong> {studentGender}</p>
              <p><strong>Mã SV:</strong> {studentIdVal} &nbsp;&nbsp;&nbsp; <strong>CCCD:</strong> {citizenId}</p>
              <p><strong>Ngày sinh:</strong> {dateOfBirth} &nbsp;&nbsp;&nbsp; <strong>Dân tộc:</strong> {ethnicity}</p>
              {u?.email ? <p><strong>Email:</strong> {u.email}</p> : null}
              {u?.phone ? <p><strong>SĐT:</strong> {u.phone}</p> : null}

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 1: NỘI DUNG THUÊ</strong></p>
              <p>
                Bên A đồng ý cho Bên B thuê 01 chỗ ở nội trú tại: Phòng{" "}
                <strong>{typeof detailModal.room === "object" ? detailModal.room?.roomNumber : "-"}</strong>, Tầng{" "}
                <strong>{typeof detailModal.room === "object" ? detailModal.room?.floor || "-" : "-"}</strong>, Nhà{" "}
                <strong>
                  {typeof detailModal.room === "object" && detailModal.room?.area && typeof detailModal.room.area === "object"
                    ? detailModal.room.area.name
                    : "-"}
                </strong>{" "}
                của KTX Trường ĐH.
              </p>
              <p>Bên B được sử dụng trang thiết bị tại phòng theo nội quy của Trường ĐH.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 2: CHI PHÍ VÀ THANH TOÁN</strong></p>
              <p>
                Giá thuê:{" "}
                <strong>
                  {typeof detailModal.room === "object" ? `${Number(detailModal.room?.price || 0).toLocaleString("vi-VN")} VNĐ/tháng` : "-"}
                </strong>
                . Tổng cộng:{" "}
                <strong>
                  {typeof detailModal.room === "object" ? `${(Number(detailModal.room?.price || 0) * 12).toLocaleString("vi-VN")} VNĐ` : "-"}
                </strong>
                .
              </p>
              <p>Tiền thế chấp tài sản: <strong>100.000 VNĐ/sinh viên</strong>.</p>
              <p>
                Thời hạn thuê: Từ ngày <strong>{new Date(detailModal.startDate).toLocaleDateString("vi-VN")}</strong> đến ngày{" "}
                <strong>{new Date(detailModal.endDate).toLocaleDateString("vi-VN")}</strong>.
              </p>
              <p>Phương thức thanh toán: Thanh toán trực tuyến qua tài khoản của Trường ĐH tại thời điểm nhận phòng.</p>
              <p>Tiền điện, nước: Thanh toán hàng tháng theo chỉ số công tơ và đơn giá quy định.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 3: TRÁCH NHIỆM CỦA SINH VIÊN</strong></p>
              <p>Chấp hành nghiêm chỉnh pháp luật, nội quy KTX và quy định về PCCC.</p>
              <p>Ở đúng vị trí được sắp xếp; không tự ý chuyển nhượng chỗ ở cho người khác.</p>
              <p>Giữ gìn vệ sinh, bảo quản tài sản công. Bồi thường nếu gây hư hỏng, mất mát.</p>
              <p>Thanh toán đầy đủ các khoản phí dịch vụ (điện, nước, gửi xe, wifi...) đúng hạn.</p>
              <p>Bàn giao phòng và chìa khóa ngay khi hết hạn hợp đồng hoặc nghỉ hè/Tết.</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 4: CHẤM DỨT HỢP ĐỒNG</strong></p>
              <p>
                Hợp đồng chấm dứt khi: Hết thời hạn; SV tự nguyện xin ra; SV tốt nghiệp/thôi học; hoặc SV vi phạm kỷ luật bị buộc ra khỏi KTX.
              </p>
              <p>(Lưu ý: Trường ĐH không hoàn trả phí nội trú nếu SV vi phạm kỷ luật hoặc chấm dứt hợp đồng sau 01 tháng).</p>

              <p style={{ marginTop: 10 }}><strong>ĐIỀU 5: ĐIỀU KHOẢN CHUNG</strong></p>
              <p>
                Mọi hư hỏng tài sản hoặc nợ phí sẽ được trừ vào tiền thế chấp. Sau khi hoàn tất thủ tục trả phòng, Trường ĐH sẽ hoàn trả lại tiền thế chấp cho sinh viên.
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <div style={{ textAlign: "center", width: "48%" }}>
                  <strong>ĐẠI DIỆN BÊN B</strong>
                  <div>(Ký, ghi rõ họ tên)</div>
                  <div style={{ marginTop: 16, minHeight: 24 }}>
                    {detailModal.signedAt
                      ? `${studentName} - Đã ký ngày ${new Date(detailModal.signedAt).toLocaleString("vi-VN")}`
                      : "Chưa ký"}
                  </div>
                </div>
                <div style={{ textAlign: "center", width: "48%" }}>
                  <strong>ĐẠI DIỆN BÊN A</strong>
                  <div>(Ký, ghi rõ họ tên)</div>
                  <div style={{ marginTop: 16, minHeight: 24 }}>
                    {detailModal.status === "active" ? "Đã ký - Hợp đồng có hiệu lực" : "Chờ admin xác nhận"}
                  </div>
                </div>
              </div>

              <p style={{ marginTop: 16 }}>
                <strong>Trạng thái hiện tại:</strong>{" "}
                <Tag color={statusMap[detailModal.status]?.color}>{statusMap[detailModal.status]?.text}</Tag>
              </p>
              {detailModal.status === "pending_payment" && (
                <p style={{ color: "#ad6800" }}>
                  <strong>Hướng dẫn:</strong>{" "}
                  {detailModal.signedAt
                    ? "Sinh viên đã ký xác nhận, chờ admin xác nhận để hợp đồng có hiệu lực."
                    : "Sinh viên chưa ký xác nhận hợp đồng."}
                </p>
              )}
              {detailModal.terms ? (
                <div style={{ marginTop: 16 }}>
                  <strong>Điều khoản bổ sung / ghi chú:</strong>
                  <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{detailModal.terms}</p>
                </div>
              ) : null}
            </div>
          );
        })()}
      </Modal>

      <Modal
        title="Gia hạn hợp đồng"
        open={!!extendModal}
        onCancel={() => {
          setExtendModal(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        {extendModal && (
          <div style={{ marginBottom: 16 }}>
            <p>
              <strong>Số HĐ:</strong> {extendModal.contractNumber}
            </p>
            <p>
              <strong>Hết hạn hiện tại:</strong> {new Date(extendModal.endDate).toLocaleDateString("vi-VN")}
            </p>
          </div>
        )}
        <Form form={form} onFinish={handleExtend} layout="vertical">
          <Form.Item name="endDate" label="Ngày kết thúc mới" rules={[{ required: true }]}>
            <DatePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              disabledDate={(d) => (extendModal ? d.isBefore(dayjs(extendModal.endDate), "day") : false)}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Xác nhận gia hạn
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ContractsPage;
