import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Button, Tag, Spin, message, Form, Input, Rate, List } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { roomsApi, ratingsApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Room } from "../../types";

const RoomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
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

  if (loading || !room) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;
  const available = room.currentOccupancy < room.capacity;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/student/rooms")} style={{ marginBottom: 16 }}>
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
        {user && (
          <Card type="inner" title="Đăng ký nội trú" style={{ marginTop: 16 }}>
            <p>
              Sinh viên không đăng ký trực tiếp tại trang phòng. Vui lòng vào trang{" "}
              <strong>Đăng ký nội trú</strong> để hệ thống kiểm tra:
              đợt đăng ký đang mở và hồ sơ cá nhân đã đầy đủ.
            </p>
            <Button type="primary" onClick={() => navigate(`/student/dorm-registration?roomId=${room._id}`)}>
              Đăng ký nội trú phòng này
            </Button>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default RoomDetailPage;
