import React from "react";
import { Result, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const NotFoundPage: React.FC = () => {
  useDocumentTitle("Trang không tồn tại");
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Result
        status="404"
        title="404"
        subTitle="Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển."
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            Về trang chủ
          </Button>
        }
      />
    </div>
  );
};

export default NotFoundPage;
