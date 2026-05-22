import React, { useEffect } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Tag, Image } from "antd";
import {
  DAMAGE_CAUSE_LABEL,
  formatMoney,
  incidentAreaLabel,
  requestCodeDisplay,
  RESOLUTION_LABEL,
  SEVERITY_LABEL,
  STATUS_MAP,
} from "../../../utils/maintenanceReportDisplay";
import { formatDateTimeVi } from "../../../utils/formatDateTime";
import type { MaintenanceReport, Room, User } from "../../../types";

export type ProcessFormValues = {
  severity: string;
  damageCause: string;
  resolutionType: "maintenance" | "compensation";
  compensationAmount?: number;
  maintenanceStatus?: string;
  adminNote?: string;
};

type Props = {
  open: boolean;
  mode: "view" | "process";
  report: MaintenanceReport | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit?: (values: ProcessFormValues) => void;
};

const MaintenanceReportDetailModal: React.FC<Props> = ({
  open,
  mode,
  report,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm<ProcessFormValues>();

  useEffect(() => {
    if (!open || !report) return;
    form.setFieldsValue({
      severity: report.severity || "medium",
      damageCause: report.damageCause || undefined,
      resolutionType: report.resolutionType === "compensation" ? "compensation" : "maintenance",
      compensationAmount: report.compensationAmount || undefined,
      maintenanceStatus: report.maintenanceStatus || "scheduled",
      adminNote: report.adminNote || "",
    });
  }, [open, report, form]);

  const user = typeof report?.user === "object" && report.user ? (report.user as User) : null;
  const room = typeof report?.room === "object" && report.room ? (report.room as Room) : null;
  const resolutionType = Form.useWatch("resolutionType", form);

  return (
    <Modal
      open={open}
      title={mode === "process" ? "Xử lý khai báo hư hỏng" : "Chi tiết khai báo hư hỏng"}
      onCancel={onClose}
      width={720}
      destroyOnClose
      footer={
        mode === "view"
          ? [
              <Button key="close" onClick={onClose}>
                Đóng
              </Button>,
            ]
          : undefined
      }
      okText={mode === "process" ? "Xác nhận xử lý" : undefined}
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
            <div>
              <strong>Sinh viên:</strong> {user?.fullName || "—"} ({user?.studentId || "—"})
            </div>
            <div>
              <strong>Phòng:</strong> {room?.roomNumber || "—"}
            </div>
            <div>
              <strong>Khu vực HH:</strong> {incidentAreaLabel(report.incidentType)}
            </div>
            <div>
              <strong>Ngày khai báo:</strong> {formatDateTimeVi(report.createdAt)}
            </div>
          </div>
          <div>
            <strong>Mô tả:</strong>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{report.description}</p>
          </div>
          {(report.images?.length || 0) > 0 && (
            <div>
              <strong>Ảnh đính kèm:</strong>
              <Image.PreviewGroup>
                <Space wrap style={{ marginTop: 8 }}>
                  {report.images!.map((src, i) => (
                    <Image key={i} src={src} width={80} height={80} style={{ objectFit: "cover" }} />
                  ))}
                </Space>
              </Image.PreviewGroup>
            </div>
          )}

          {mode === "process" ? (
            <>
              <Alert
                type="info"
                showIcon
                message="Phân loại nghiệp vụ"
                description={
                  <>
                    <strong>Hỏng tự nhiên / CSVC xuống cấp</strong> → Yêu cầu bảo trì (không tạo hóa đơn).
                    <br />
                    <strong>Do sinh viên gây ra</strong> → Bồi thường (tự tạo hóa đơn «Bồi thường hư hỏng»).
                    <br />
                    Vi phạm kỷ luật (hút thuốc, gây gổ…) xử lý riêng tại module Vi phạm — không gộp ở đây.
                  </>
                }
              />
              <Form form={form} layout="vertical">
                <Form.Item name="severity" label="Mức độ hư hỏng" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: "light", label: SEVERITY_LABEL.light },
                      { value: "medium", label: SEVERITY_LABEL.medium },
                      { value: "heavy", label: SEVERITY_LABEL.heavy },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="damageCause" label="Nguyên nhân hư hỏng" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Space direction="vertical">
                      <Radio value="natural_wear">{DAMAGE_CAUSE_LABEL.natural_wear}</Radio>
                      <Radio value="student_caused">{DAMAGE_CAUSE_LABEL.student_caused}</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="resolutionType" label="Loại xử lý" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Space direction="vertical">
                      <Radio value="maintenance">{RESOLUTION_LABEL.maintenance}</Radio>
                      <Radio value="compensation">{RESOLUTION_LABEL.compensation}</Radio>
                    </Space>
                  </Radio.Group>
                </Form.Item>
                {resolutionType === "compensation" && (
                  <Form.Item
                    name="compensationAmount"
                    label="Chi phí bồi thường (đ)"
                    rules={[{ required: true, type: "number", min: 1 }]}
                  >
                    <InputNumber min={1} step={10000} style={{ width: "100%" }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} />
                  </Form.Item>
                )}
                {resolutionType === "maintenance" && (
                  <Form.Item name="maintenanceStatus" label="Trạng thái bảo trì">
                    <Select
                      options={[
                        { value: "scheduled", label: "Đã lên lịch sửa" },
                        { value: "in_progress", label: "Đang sửa chữa" },
                        { value: "completed", label: "Hoàn thành bảo trì" },
                      ]}
                    />
                  </Form.Item>
                )}
                <Form.Item name="adminNote" label="Ghi chú BQL">
                  <Input.TextArea rows={3} maxLength={4000} />
                </Form.Item>
              </Form>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {report.severity ? (
                <div>
                  <strong>Mức độ:</strong> {SEVERITY_LABEL[report.severity]}
                </div>
              ) : null}
              {report.damageCause ? (
                <div>
                  <strong>Nguyên nhân:</strong> {DAMAGE_CAUSE_LABEL[report.damageCause]}
                </div>
              ) : null}
              {report.resolutionType ? (
                <div>
                  <strong>Loại xử lý:</strong> {RESOLUTION_LABEL[report.resolutionType]}
                </div>
              ) : null}
              {report.resolutionType === "compensation" ? (
                <div>
                  <strong>Chi phí bồi thường:</strong> {formatMoney(report.compensationAmount)}
                </div>
              ) : null}
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
          )}
        </Space>
      ) : null}
    </Modal>
  );
};

export default MaintenanceReportDetailModal;
