import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Button, Tag, Spin, message, Form, Input, DatePicker, Rate, List } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { roomsApi, registrationsApi, ratingsApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Room } from "../../types";

const RoomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ratings, setRatings] = useState<{ ratings: { user?: { fullName?: string }; rating: number; comment?: string }[]; average: number } | null>(null);
  const [ratingForm] = Form.useForm();

  useEffect(() => {
    if (!id) return;
    roomsApi.getById(id).then((res) => setRoom(res.data)).catch(() => message.error("Không tải được phòng")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (!id) return;
    ratingsApi.getByRoom(id).then((res) => setRatings(res.data)).catch(() => {});
  }, [id]);

  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      if (!room) return;
      const startDate = values.startDate?.format?.("YYYY-MM-DD") || values.startDate;
      setSubmitting(true);
      await registrationsApi.create({
        room: room._id,
        semester: values.semester,
        schoolYear: values.schoolYear,
        startDate,
      });
      message.success("Đăng ký thành công! Đơn của bạn đang chờ duyệt.");
      navigate("/my-registrations");
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown[] })?.errorFields) return;
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Đăng ký thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !room) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;
  const available = room.currentOccupancy < room.capacity;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/rooms")} style={{ marginBottom: 16 }}>
        Quay lại
      </Button>
      <Card title={`Phòng ${room.roomNumber}`} extra={<Tag color={available ? "green" : "red"}>{available ? "Còn trống" : "Đã đầy"}</Tag>}>
        <Descriptions column={1}>
          <Descriptions.Item label="Khu">{typeof room.area === "object" ? room.area?.name : ""}</Descriptions.Item>
          <Descriptions.Item label="Sức chứa">{room.currentOccupancy}/{room.capacity}</Descriptions.Item>
          <Descriptions.Item label="Giá">{room.price?.toLocaleString("vi-VN")}đ/tháng</Descriptions.Item>
          <Descriptions.Item label="Tầng">{room.floor}</Descriptions.Item>
          <Descriptions.Item label="Mô tả">{room.description || "-"}</Descriptions.Item>
          {ratings && <Descriptions.Item label="Đánh giá"><Rate disabled allowHalf value={ratings.average} /> ({ratings.average}/5 - {ratings.ratings.length} đánh giá)</Descriptions.Item>}
        </Descriptions>
        {user && (
          <Card type="inner" title="Đánh giá phòng (chỉ sinh viên đang ở)" style={{ marginTop: 16 }}>
            <Form form={ratingForm} layout="inline" onFinish={async (v) => {
              try {
                await ratingsApi.create({ room: room._id, rating: v.rating, comment: v.comment });
                message.success("Đánh giá thành công");
                const res = await ratingsApi.getByRoom(room._id);
                setRatings(res.data);
                ratingForm.resetFields();
              } catch (e: unknown) {
                message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Lỗi");
              }
            }}>
              <Form.Item name="rating" rules={[{ required: true }]}><Rate /></Form.Item>
              <Form.Item name="comment"><Input placeholder="Nhận xét" style={{ width: 200 }} /></Form.Item>
              <Form.Item><Button type="primary" htmlType="submit">Gửi</Button></Form.Item>
            </Form>
          </Card>
        )}
        {ratings && ratings.ratings.length > 0 && (
          <Card type="inner" title="Đánh giá" style={{ marginTop: 16 }}>
            <List size="small" dataSource={ratings.ratings} renderItem={(r) => <List.Item><Rate disabled value={r.rating} /> {r.user?.fullName}: {r.comment || "-"}</List.Item>} />
          </Card>
        )}
        {available && user && (
          <Card type="inner" title="Đăng ký ở phòng này" style={{ marginTop: 16 }}>
            <Form form={form} layout="vertical" onFinish={handleRegister}>
              <Form.Item name="semester" label="Học kỳ" rules={[{ required: true, message: "Vui lòng nhập học kỳ" }]}>
                <Input placeholder="VD: 1" />
              </Form.Item>
              <Form.Item name="schoolYear" label="Năm học" rules={[{ required: true, message: "Vui lòng nhập năm học" }]}>
                <Input placeholder="VD: 2024-2025" />
              </Form.Item>
              <Form.Item
                name="startDate"
                label="Ngày bắt đầu ở"
                rules={[{ required: true, message: "Vui lòng chọn ngày bắt đầu" }]}
              >
                <DatePicker
                  style={{ width: "100%" }}
                  disabledDate={(current) => current && current < dayjs().startOf("day")}
                  placeholder="Chọn ngày"
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting}>Gửi đơn đăng ký</Button>
              </Form.Item>
            </Form>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default RoomDetailPage;
