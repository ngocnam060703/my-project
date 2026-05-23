/**
 * Tab «Chuyển phòng» trong trang Đơn của tôi (sinh viên) — Bootstrap 5, giao diện gần admin ApplicationsPage.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { contractsApi, registrationsApi, roomsApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import type { Contract, Registration, Room } from "../../types";

const statusBadge: Record<string, { cls: string; text: string }> = {
  pending: { cls: "text-bg-warning", text: "Chờ duyệt" },
  approved: { cls: "text-bg-success", text: "Đã duyệt" },
  rejected: { cls: "text-bg-danger", text: "Từ chối" },
};

function roomNum(room: Room | string | undefined): string {
  if (!room || typeof room !== "object") return "—";
  return room.roomNumber || "—";
}

function areaName(room: Room | string | undefined): string {
  if (!room || typeof room !== "object") return "—";
  const ar = room.area;
  if (ar && typeof ar === "object" && "name" in ar) return String((ar as { name?: string }).name || "—");
  return "—";
}

type StudentTransferPanelProps = {
  onNotify?: (alert: { type: "success" | "danger" | "info" | "warning"; text: string }) => void;
};

const StudentTransferPanel: React.FC<StudentTransferPanelProps> = ({ onNotify }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRoomId = searchParams.get("roomId")?.trim() || "";

  const [list, setList] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = useState<Registration | null>(null);

  const notify = (alert: { type: "success" | "danger" | "info" | "warning"; text: string }) => {
    onNotify?.(alert);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [regRes, contractsRes, roomsRes] = await Promise.all([
        registrationsApi.getMy(),
        contractsApi.getMy().catch(() => ({ data: [] })),
        roomsApi.getAll().catch(() => ({ data: { rooms: [] as Room[] } })),
      ]);
      setList(Array.isArray(regRes.data) ? regRes.data : []);
      const contracts = (contractsRes.data || []) as Contract[];
      const act = contracts.find((c) => c.status === "active" || c.status === "pending_payment") || null;
      setActiveContract(act);
      setRooms((roomsRes.data?.rooms || []) as Room[]);
    } catch (e) {
      setErr(apiErrorMessage(e, "Không tải được dữ liệu chuyển phòng"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const pendingTransfer = useMemo(() => list.find((r) => r.status === "pending"), [list]);

  const filtered = useMemo(() => {
    if (!statusFilter) return list;
    return list.filter((r) => r.status === statusFilter);
  }, [list, statusFilter]);

  const stats = useMemo(
    () => ({
      pending: list.filter((r) => r.status === "pending").length,
      approved: list.filter((r) => r.status === "approved").length,
      total: list.length,
    }),
    [list]
  );

  const selectedRoom = candidateRooms.find((r) => String(r._id) === String(targetRoomId));
  const overCapacity =
    !!selectedRoom && Number(selectedRoom.currentOccupancy || 0) >= Number(selectedRoom.capacity || 0);

  useEffect(() => {
    if (!deepLinkRoomId || loading || !activeContract) return;
    if (candidateRooms.some((r) => String(r._id) === deepLinkRoomId)) {
      setTargetRoomId(deepLinkRoomId);
      setShowCreateModal(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("roomId");
    setSearchParams(next, { replace: true });
  }, [deepLinkRoomId, loading, activeContract, candidateRooms, searchParams, setSearchParams]);

  const openCreate = () => {
    setErr(null);
    setTargetRoomId("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setShowCreateModal(true);
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContract) {
      setErr("Bạn chưa có hợp đồng KTX hiệu lực");
      return;
    }
    if (!targetRoomId) {
      setErr("Vui lòng chọn phòng đích");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await registrationsApi.createTransfer({
        room: targetRoomId,
        startDate,
      });
      setShowCreateModal(false);
      notify({ type: "success", text: "Đã gửi đơn chuyển phòng. Vui lòng chờ ban quản lý duyệt." });
      await load();
    } catch (e) {
      const msg = apiErrorMessage(e, "Gửi đơn thất bại");
      setErr(msg);
      notify({ type: "danger", text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReg = async (id: string) => {
    if (!window.confirm("Bạn có chắc muốn hủy đơn chuyển phòng đang chờ duyệt?")) return;
    try {
      await registrationsApi.cancel(id);
      notify({ type: "success", text: "Đã hủy đơn." });
      if (detail?._id === id) setDetail(null);
      await load();
    } catch (e) {
      notify({ type: "danger", text: apiErrorMessage(e, "Hủy đơn thất bại") });
    }
  };

  return (
    <>
      <div className="row g-2 mb-3">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm text-white" style={{ background: "linear-gradient(135deg, #0d9488 0%, #134e4a 100%)" }}>
            <div className="card-body py-3">
              <div className="small" style={{ color: "rgba(255,255,255,0.85)" }}>
                Đơn chuyển phòng chờ duyệt
              </div>
              <div className="h5 mb-0 fw-semibold">{stats.pending} đơn</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body py-3">
              <div className="small text-muted">Đã duyệt</div>
              <div className="h5 mb-0 fw-semibold">{stats.approved} đơn</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body py-3">
              <div className="small text-muted">Tổng đơn chuyển phòng</div>
              <div className="h5 mb-0 fw-semibold">{stats.total} đơn</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-3 small">
          <p className="mb-1">
            <strong>Hợp đồng:</strong> {activeContract?.contractNumber || "—"}
            {activeContract?.status ? (
              <span className="badge text-bg-secondary ms-2">{activeContract.status}</span>
            ) : null}
          </p>
          <p className="mb-1">
            <strong>Phòng hiện tại:</strong> {roomNum(currentRoom || undefined)} — <strong>Khu:</strong>{" "}
            {areaName(currentRoom || undefined)}
          </p>
          <p className="mb-0 text-muted">
            Chỉ được chuyển phòng <strong>trong cùng khu</strong> (theo quy định giới tính / phân khu). Đơn có hiệu lực sau khi
            admin duyệt.
          </p>
        </div>
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div className="col-md-3 px-0">
          <label className="form-label small mb-0">Trạng thái</label>
          <select
            className="form-select form-select-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={openCreate}
          disabled={!activeContract || !!pendingTransfer}
        >
          + Gửi đơn chuyển phòng
        </button>
      </div>

      {!activeContract && (
        <div className="alert alert-warning small">
          Bạn chưa có hợp đồng KTX hiệu lực — không thể gửi đơn chuyển phòng. Xem mục Hợp đồng hoặc gửi đơn đăng ký KTX trước.
        </div>
      )}
      {pendingTransfer && (
        <div className="alert alert-info small">Bạn đã có đơn chuyển phòng đang chờ duyệt — không thể gửi thêm cho đến khi được xử lý hoặc hủy đơn.</div>
      )}

      {err && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {err}
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setErr(null)} />
        </div>
      )}

      <div className="position-relative">
        {loading && (
          <div
            className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75"
            style={{ zIndex: 2, minHeight: 120 }}
          >
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-striped table-bordered table-sm align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: 50 }}>STT</th>
                <th>Ngày gửi</th>
                <th>Phòng hiện tại</th>
                <th>Phòng muốn chuyển</th>
                <th>Khu</th>
                <th>Trạng thái</th>
                <th>Ghi chú</th>
                <th style={{ width: 160 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const st = statusBadge[r.status] || { cls: "text-bg-secondary", text: r.status };
                const note =
                  r.status === "rejected"
                    ? r.rejectionReason || r.note || "—"
                    : r.status === "pending"
                      ? "Chờ admin duyệt"
                      : "—";
                return (
                  <tr key={r._id}>
                    <td>{idx + 1}</td>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                    <td>{roomNum(r.fromRoom)}</td>
                    <td>{roomNum(r.room)}</td>
                    <td>{areaName(r.room)}</td>
                    <td>
                      <span className={`badge rounded-pill ${st.cls}`}>{st.text}</span>
                    </td>
                    <td className="small text-muted">{note}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-primary" onClick={() => setDetail(r)}>
                          Xem
                        </button>
                        {r.status === "pending" && (
                          <button type="button" className="btn btn-outline-danger" onClick={() => void cancelReg(r._id)}>
                            Hủy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    Chưa có đơn chuyển phòng. Nhấn &quot;Gửi đơn chuyển phòng&quot; để tạo mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Gửi đơn chuyển phòng</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setShowCreateModal(false)} />
              </div>
              <form onSubmit={submitTransfer}>
                <div className="modal-body">
                  <p className="small text-muted">
                    Từ phòng <strong>{roomNum(currentRoom || undefined)}</strong> ({areaName(currentRoom || undefined)}) → chọn phòng
                    đích trong cùng khu.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Phòng đích</label>
                    <select
                      className="form-select"
                      value={targetRoomId}
                      onChange={(e) => setTargetRoomId(e.target.value)}
                      required
                      disabled={!activeContract}
                    >
                      <option value="">-- Chọn phòng --</option>
                      {candidateRooms.map((r) => {
                        const occ = `${Number(r.currentOccupancy || 0)}/${Number(r.capacity || 0)}`;
                        return (
                          <option key={r._id} value={r._id}>
                            Phòng {r.roomNumber} — {occ}
                          </option>
                        );
                      })}
                    </select>
                    {candidateRooms.length === 0 && activeContract && (
                      <div className="form-text text-warning">Không có phòng khác trong khu để chuyển.</div>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Ngày mong muốn chuyển</label>
                    <input
                      className="form-control"
                      type="date"
                      value={startDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  {overCapacity && (
                    <div className="alert alert-warning small py-2">
                      Phòng đích đang đầy — bạn vẫn có thể gửi đơn, admin sẽ xem xét duyệt hoặc từ chối.
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                    Đóng
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting || !activeContract}>
                    {submitting ? "Đang gửi…" : "Gửi đơn"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Chi tiết đơn chuyển phòng</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setDetail(null)} />
              </div>
              <div className="modal-body small">
                <ul className="list-unstyled mb-0">
                  <li>
                    <strong>Mã đơn:</strong> {detail._id?.slice(-8).toUpperCase()}
                  </li>
                  <li>
                    <strong>Phòng hiện tại:</strong> {roomNum(detail.fromRoom)}
                  </li>
                  <li>
                    <strong>Phòng muốn chuyển:</strong> {roomNum(detail.room)}
                  </li>
                  <li>
                    <strong>Khu:</strong> {areaName(detail.room)}
                  </li>
                  <li>
                    <strong>Học kỳ / năm học:</strong> {detail.semester} — {detail.schoolYear}
                  </li>
                  <li>
                    <strong>Ngày gửi:</strong> {detail.createdAt ? new Date(detail.createdAt).toLocaleString("vi-VN") : "—"}
                  </li>
                  <li>
                    <strong>Trạng thái:</strong>{" "}
                    <span className={`badge rounded-pill ${statusBadge[detail.status]?.cls || "text-bg-secondary"}`}>
                      {statusBadge[detail.status]?.text || detail.status}
                    </span>
                  </li>
                  {detail.status === "rejected" && (detail.rejectionReason || detail.note) && (
                    <li className="text-danger mt-2">
                      <strong>Lý do từ chối:</strong> {detail.rejectionReason || detail.note}
                    </li>
                  )}
                </ul>
                {detail.status === "pending" && (
                  <div className="mt-3 pt-3 border-top">
                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void cancelReg(detail._id)}>
                      Hủy đơn này
                    </button>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StudentTransferPanel;
