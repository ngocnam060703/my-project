import React, { useEffect } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Radio, Space, Tag, Image } from "antd";
import {
  canPayMaintenanceCompensation,
  DAMAGE_CAUSE_LABEL,
  damagedItemDisplay,
  formatMoney,
  hasAdminRuling,
  vndAmountInputNumberProps,
  requestCodeDisplay,
  STATUS_MAP,
} from "../../../utils/maintenanceReportDisplay";
import { formatDateTimeVi } from "../../../utils/formatDateTime";
import type { MaintenanceDamageCause, MaintenanceReport, Room, User } from "../../../types";

export type ProcessFormValues = {
  damageCause: MaintenanceDamageCause;
  compensationAmount?: number;
  adminNote?: string;
};

type Props = {
  open: boolean;
  mode: "view" | "process";
  report: MaintenanceReport | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit?: (values: ProcessFormValues) => void;
  onCancelRequest?: (report: MaintenanceReport) => void;
  onPayCompensation?: (report: MaintenanceReport) => void;
  payingCompensation?: boolean;
  viewerRole?: "admin" | "student";
};

const MaintenanceReportDetailModal: React.FC<Props> = ({
  open,
  mode,
  report,
  submitting,
  onClose,
  onSubmit,
  onCancelRequest,
  onPayCompensation,
  payingCompensation = false,
  viewerRole = "admin",
}) => {
  const [form] = Form.useForm<ProcessFormValues>();
  const isStudent = viewerRole === "student";

  const user = typeof report?.user === "object" && report.user ? (report.user as User) : null;
  const room = typeof report?.room === "object" && report.room ? (report.room as Room) : null;
  const damageCause = Form.useWatch("damageCause", form);

  useEffect(() => {
    if (!open || !report || mode !== "process") return;
    form.setFieldsValue({
      damageCause: report.damageCause || undefined,
      compensationAmount: report.compensationAmount || undefined,
      adminNote: report.adminNote || "",
    });
  }, [open, report, mode, form]);

  useEffect(() => {
    if (damageCause === "natural_wear") {
      form.setFieldValue("compensationAmount", 0);
    }
  }, [damageCause, form]);

  return (
    <Modal
      open={open}
      title={
        mode === "process"
          ? "Kiểm tra & phán quyết hư hỏng"
          : isStudent
            ? "Tiến độ khai báo hư hỏng"
            : "Chi tiết khai báo hư hỏng"
      }
      onCancel={onClose}
      width={720}
      destroyOnClose
      footer={
        mode === "view"
          ? [
              report?.status === "pending" && onCancelRequest ? (
                <Button
                  key="cancel"
                  danger
                  onClick={() => report && onCancelRequest(report)}
                  style={{ marginRight: "auto" }}
                >
                  Hủy yêu cầu
                </Button>
              ) : null,
              isStudent && report && canPayMaintenanceCompensation(report) && onPayCompensation ? (
                <Button
                  key="vnpay"
                  type="primary"
                  loading={payingCompensation}
                  onClick={() => onPayCompensation(report)}
                  style={{ marginRight: "auto" }}
                >
                  Thanh toán VNPay
                </Button>
              ) : null,
              <Button key="close" onClick={onClose}>
                Đóng
              </Button>,
            ].filter(Boolean)
          : undefined
      }
      okText={mode === "process" ? "Xác nhận đã khắc phục" : undefined}
      cancelText="Hủy"
      confirmLoading={submitting}
      onOk={
        mode === "process"
          ? () => {
              form.validateFields().then((vals) => onSubmit?.(vals));
            }
          : undefined
      }
    >
      {report ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <strong>Mã yêu cầu:</strong> {requestCodeDisplay(report)}{" "}
            <Tag color={STATUS_MAP[report.status]?.color}>{STATUS_MAP[report.status]?.label}</Tag>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {!isStudent && (
              <div>
                <strong>Sinh viên:</strong> {user?.fullName || "—"} ({user?.studentId || "—"})
              </div>
            )}
            <div>
              <strong>Phòng:</strong> {room?.roomNumber || "—"}
            </div>
            <div>
              <strong>Thiết bị / vật tư hỏng:</strong> {damagedItemDisplay(report)}
            </div>
            <div>
              <strong>Ngày khai báo:</strong> {formatDateTimeVi(report.createdAt)}
            </div>
          </div>
          <div>
            <strong>Mô tả tình trạng:</strong>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{report.description}</p>
          </div>
          {(report.images?.length || 0) > 0 && (
            <div>
              <strong>Ảnh minh họa:</strong>
              <Image.PreviewGroup>
                <Space wrap style={{ marginTop: 8 }}>
                  {report.images!.map((src, i) => (
                    <Image key={i} src={src} width={80} height={80} style={{ objectFit: "cover" }} />
                  ))}
                </Space>
              </Image.PreviewGroup>
            </div>
          )}

          {isStudent && (report.status === "pending" || report.status === "processing") && (
            <Alert
              type="info"
              showIcon
              message="Đang chờ phán quyết của Ban quản lý"
              description="BQL sẽ kiểm tra thực tế và cập nhật nguyên nhân, ghi chú xử lý. Chưa có yêu cầu thanh toán cho đến khi có kết luận."
            />
          )}

          {isStudent && hasAdminRuling(report) && (
            <Alert
              type={report.damageCause === "student_caused" ? "warning" : "success"}
              showIcon
              message="Phán quyết của Ban quản lý"
              description={
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <div>
                    <strong>Nguyên nhân:</strong> {DAMAGE_CAUSE_LABEL[report.damageCause!]}
                  </div>
                  {report.adminRulingNote ? (
                    <div>
                      <strong>Ghi chú / lý do:</strong> {report.adminRulingNote}
                    </div>
                  ) : null}
                  {report.processedAt ? (
                    <div>
                      <strong>Ngày xử lý:</strong> {formatDateTimeVi(report.processedAt)}
                    </div>
                  ) : null}
                  {report.damageCause === "natural_wear" ? (
                    <div>Bạn không phải bồi thường theo kết luận này.</div>
                  ) : null}
                  {report.damageCause === "student_caused" ? (
                    <>
                      <div>
                        <strong>Phí bồi thường:</strong>{" "}
                        {formatMoney(report.compensationAmount ?? report.compensationBill?.total)}
                      </div>
                      {report.compensationBill?.billCode ? (
                        <div>
                          <strong>Mã hóa đơn:</strong> {report.compensationBill.billCode}
                        </div>
                      ) : null}
                      {report.compensationBill?.status === "paid" ? (
                        <div>Trạng thái thanh toán: đã thanh toán.</div>
                      ) : canPayMaintenanceCompensation(report) ? (
                        <div>Vui lòng thanh toán qua VNPay (nút bên dưới hoặc cột Thao tác).</div>
                      ) : null}
                    </>
                  ) : null}
                </Space>
              }
            />
          )}

          {mode === "process" ? (
            <>
              <Alert
                type="info"
                showIcon
                message="Phán quyết sau kiểm tra thực tế"
                description={
                  <>
                    <strong>Hao mòn tự nhiên / bảo trì CSVC</strong> — Phí đền bù = 0, không tạo hóa đơn.
                    <br />
                    <strong>Sinh viên làm hỏng</strong> — Nhập phí đền bù; hệ thống tự tạo hóa đơn nợ.
                  </>
                }
              />
              <Form form={form} layout="vertical">
                <Form.Item name="damageCause" label="Nguyên nhân hư hỏng" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Space direction="vertical">
                      <Radio value="natural_wear">{DAMAGE_CAUSE_LABEL.natural_wear}</Radio>
                      <Radio value="student_caused">{DAMAGE_CAUSE_LABEL.student_caused}</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
                <Form.Item
                  name="compensationAmount"
                  label="Phí đền bù (đ)"
                  rules={[
                    {
                      validator: (_, value) => {
                        const cause = form.getFieldValue("damageCause");
                        if (cause === "student_caused") {
                          const n = Math.round(Number(value) || 0);
                          if (n <= 0) return Promise.reject(new Error("Nhập phí đền bù lớn hơn 0"));
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <InputNumber
                    {...vndAmountInputNumberProps}
                    style={{ width: "100%" }}
                    disabled={damageCause === "natural_wear"}
                    placeholder={damageCause === "natural_wear" ? "Khóa — hao mòn tự nhiên" : "Nhập số tiền đền bù (VD: 500, 1500)"}
                  />
                </Form.Item>
                <Form.Item name="adminNote" label="Ghi chú BQL (tuỳ chọn)">
                  <Input.TextArea rows={3} maxLength={4000} />
                </Form.Item>
              </Form>
            </>
          ) : !isStudent ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {report.damageCause ? (
                <div>
                  <strong>Nguyên nhân:</strong> {DAMAGE_CAUSE_LABEL[report.damageCause]}
                </div>
              ) : null}
              <div>
                <strong>Phí đền bù:</strong>{" "}
                {report.damageCause === "student_caused"
                  ? formatMoney(report.compensationAmount)
                  : report.damageCause === "natural_wear"
                    ? "0đ (khóa)"
                    : "—"}
              </div>
              {report.processedAt ? (
                <div>
                  <strong>Ngày xử lý:</strong> {formatDateTimeVi(report.processedAt)}
                </div>
              ) : null}
              {report.adminNote ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>Ghi chú BQL:</strong> {report.adminNote}
                </div>
              ) : null}
            </div>
          ) : isStudent && report.status === "resolved" && !report.damageCause ? (
            <Alert
              type="info"
              showIcon
              message="Đã khắc phục"
              description="Ban quản lý đã đóng yêu cầu. Liên hệ BQL nếu cần thêm thông tin."
            />
          ) : null}
        </Space>
      ) : null}
    </Modal>
  );
};

export default MaintenanceReportDetailModal;
