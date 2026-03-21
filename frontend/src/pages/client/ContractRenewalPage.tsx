import React, { useState, useEffect } from "react";
import { Card, Form, Input, DatePicker, Button, message, Spin } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { contractsApi, registrationsApi } from "../../api";
import { isSchoolYearNotPast, schoolYearValidationMessage } from "../../utils/schoolYear";

const ContractRenewalPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [contract, setContract] = useState<{ room: { _id: string; roomNumber: string }; startDate: string; endDate: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    contractsApi.getById(id).then((res) => {
      const c = res.data;
      if (c.status !== "active") {
        message.warning("Chỉ có thể gia hạn hợp đồng đang hiệu lực");
        navigate("/my-contracts");
        return;
      }
      setContract(c);
      const nextYear = new Date(c.endDate);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      form.setFieldsValue({
        room: c.room._id,
        schoolYear: `${nextYear.getFullYear() - 1}-${nextYear.getFullYear()}`,
        semester: "1",
        startDate: dayjs(c.endDate).add(1, "day"),
      });
    }).catch(() => navigate("/my-contracts")).finally(() => setLoading(false));
  }, [id, form, navigate]);

  const onFinish = async (v: { room: string; semester: string; schoolYear: string; startDate: ReturnType<typeof dayjs> }) => {
    if (!isSchoolYearNotPast(v.schoolYear)) {
      message.error(schoolYearValidationMessage);
      return;
    }
    setSubmitting(true);
    try {
      await registrationsApi.create({
        room: v.room,
        semester: v.semester,
        schoolYear: v.schoolYear,
        startDate: v.startDate.format("YYYY-MM-DD"),
      });
      message.success("Đã gửi đơn gia hạn! Đơn của bạn đang chờ duyệt.");
      navigate("/my-registrations");
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !contract) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  return (
    <div>
      <Button type="link" onClick={() => navigate("/my-contracts")} style={{ marginBottom: 16 }}>← Quay lại</Button>
      <Card title="Gia hạn hợp đồng" style={{ maxWidth: 500, borderRadius: 12 }}>
        <p style={{ color: "#666", marginBottom: 16 }}>
          Quy trình gia hạn tương tự đăng ký nội trú. Bạn sẽ đăng ký lại phòng hiện tại.
        </p>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="room" hidden><Input /></Form.Item>
          <Form.Item label="Phòng hiện tại">
            <Input disabled value={`Phòng ${contract.room.roomNumber}`} />
          </Form.Item>
          <Form.Item name="semester" label="Học kỳ" rules={[{ required: true }]}>
            <Input placeholder="VD: 1" />
          </Form.Item>
          <Form.Item
            name="schoolYear"
            label="Năm học"
            rules={[
              { required: true },
              {
                validator: async (_, value: string) => {
                  if (!value?.trim()) return;
                  if (!isSchoolYearNotPast(value)) throw new Error(schoolYearValidationMessage);
                },
              },
            ]}
          >
            <Input placeholder="VD: 2025-2026" />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} disabledDate={(d) => d && d < dayjs(contract.endDate)} placeholder="Chọn ngày" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>Gửi đơn gia hạn</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ContractRenewalPage;
