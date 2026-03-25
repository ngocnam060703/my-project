import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Space, Spin, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contractsApi, registrationsApi, roomsApi } from "../../api";
import type { Contract, Room } from "../../types";

const { Title, Text } = Typography;

const RoomTransferPage: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [contractsRes, roomsRes] = await Promise.all([contractsApi.getMy(), roomsApi.getAll()]);
        const contracts = (contractsRes.data || []) as Contract[];
        const act = contracts.find((c) => c.status === "active" || c.status === "pending_payment") || null;
        setActiveContract(act);
        setRooms((roomsRes.data?.rooms || []) as Room[]);
        form.setFieldsValue({ room: searchParams.get("roomId") || undefined });
      } catch {
        message.error("Không tải được dữ liệu chuyển phòng");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [form, searchParams]);

  const currentRoom = activeContract?.room && typeof activeContract.room === "object" ? activeContract.room : null;
  const currentAreaId = currentRoom?.area && typeof currentRoom.area === "object" ? currentRoom.area._id : undefined;

  const candidateRooms = useMemo(
    () =>
      rooms.filter((r) => {
        const rid = String(r._id);
        const rArea = typeof r.area === "object" ? r.area?._id : r.area;
        if (!currentAreaId || String(rArea) !== String(currentAreaId)) return false;
        if (currentRoom && String(currentRoom._id) === rid) return false;
        return r.status !== "maintenance";
      }),
    [rooms, currentAreaId, currentRoom]
  );

  const selectedRoom = candidateRooms.find((r) => String(r._id) === String(form.getFieldValue("room") || ""));
  const overCapacity = !!selectedRoom && selectedRoom.currentOccupancy >= selectedRoom.capacity;

  const submit = async () => {
    try {
      if (!activeContract) {
        message.error("Bạn chưa là thành viên KTX nên không thể đăng ký chuyển phòng");
        return;
      }
      const values = await form.validateFields();
      setSubmitting(true);
      await registrationsApi.createTransfer({
        room: values.room,
        startDate: values.startDate?.format?.("YYYY-MM-DD"),
      });
      message.success("Đã gửi đơn chuyển phòng. Vui lòng chờ admin duyệt.");
      navigate("/student/my-registrations");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          Đăng ký chuyển phòng
        </Title>

        {!activeContract ? (
          <Alert
            type="warning"
            showIcon
            message="Bạn chưa là thành viên KTX"
            description="Chỉ sinh viên đang có hợp đồng nội trú mới được đăng ký chuyển phòng."
            action={
              <Button type="primary" onClick={() => navigate("/student/my-contracts")}>
                Xem hợp đồng
              </Button>
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Quy định chuyển phòng"
            description="Bạn chỉ được đăng ký chuyển phòng trong cùng khu hiện tại (theo phân khu giới tính)."
          />
        )}

        <Card title="Thông tin hiện tại" style={{ borderRadius: 12 }}>
          <p>
            <strong>Hợp đồng:</strong> {activeContract?.contractNumber || "-"}{" "}
            {activeContract?.status ? <Tag>{activeContract.status}</Tag> : null}
          </p>
          <p>
            <strong>Phòng hiện tại:</strong> {currentRoom?.roomNumber || "-"}
          </p>
          <p>
            <strong>Khu:</strong> {currentRoom?.area && typeof currentRoom.area === "object" ? currentRoom.area.name : "-"}
          </p>
        </Card>

        <Card title="Chọn phòng muốn chuyển đến" style={{ borderRadius: 12 }}>
          <Form form={form} layout="vertical">
            <Form.Item name="room" label="Phòng đích" rules={[{ required: true, message: "Vui lòng chọn phòng" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                disabled={!activeContract}
                placeholder={activeContract ? "Chọn phòng trong cùng khu" : "Bạn chưa đủ điều kiện chuyển phòng"}
                options={candidateRooms.map((r) => ({
                  value: r._id,
                  label: `Phòng ${r.roomNumber} - ${r.currentOccupancy}/${r.capacity} người - ${r.price?.toLocaleString("vi-VN")}đ`,
                }))}
              />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày mong muốn chuyển" initialValue={dayjs()}>
              <DatePicker style={{ width: "100%" }} disabledDate={(d) => !!d && d < dayjs().startOf("day")} />
            </Form.Item>
            {overCapacity && (
              <Alert
                style={{ marginBottom: 12 }}
                type="warning"
                showIcon
                message="Phòng đích đang đầy"
                description="Bạn vẫn có thể gửi đơn, admin sẽ xem xét duyệt hoặc từ chối."
              />
            )}
            <Button type="primary" onClick={submit} disabled={!activeContract} loading={submitting}>
              Gửi đơn chuyển phòng
            </Button>
            <Text type="secondary" style={{ marginLeft: 12 }}>
              Đơn sẽ có hiệu lực sau khi admin duyệt.
            </Text>
          </Form>
        </Card>
      </Space>
    </div>
  );
};

export default RoomTransferPage;
