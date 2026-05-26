/**
 * Sinh viên — khai báo hư hỏng (UI đồng bộ trang admin).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Form, Input, Modal, Select, Upload } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { billsApi, contractsApi, maintenanceReportsApi } from "../../api";
import MaintenanceReportStatsCards from "../../components/admin/maintenance/MaintenanceReportStatsCards";
import MaintenanceReportFilterBar, {
  type MaintenanceFilterState,
} from "../../components/admin/maintenance/MaintenanceReportFilterBar";
import MaintenanceReportDetailModal from "../../components/admin/maintenance/MaintenanceReportDetailModal";
import MaintenanceReportStudentTable from "../../components/client/maintenance/MaintenanceReportStudentTable";
import { requestCodeDisplay } from "../../utils/maintenanceReportDisplay";
import type { MaintenanceReport, Room } from "../../types";

const CUSTOM_ITEM = "__custom__";

type RoomFacilityRow = {
  _id: string;
  quantity: number;
  facility?: { name?: string; code?: string } | string;
  source?: "inventory" | "amenity";
};

const LIMIT = 15;

type ContractRow = {
  _id: string;
  status: string;
  room?: Room | string;
};

function roomLabel(room: Room | string | undefined): string {
  if (!room || typeof room === "string") return "";
  const area = room.area && typeof room.area === "object" ? room.area.name : "";
  return `Phòng ${room.roomNumber || "—"}${area ? ` — ${area}` : ""}`;
}

function matchesFilters(
  r: MaintenanceReport,
  filters: MaintenanceFilterState,
  search: string,
): boolean {
  const st = filters.status || "all";
  if (st !== "all" && r.status !== st) return false;

  if (filters.date && r.createdAt) {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (key !== filters.date) return false;
  } else if (filters.month && filters.year && r.createdAt) {
    const d = new Date(r.createdAt);
    if (d.getMonth() + 1 !== filters.month || d.getFullYear() !== filters.year) return false;
  }

  if (search) {
    const q = search.toLowerCase();
    const code = requestCodeDisplay(r).toLowerCase();
    const desc = String(r.description || "").toLowerCase();
    if (!code.includes(q) && !desc.includes(q)) return false;
  }
  return true;
}

const DamageReportPage: React.FC = () => {
  const { message } = App.useApp();
  const [allItems, setAllItems] = useState<MaintenanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRoomLabel, setCurrentRoomLabel] = useState("");

  const [filters, setFilters] = useState<MaintenanceFilterState>({ status: "all" });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{
    itemKey: string;
    damagedItemLabel?: string;
    description: string;
  }>();
  const [roomFacilities, setRoomFacilities] = useState<RoomFacilityRow[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const itemKeyWatch = Form.useWatch("itemKey", createForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<MaintenanceReport | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.status, filters.month, filters.year, filters.date]);

  const loadRoom = useCallback(() => {
    contractsApi
      .getMy()
      .then((res) => {
        const rows = (res.data || []) as ContractRow[];
        const active = rows.filter((c) => c.status === "active" || c.status === "pending_payment");
        setCurrentRoomLabel(roomLabel(active[0]?.room as Room | undefined));
      })
      .catch(() => setCurrentRoomLabel(""));
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await maintenanceReportsApi.getMy();
      setAllItems(Array.isArray(data) ? (data as MaintenanceReport[]) : []);
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Lỗi tải dữ liệu" : "Lỗi tải dữ liệu",
      );
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadFacilities = useCallback(async () => {
    setFacilitiesLoading(true);
    try {
      const { data } = await maintenanceReportsApi.getRoomFacilities();
      const body = data as { items?: RoomFacilityRow[] };
      setRoomFacilities(Array.isArray(body.items) ? body.items : []);
    } catch (e) {
      setRoomFacilities([]);
      if (isAxiosError(e)) {
        message.warning(
          (e.response?.data as { message?: string })?.message ||
            "Không tải được danh sách CSVC phòng — bạn vẫn có thể chọn «Khác (nhập tay)»",
        );
      }
    } finally {
      setFacilitiesLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadRoom();
    void loadFacilities();
  }, [loadRoom, loadFacilities]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredItems = useMemo(
    () => allItems.filter((r) => matchesFilters(r, filters, debouncedSearch)),
    [allItems, filters, debouncedSearch],
  );

  const summary = useMemo(
    () => ({
      totalAll: allItems.length,
      pendingCount: allItems.filter((r) => r.status === "pending").length,
      processingCount: allItems.filter((r) => r.status === "processing").length,
      resolvedCount: allItems.filter((r) => r.status === "resolved").length,
      cancelledCount: allItems.filter((r) => r.status === "cancelled").length,
    }),
    [allItems],
  );

  const pageItems = useMemo(() => {
    const start = (page - 1) * LIMIT;
    return filteredItems.slice(start, start + LIMIT);
  }, [filteredItems, page]);

  const openView = async (r: MaintenanceReport) => {
    setSelected(r);
    setDetailOpen(true);
    try {
      const { data } = await maintenanceReportsApi.getById(r._id);
      setSelected(data as MaintenanceReport);
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Không tải được chi tiết" : "Lỗi",
      );
    }
  };

  const payCompensation = async (r: MaintenanceReport) => {
    const billId = r.compensationBill?._id;
    if (!billId) {
      message.error("Chưa có hóa đơn bồi thường. Vui lòng tải lại trang hoặc liên hệ BQL.");
      return;
    }
    setPayingId(r._id);
    try {
      const res = await billsApi.payOnline(billId);
      const paymentUrl = (res.data as { paymentUrl?: string } | undefined)?.paymentUrl;
      if (!paymentUrl) {
        message.error("Không tạo được đường dẫn thanh toán VNPay.");
        return;
      }
      window.location.href = paymentUrl;
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Thanh toán thất bại" : "Lỗi",
      );
    } finally {
      setPayingId(null);
    }
  };

  const cancelReport = async (r: MaintenanceReport) => {
    try {
      await maintenanceReportsApi.cancel(r._id);
      message.success("Đã hủy khai báo");
      if (selected?._id === r._id) {
        setDetailOpen(false);
        setSelected(null);
      }
      await loadReports();
    } catch (e) {
      message.error(
        isAxiosError(e) ? (e.response?.data as { message?: string })?.message || "Hủy thất bại" : "Lỗi",
      );
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onPickImage = async (file: File) => {
    if (formImages.length >= 10) return;
    if (!file.type.startsWith("image/")) {
      message.warning("Chỉ chọn file ảnh");
      return;
    }
    const url = await readFileAsDataUrl(file);
    setFormImages((prev) => [...prev, url].slice(0, 10));
  };

  const submitCreate = async () => {
    try {
      const vals = await createForm.validateFields();
      setSubmitting(true);
      const payload: {
        facilityLocationId?: string;
        damagedItemLabel?: string;
        description: string;
        images?: string[];
      } = {
        description: vals.description.trim(),
        images: formImages.length ? formImages : undefined,
      };
      if (vals.itemKey === CUSTOM_ITEM) {
        payload.damagedItemLabel = String(vals.damagedItemLabel || "").trim();
      } else if (String(vals.itemKey).startsWith("amenity:")) {
        payload.damagedItemLabel = decodeURIComponent(String(vals.itemKey).slice("amenity:".length));
      } else {
        payload.facilityLocationId = vals.itemKey;
      }
      await maintenanceReportsApi.create(payload);
      message.success("Đã gửi khai báo hư hỏng");
      setCreateOpen(false);
      createForm.resetFields();
      setFormImages([]);
      await loadReports();
      loadRoom();
    } catch (e) {
      if (isAxiosError(e)) {
        message.error((e.response?.data as { message?: string })?.message || "Gửi khai báo thất bại");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setFilters({ status: "all" });
    setSearchInput("");
  };

  const canCreate = !!currentRoomLabel;

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Khai báo hư hỏng</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Chọn thiết bị/vật tư hỏng, mô tả tình trạng và đính kèm ảnh. Ban quản lý sẽ kiểm tra và cập nhật tiến độ.
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canCreate}
          onClick={() => {
            createForm.setFieldsValue({ itemKey: undefined, damagedItemLabel: "", description: "" });
            setFormImages([]);
            void loadFacilities();
            setCreateOpen(true);
          }}
        >
          Tạo yêu cầu
        </Button>
      </div>

      {!canCreate ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Chưa có hợp đồng phòng hiệu lực"
          description="Bạn cần hợp đồng active để gửi khai báo. Phòng sẽ được gắn tự động theo hợp đồng."
        />
      ) : (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Phòng hiện tại: ${currentRoomLabel}`}
          description="Phòng gửi kèm tự động theo hợp đồng đang hiệu lực."
        />
      )}

      <MaintenanceReportStatsCards summary={summary} />

      <Card style={{ borderRadius: 12 }}>
        <MaintenanceReportFilterBar
          filters={filters}
          searchInput={searchInput}
          onFiltersChange={setFilters}
          onSearchChange={setSearchInput}
          onPageReset={() => setPage(1)}
          onClearFilters={clearFilters}
          onReload={() => void loadReports()}
          searchPlaceholder="Mã yêu cầu, mô tả"
        />

        <MaintenanceReportStudentTable
          items={pageItems}
          loading={loading}
          page={page}
          limit={LIMIT}
          total={filteredItems.length}
          onPageChange={setPage}
          onView={(r) => void openView(r)}
          onCancel={(r) => void cancelReport(r)}
          onPayCompensation={(r) => void payCompensation(r)}
          payingId={payingId}
        />
      </Card>

      <Modal
        title="Tạo khai báo hư hỏng"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okText="Gửi khai báo"
        cancelText="Hủy"
        confirmLoading={submitting}
        destroyOnClose
        width={560}
      >
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
          Phòng gửi kèm: <strong>{currentRoomLabel || "—"}</strong>
        </p>
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="itemKey"
            label="Thiết bị / vật tư hỏng"
            rules={[{ required: true, message: "Vui lòng chọn thiết bị hoặc vật tư" }]}
          >
            <Select
              loading={facilitiesLoading}
              placeholder="Chọn từ danh sách CSVC phòng"
              showSearch
              optionFilterProp="label"
              options={[
                ...roomFacilities.map((row) => {
                  const fac = typeof row.facility === "object" ? row.facility : null;
                  const name = fac?.name || "CSVC";
                  return {
                    value: row._id,
                    label: row.quantity > 1 ? `${name} (SL ${row.quantity})` : name,
                  };
                }),
                { value: CUSTOM_ITEM, label: "Khác (nhập tay)" },
              ]}
            />
          </Form.Item>
          {itemKeyWatch === CUSTOM_ITEM && (
            <Form.Item
              name="damagedItemLabel"
              label="Tên thiết bị / vật tư"
              rules={[{ required: true, message: "Vui lòng nhập tên" }, { min: 2 }]}
            >
              <Input placeholder="Ví dụ: Công tắc đèn, Vòi nước lavabo…" maxLength={200} />
            </Form.Item>
          )}
          <Form.Item
            name="description"
            label="Mô tả tình trạng"
            rules={[{ required: true, message: "Vui lòng nhập mô tả" }]}
          >
            <Input.TextArea rows={4} placeholder="Mô tả vị trí, hiện tượng, thời điểm xảy ra…" maxLength={4000} showCount />
          </Form.Item>
          <Form.Item label="Ảnh minh họa (tuỳ chọn, tối đa 10)">
            <Upload
              listType="picture-card"
              accept="image/*"
              multiple
              beforeUpload={(file) => {
                void onPickImage(file);
                return false;
              }}
              onRemove={(file) => {
                const idx = Number(file.uid);
                if (!Number.isNaN(idx)) {
                  setFormImages((prev) => prev.filter((_, i) => i !== idx));
                }
              }}
              fileList={formImages.map((url, i) => ({
                uid: String(i),
                name: `image-${i + 1}`,
                status: "done" as const,
                url,
              }))}
            >
              {formImages.length < 10 && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>Tải ảnh</div>
        </div>
      )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <MaintenanceReportDetailModal
        open={detailOpen}
        mode="view"
        report={selected}
        submitting={false}
        onClose={() => {
          setDetailOpen(false);
          setSelected(null);
        }}
        onCancelRequest={(r) => void cancelReport(r)}
        onPayCompensation={(r) => void payCompensation(r)}
        payingCompensation={!!selected && payingId === selected._id}
        viewerRole="student"
      />
    </div>
  );
};

export default DamageReportPage;
