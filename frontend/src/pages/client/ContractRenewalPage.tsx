import React, { useState, useEffect } from "react";
import { Card, Button, message, Spin, Select } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { contractsApi, dashboardApi, extensionPeriodsApi } from "../../api";

/** Trang legacy — chuyển hướng luồng gia hạn thống nhất qua request-extend (admin thấy trên /admin/contracts). */
const ContractRenewalPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contractNumber, setContractNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const run = async () => {
      try {
        const [settingRes, periodRes, contractRes] = await Promise.all([
          dashboardApi.getContractExtensionSetting(),
          extensionPeriodsApi.getActive(),
          contractsApi.getById(id),
        ]);

        const enabled = settingRes.data?.enable_contract_extension !== false;
        if (!enabled) {
          message.warning("Gia hạn hợp đồng hiện đang bị tắt trên Dashboard admin");
          navigate("/student/my-contracts");
          return;
        }

        if (!periodRes.data) {
          message.warning("Hiện chưa trong đợt gia hạn. Vui lòng chờ Ban quản lý mở đợt.");
          navigate("/student/my-contracts");
          return;
        }

        const c = contractRes.data;
        if (c.status !== "active") {
          message.warning("Chỉ có thể gia hạn hợp đồng đang hiệu lực");
          navigate("/student/my-contracts");
          return;
        }

        setContractNumber(c.contractNumber || "");
      } catch {
        navigate("/student/my-contracts");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id, navigate]);

  const submit = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await contractsApi.requestExtend(id, months);
      message.success("Đã gửi yêu cầu gia hạn. Admin sẽ duyệt trên hệ thống.");
      navigate("/student/my-contracts");
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: "block", margin: "40px auto" }} />;

  return (
    <div>
      <Button type="link" onClick={() => navigate("/student/my-contracts")} style={{ marginBottom: 16 }}>
        ← Quay lại
      </Button>
      <Card title="Gia hạn hợp đồng" style={{ maxWidth: 520, borderRadius: 12 }}>
        <p style={{ color: "#666", marginBottom: 16 }}>
          Gửi yêu cầu gia hạn hợp đồng <strong>{contractNumber || "—"}</strong>. Ban quản lý sẽ duyệt tại trang Hợp đồng lưu trú.
        </p>
        <label className="ant-form-item-label" style={{ display: "block", marginBottom: 8 }}>
          Số tháng gia hạn
        </label>
        <Select
          style={{ width: "100%", marginBottom: 16 }}
          value={months}
          onChange={setMonths}
          options={[
            { value: 3, label: "3 tháng" },
            { value: 6, label: "6 tháng" },
            { value: 12, label: "12 tháng" },
          ]}
        />
        <Button type="primary" loading={submitting} onClick={() => void submit()}>
          Gửi yêu cầu gia hạn
        </Button>
      </Card>
    </div>
  );
};

export default ContractRenewalPage;
