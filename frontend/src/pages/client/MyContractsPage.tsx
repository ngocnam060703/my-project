import React, { useState, useEffect } from "react";
import { Table, Tag, Spin, Empty, message, Button, Card, Row, Col, Statistic, Modal } from "antd";
import { ReloadOutlined, FileTextOutlined, EyeOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { authApi, contractsApi } from "../../api";
import type { Contract } from "../../types";

const statusMap: Record<string, { color: string; text: string }> = {
  pending_payment: { color: "gold", text: "Chưa hiệu lực (chờ admin xác nhận)" },
  active: { color: "green", text: "Có hiệu lực" },
  expired: { color: "default", text: "Hết hạn" },
  terminated: { color: "red", text: "Đã chấm dứt" },
};

const MyContractsPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<Contract | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    Promise.all([contractsApi.getMy(), authApi.getProfile()])
      .then(([contractsRes, profileRes]) => {
        setData(contractsRes.data || []);
        setProfile(profileRes.data || null);
      })
      .catch(() => message.error("Không tải được"))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = data.filter((c) => c.status === "active").length;

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  const columns = [
    { title: "Số HĐ", dataIndex: "contractNumber", key: "contractNumber", width: 140, render: (v: string) => <strong>{v || "-"}</strong> },
    { title: "Phòng", dataIndex: ["room", "roomNumber"], key: "room", width: 80 },
    { title: "Khu", dataIndex: ["room", "area", "name"], key: "area", width: 90 },
    { title: "Từ ngày", dataIndex: "startDate", key: "startDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Đến ngày", dataIndex: "endDate", key: "endDate", width: 100, render: (d: string) => new Date(d).toLocaleDateString("vi-VN") },
    { title: "Trạng thái", dataIndex: "status", key: "status", width: 120, render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag> },
    {
      title: "Hành động",
      key: "action",
      width: 180,
      render: (_: unknown, r: Contract) => (
        <>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>Chi tiết</Button>
          {r.status === "pending_payment" && !r.signedAt && (
            <Button
              type="link"
              size="small"
              onClick={async () => {
                try {
                  await contractsApi.sign(r._id);
                  message.success("Đã ký xác nhận. Chờ admin xác nhận.");
                  const res = await contractsApi.getMy();
                  setData(res.data || []);
                } catch (err: unknown) {
                  message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
                }
              }}
            >
              Ký xác nhận
            </Button>
          )}
          {r.status === "active" && (
            <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => navigate(`/student/contract-renewal/${r._id}`)}>Gia hạn</Button>
          )}
        </>
      ),
    },
  ];

  const studentName = String(profile?.fullName || "-");
  const studentGender = String(profile?.gender || "-");
  const studentId = String(profile?.studentId || "-");
  const citizenId = String(profile?.citizenId || "-");
  const dateOfBirth = profile?.dateOfBirth ? new Date(String(profile.dateOfBirth)).toLocaleDateString("vi-VN") : "-";
  const ethnicity = "-";
  const lessorAddress = "................................................................................................";
  const lessorPhone = ".............................................................................................";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}><FileTextOutlined /> Hợp đồng của tôi</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Xem hợp đồng thuê phòng và gia hạn khi cần</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card bordered={false} style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)", color: "white" }}>
            <Statistic title={<span style={{ color: "rgba(255,255,255,0.9)" }}>Đang hiệu lực</span>} value={activeCount} suffix="hợp đồng" valueStyle={{ color: "#fff", fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic title="Tổng hợp đồng" value={data.length} suffix="hợp đồng" />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        {data.length === 0 ? (
          <Empty description="Chưa có hợp đồng nào" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="_id"
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Tổng ${t} hợp đồng/năm` }}
            size="middle"
          />
        )}
      </Card>

      <Modal
        title={`Chi tiết HĐ ${detailModal?.contractNumber || ""}`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        width={900}
        footer={
          <>
            <Button onClick={() => setDetailModal(null)}>Đóng</Button>
            {detailModal?.status === "pending_payment" && !detailModal?.signedAt && (
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    await contractsApi.sign(detailModal._id);
                    message.success("Đã ký xác nhận. Chờ admin xác nhận.");
                    const res = await contractsApi.getMy();
                    setData(res.data || []);
                    setDetailModal((prev) => (prev ? { ...prev, signedAt: new Date().toISOString() } : prev));
                  } catch (err: unknown) {
                    message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
                  }
                }}
              >
                Ký xác nhận hợp đồng
              </Button>
            )}
            {detailModal?.status === "active" && (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => {
                  setDetailModal(null);
                  navigate(`/student/contract-renewal/${detailModal._id}`);
                }}
                style={{ marginLeft: 8 }}
              >
                Gia hạn
              </Button>
            )}
          </>
        }
      >
        {detailModal && (
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
            <p><strong>Mã SV:</strong> {studentId} &nbsp;&nbsp;&nbsp; <strong>CCCD:</strong> {citizenId}</p>
            <p><strong>Ngày sinh:</strong> {dateOfBirth} &nbsp;&nbsp;&nbsp; <strong>Dân tộc:</strong> {ethnicity}</p>

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
              Giá thuê: <strong>{typeof detailModal.room === "object" ? `${Number(detailModal.room?.price || 0).toLocaleString("vi-VN")} VNĐ/tháng` : "-"}</strong>.{" "}
              Tổng cộng: <strong>{typeof detailModal.room === "object" ? `${(Number(detailModal.room?.price || 0) * 12).toLocaleString("vi-VN")} VNĐ` : "-"}</strong>.
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
                  {detailModal.signedAt ? `${studentName} - Đã ký ngày ${new Date(detailModal.signedAt).toLocaleString("vi-VN")}` : "Chưa ký"}
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
                  ? "Bạn đã ký xác nhận, vui lòng chờ admin xác nhận để trở thành thành viên KTX."
                  : "Vui lòng bấm 'Ký xác nhận hợp đồng' để admin trở thành thành viên của ktx."}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MyContractsPage;
