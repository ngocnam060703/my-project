import React from "react";
import { Layout, Typography, Row, Col } from "antd";
import { MailOutlined, PhoneOutlined } from "@ant-design/icons";

const { Footer: AntFooter } = Layout;
const { Text } = Typography;

const Footer: React.FC = () => (
  <AntFooter style={{ textAlign: "center", background: "#134e4a", color: "rgba(255,255,255,0.85)", marginTop: "auto" }}>
    <Row gutter={[24, 16]} justify="center">
      <Col xs={24} md={8}>
        <Text strong style={{ color: "white", display: "block", marginBottom: 8 }}>KTX FDORM</Text>
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>Hệ thống quản lý ký túc xá chuyên nghiệp</Text>
      </Col>
      <Col xs={24} md={8}>
        <Text strong style={{ color: "white", display: "block", marginBottom: 8 }}>Liên hệ</Text>
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
          <PhoneOutlined /> 0123 456 789 &nbsp;|&nbsp; <MailOutlined /> ktx@fdorm.edu.vn
        </Text>
      </Col>
      <Col xs={24} md={8}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>© {new Date().getFullYear()} KTX FDORM. All rights reserved.</Text>
      </Col>
    </Row>
  </AntFooter>
);

export default Footer;
