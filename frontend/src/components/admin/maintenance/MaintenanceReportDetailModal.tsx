import React, { useEffect } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Radio, Space, Tag, Image } from "antd";
import {
  DAMAGE_CAUSE_LABEL,
  damagedItemDisplay,
  formatMoney,
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
  /** SV: chỉ xem tiến độ, không thấy nguyên nhân / phí đền bù */
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

          {isStudent && report.status === "resolved" && report.hasCompensationBill && (
            <Alert
              type="warning"
              showIcon
              message="Đơn đã xử lý"
              description="Ban quản lý đã kết luận và có thể đã tạo hóa đơn liên quan. Vui lòng xem mục Hóa đơn của tôi."
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
                    min={0}
                    step={10000}
                    style={{ width: "100%" }}
                    disabled={damageCause === "natural_wear"}
                    placeholder={damageCause === "natural_wear" ? "Khóa — hao mòn tự nhiên" : "Nhập số tiền đền bù"}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
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
          ) : (
            <Alert
              type="info"
              showIcon
              message="Bạn chỉ xem được tiến độ xử lý"
              description="Nguyên nhân và phí đền bù do Ban quản lý xác định sau kiểm tra — không hiển thị với sinh viên."
            />
          )}
        </Space>
      ) : null}
    </Modal>
  );
};

export default MaintenanceReportDetailModal;
