/**
 * Module "Khai báo hư hỏng" (Maintenance / damage report) cho sinh viên.
 * REST: GET /api/my-reports, POST /api/reports, GET/DELETE /api/reports/:id
 * Phòng lấy tự động từ hợp đồng đang hiệu lực (backend). UI: Bootstrap 5.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { contractsApi, maintenanceReportsApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import type { MaintenanceReport, MaintenanceIncidentType, Room } from "../../types";

const INCIDENT_LABEL: Record<MaintenanceIncidentType, string> = {
  electricity: "Điện",
  water: "Nước",
  equipment: "Thiết bị",
  other: "Khác",
};

function statusBadge(st: string): { cls: string; label: string } {
  if (st === "resolved") return { cls: "text-bg-success", label: "Đã sửa xong" };
  if (st === "processing") return { cls: "text-bg-primary", label: "Đang xử lý" };
  return { cls: "text-bg-warning text-dark", label: "Chờ xử lý" };
}

type ContractRow = {
  _id: string;
  status: string;
  room?: Room | string;
};

function roomLabel(room: Room | string | undefined): string {
  if (!room || typeof room === "string") return "—";
  const area = room.area && typeof room.area === "object" ? room.area.name : "";
  return `Phòng ${room.roomNumber || "—"}${area ? ` — ${area}` : ""}`;
}

const DamageReportPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<MaintenanceReport[]>([]);
  const [currentRoomLabel, setCurrentRoomLabel] = useState<string>("");

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<MaintenanceIncidentType>("electricity");
  const [formDesc, setFormDesc] = useState("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<MaintenanceReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadContractsBanner = useCallback(() => {
    contractsApi
      .getMy()
      .then((res) => {
        const rows = (res.data || []) as ContractRow[];
        const active = rows.filter((c) => c.status === "active" || c.status === "pending_payment");
        const first = active[0];
        setCurrentRoomLabel(roomLabel(first?.room as Room | undefined));
      })
      .catch(() => setCurrentRoomLabel(""));
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await maintenanceReportsApi.getMy();
      setItems(Array.isArray(data) ? (data as MaintenanceReport[]) : []);
    } catch (e) {
      setErr(apiErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContractsBanner();
  }, [loadContractsBanner]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const pendingCount = useMemo(() => items.filter((r) => r.status === "pending").length, [items]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const next: string[] = [...formImages];
    const cap = 10;
    Array.from(files).forEach((file) => {
      if (next.length >= cap) return;
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || "");
        if (s && next.length < cap) {
          next.push(s);
          setFormImages([...next]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = formDesc.trim();
    if (!d) {
      setErr("Vui lòng nhập mô tả chi tiết.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await maintenanceReportsApi.create({
        type: formType,
        description: d,
        images: formImages.length ? formImages : undefined,
      });
      setShowForm(false);
      setFormDesc("");
      setFormImages([]);
      setFormType("electricity");
      await loadReports();
      loadContractsBanner();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await maintenanceReportsApi.getById(id);
      setDetail(data as MaintenanceReport);
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailLoading(false);
  };

  const askCancel = async (id: string) => {
    if (!window.confirm("Hủy khai báo này? Chỉ áp dụng khi trạng thái còn «Chờ xử lý».")) return;
    setErr(null);
    try {
      await maintenanceReportsApi.cancel(id);
      await loadReports();
      if (detail?._id === id) closeDetail();
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="container pb-5" style={{ maxWidth: 1040 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h4 className="mb-1">Khai báo hư hỏng</h4>
          <p className="text-muted small mb-0">
            Báo sự cố trong phòng (điện, nước, thiết bị…). BQL / kỹ thuật sẽ tiếp nhận và cập nhật trạng thái.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)} disabled={!currentRoomLabel || currentRoomLabel === "—"}>
          + Tạo yêu cầu
        </button>
      </div>

      {!currentRoomLabel || currentRoomLabel === "—" ? (
        <div className="alert alert-warning">
          Bạn chưa có hợp đồng phòng đang hiệu lực — không thể gửi khai báo. Sau khi có hợp đồng active, phòng sẽ được gắn tự động.
        </div>
      ) : (
        <div className="alert alert-light border small mb-3">
          <strong>Phòng hiện tại:</strong> {currentRoomLabel}
        </div>
      )}

      {err && (
        <div className="alert alert-danger py-2" role="alert">
          {err}
        </div>
      )}

      <div className="row g-2 mb-3">
        <div className="col-sm-6">
          <div className="card border-secondary h-100">
            <div className="card-body py-2">
              <div className="text-muted small">Chờ xử lý</div>
              <div className="fs-5 fw-semibold text-warning">{pendingCount}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6">
          <div className="card border-secondary h-100">
            <div className="card-body py-2">
              <div className="text-muted small">Tổng khai báo</div>
              <div className="fs-5 fw-semibold">{items.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Danh sách khai báo của tôi</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Ngày báo</th>
                <th>Loại sự cố</th>
                <th>Mô tả</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const st = statusBadge(r.status);
                const typeKey = r.incidentType as MaintenanceIncidentType;
                return (
                  <tr key={r._id}>
                    <td className="small text-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                    <td>{INCIDENT_LABEL[typeKey] || r.incidentType}</td>
                    <td className="small" style={{ maxWidth: 280 }}>
                      <span className="d-inline-block text-truncate w-100" title={r.description}>
                        {r.description}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-outline-primary btn-sm me-1" onClick={() => void openDetail(r._id)}>
                        Xem
                      </button>
                      {r.status === "pending" && (
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void askCancel(r._id)}>
                          Hủy
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    Chưa có khai báo nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: form tạo yêu cầu */}
      {showForm && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content">
              <form onSubmit={submitForm}>
                <div className="modal-header">
                  <h5 className="modal-title">Tạo khai báo hư hỏng</h5>
                  <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setShowForm(false)} />
                </div>
                <div className="modal-body">
                  <p className="small text-muted">Phòng gửi kèm tự động theo hợp đồng: {currentRoomLabel}</p>
                  <div className="mb-3">
                    <label className="form-label">Loại sự cố</label>
                    <select className="form-select" value={formType} onChange={(e) => setFormType(e.target.value as MaintenanceIncidentType)} required>
                      {(Object.keys(INCIDENT_LABEL) as MaintenanceIncidentType[]).map((k) => (
                        <option key={k} value={k}>
                          {INCIDENT_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Mô tả chi tiết</label>
                    <textarea className="form-control" rows={4} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} required placeholder="Mô tả vị trí, hiện tượng, thời điểm xảy ra…" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Hình ảnh (tuỳ chọn, tối đa 10)</label>
                    <input type="file" className="form-control form-control-sm" accept="image/*" multiple onChange={onPickFiles} />
                    <div className="form-text">Ảnh được nén dưới dạng data URL gửi kèm JSON (môi trường thật nên dùng CDN / signed upload).</div>
                  </div>
                  {formImages.length > 0 && (
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {formImages.map((src, i) => (
                        <div key={i} className="position-relative" style={{ width: 64, height: 64 }}>
                          <img src={src} alt="" className="rounded border w-100 h-100 object-fit-cover" style={{ objectFit: "cover" }} />
                          <button
                            type="button"
                            className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 px-1"
                            style={{ fontSize: 10, lineHeight: 1 }}
                            onClick={() => setFormImages(formImages.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                    Đóng
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Đang gửi…" : "Gửi khai báo"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: chi tiết */}
      {(detail || detailLoading) && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết khai báo</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={closeDetail} />
              </div>
              <div className="modal-body">
                {detailLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                )}
                {!detailLoading && detail && <DetailBody r={detail} />}
              </div>
              <div className="modal-footer">
                {detail?.status === "pending" && (
                  <button type="button" className="btn btn-outline-danger me-auto" onClick={() => void askCancel(detail._id)}>
                    Hủy yêu cầu
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={closeDetail}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function DetailBody({ r }: { r: MaintenanceReport }) {
  const st = statusBadge(r.status);
  const typeKey = r.incidentType as MaintenanceIncidentType;
  const student = typeof r.user === "object" && r.user ? r.user : null;
  const room = typeof r.room === "object" && r.room ? r.room : null;
  const area = room?.area && typeof room.area === "object" ? room.area.name : "";

  return (
    <div className="small">
      <h6 className="text-muted text-uppercase">Sinh viên</h6>
      <ul className="list-unstyled mb-3">
        <li>
          <strong>Họ tên:</strong> {student?.fullName || "—"}
        </li>
        <li>
          <strong>Mã SV:</strong> {student?.studentId || "—"}
        </li>
        <li>
          <strong>Email:</strong> {student?.email || "—"}
        </li>
      </ul>
      <h6 className="text-muted text-uppercase">Phòng</h6>
      <p>
        {room?.roomNumber || "—"}
        {area ? ` — ${area}` : ""}
      </p>
      <h6 className="text-muted text-uppercase">Nội dung</h6>
      <p>
        <strong>Loại sự cố:</strong> {INCIDENT_LABEL[typeKey] || r.incidentType}
      </p>
      <p>
        <strong>Mô tả:</strong> {r.description || "—"}
      </p>
      <p>
        <strong>Trạng thái:</strong> <span className={`badge ${st.cls}`}>{st.label}</span>
      </p>
      {r.adminNote?.trim() ? (
        <p>
          <strong>Ghi chú từ BQL:</strong> {r.adminNote}
        </p>
      ) : null}
      {r.images && r.images.length > 0 && (
        <>
          <h6 className="text-muted text-uppercase mt-3">Hình ảnh</h6>
          <div className="d-flex flex-wrap gap-2">
            {r.images.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="border rounded overflow-hidden" style={{ width: 120, height: 120 }}>
                <img src={src} alt="" className="w-100 h-100" style={{ objectFit: "cover" }} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default DamageReportPage;
