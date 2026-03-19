import React from "react";
import { Row, Col, Card, Typography, Button } from "antd";
import { HomeOutlined, UnorderedListOutlined, FileAddOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title, Paragraph } = Typography;

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, #1890ff 0%, #096dd9 100%)",
          padding: 60,
          borderRadius: 8,
          marginBottom: 32,
          color: "white",
          textAlign: "center",
        }}
      >
        <Title level={1} style={{ color: "white", marginBottom: 16 }}>
          KTX FDORM
        </Title>
        <Paragraph style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", maxWidth: 600, margin: "0 auto" }}>
          Hệ thống quản lý KTX FDORM hiện đại, tiện lợi. Đăng ký ở ký túc xá trực tuyến, quản lý hợp đồng và thanh toán hóa đơn dễ dàng.
        </Paragraph>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/rooms")} style={{ textAlign: "center", cursor: "pointer" }}>
            <HomeOutlined style={{ fontSize: 48, color: "#1890ff", marginBottom: 16 }} />
            <Title level={4}>Xem phòng trống</Title>
            <Paragraph>Tìm kiếm và xem thông tin các phòng còn trống phù hợp với bạn</Paragraph>
            <Button type="primary">Xem danh sách</Button>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/rooms")} style={{ textAlign: "center", cursor: "pointer" }}>
            <FileAddOutlined style={{ fontSize: 48, color: "#52c41a", marginBottom: 16 }} />
            <Title level={4}>Đăng ký ở KTX FDORM</Title>
            <Paragraph>Gửi đơn đăng ký để được xét duyệt và sắp xếp phòng</Paragraph>
            <Button type="primary" ghost>Đăng ký ngay</Button>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card hoverable onClick={() => navigate("/my-bills")} style={{ textAlign: "center", cursor: "pointer" }}>
            <UnorderedListOutlined style={{ fontSize: 48, color: "#faad14", marginBottom: 16 }} />
            <Title level={4}>Tra cứu hóa đơn</Title>
            <Paragraph>Xem và thanh toán hóa đơn tiền phòng, điện nước</Paragraph>
            <Button type="primary" ghost>Xem hóa đơn</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default HomePage;
