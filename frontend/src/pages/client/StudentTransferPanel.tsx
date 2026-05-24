/**
 * Tab «Chuyển phòng» trong trang Đơn của tôi (sinh viên) — Bootstrap 5, giao diện gần admin ApplicationsPage.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { contractsApi, registrationsApi, roomsApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import { canRequestRoomTransfer, pickResidenceContract } from "../../utils/ktxMembership";
import type {
  Contract,
  Registration,
  Room,
  TransferEligibilityContext,
  TransferFinancialSnapshot,
} from "../../types";

const statusBadge: Record<string, { cls: string; text: string }> = {
  pending: { cls: "text-bg-warning", text: "Chờ duyệt" },
  approved: { cls: "text-bg-success", text: "Đã duyệt" },
  rejected: { cls: "text-bg-danger", text: "Từ chối" },
};

function formatVnd(n?: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
}

function isTransferCompleted(r: Registration): boolean {
  return r.status === "approved" && (r.transferPhase === "completed" || !!r.newContract);
}

function needsStudentConfirm(r: Registration): boolean {
  return r.status === "approved" && !isTransferCompleted(r);
}

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
  const [myContracts, setMyContracts] = useState<Contract[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferReason, setTransferReason] = useState("");
  const [detail, setDetail] = useState<Registration | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Registration | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [transferEligibility, setTransferEligibility] = useState<TransferEligibilityContext | null>(null);
  const [showUpcomingAckModal, setShowUpcomingAckModal] = useState(false);

  const notify = (alert: { type: "success" | "danger" | "info" | "warning"; text: string }) => {
    onNotify?.(alert);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [regRes, contractsRes, roomsRes, eligRes] = await Promise.all([
        registrationsApi.getMy(),
        contractsApi.getMy().catch(() => ({ data: [] })),
        roomsApi.getAll().catch(() => ({ data: { rooms: [] as Room[] } })),
        registrationsApi.getTransferEligibility().catch(() => ({ data: null })),
      ]);
      setList(Array.isArray(regRes.data) ? regRes.data : []);
      const contracts = (contractsRes.data || []) as Contract[];
      setMyContracts(contracts);
      setActiveContract(pickResidenceContract(contracts));
      setTransferEligibility((eligRes.data as TransferEligibilityContext) || null);
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
  const awaitingConfirm = useMemo(() => list.find(needsStudentConfirm), [list]);

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

  const openCreate = async () => {
    setErr(null);
    setTargetRoomId("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setTransferReason("");
    try {
      const { data } = await registrationsApi.getTransferEligibility();
      setTransferEligibility(data as TransferEligibilityContext);
    } catch {
      /* giữ snapshot cũ nếu API lỗi */
    }
    setShowCreateModal(true);
  };

  const submitTransferRequest = async (acknowledgeUpcoming: boolean) => {
    if (!canRequestRoomTransfer(myContracts)) {
      setErr(
        activeContract?.status === "upcoming"
          ? "Hợp đồng gia hạn đang chờ kích hoạt — chưa thể chuyển phòng. Vui lòng tải lại trang Hợp đồng sau khi HĐ active."
          : "Bạn chưa có hợp đồng đang hiệu lực (active) để chuyển phòng"
      );
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
        transferReason: transferReason.trim() || undefined,
        acknowledgeUpcomingCancellation: acknowledgeUpcoming || undefined,
      });
      setShowCreateModal(false);
      setShowUpcomingAckModal(false);
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

  const submitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferEligibility?.hasUpcomingRenewal) {
      setShowUpcomingAckModal(true);
      return;
    }
    void submitTransferRequest(false);
  };

  const openConfirmFlow = (r: Registration) => {
    setConfirmTarget(r);
    setDetail(null);
  };

  const submitConfirmTransfer = async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      await registrationsApi.confirmTransfer(confirmTarget._id);
      notify({ type: "success", text: "Đã xác nhận nhận phòng mới. Hợp đồng và giường đã được cập nhật." });
      setConfirmTarget(null);
      await load();
    } catch (e) {
      notify({ type: "danger", text: apiErrorMessage(e, "Xác nhận thất bại") });
    } finally {
      setConfirming(false);
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
      {activeContract?.status === "upcoming" && (
        <div className="alert alert-info small">
          Bạn có hợp đồng <strong>gia hạn (upcoming)</strong> — hệ thống coi bạn là thành viên trên Dashboard, nhưng chuyển
          phòng cần HĐ <strong>active</strong>. Vui lòng đợi kích hoạt hoặc liên hệ ban quản lý.
        </div>
      )}
      {pendingTransfer && (
        <div className="alert alert-info small">Bạn đã có đơn chuyển phòng đang chờ duyệt — không thể gửi thêm cho đến khi được xử lý hoặc hủy đơn.</div>
      )}

      {awaitingConfirm && (
        <div className="alert alert-info small mb-3">
          Đơn chuyển phòng đã được admin duyệt một phần — đang chờ hoàn tất hệ thống. Vui lòng tải lại trang hoặc liên hệ
          ban quản lý nếu trạng thái không đổi.
        </div>
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
                    : isTransferCompleted(r)
                      ? "Đã hoàn tất chuyển phòng"
                      : needsStudentConfirm(r)
                        ? "Đã duyệt — chờ hoàn tất"
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
                        {needsStudentConfirm(r) && (
                          <button type="button" className="btn btn-success" onClick={() => openConfirmFlow(r)}>
                            Xác nhận
                          </button>
                        )}
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

      {showUpcomingAckModal && transferEligibility?.hasUpcomingRenewal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.55)", zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-0 bg-warning bg-opacity-10">
                <h5 className="modal-title text-warning-emphasis fw-semibold">Cảnh báo — Hợp đồng gia hạn</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Đóng"
                  onClick={() => setShowUpcomingAckModal(false)}
                  disabled={submitting}
                />
              </div>
              <div className="modal-body">
                <p className="mb-3 small" style={{ lineHeight: 1.55 }}>
                  {transferEligibility.warningMessage ||
                    "Bạn có hợp đồng gia hạn chờ kích hoạt. Chuyển phòng sẽ hủy HĐ gia hạn và không cộng dồn thời gian sang phòng mới."}
                </p>
                {transferEligibility.newContractEndDate && (
                  <p className="small text-muted mb-0">
                    Hợp đồng phòng mới (nếu được duyệt) kết thúc:{" "}
                    <strong>
                      {new Date(transferEligibility.newContractEndDate).toLocaleDateString("vi-VN")}
                    </strong>
                  </p>
                )}
                {(transferEligibility.upcomingRefundPreview || 0) > 0 && (
                  <p className="small text-success mt-2 mb-0">
                    Nếu bạn đã đóng tiền HĐ gia hạn, hệ thống sẽ hoàn 100% (
                    {formatVnd(transferEligibility.upcomingRefundPreview)}) vào ví khấu trừ khi hoàn tất chuyển phòng.
                  </p>
                )}
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowUpcomingAckModal(false)}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-warning"
                  disabled={submitting}
                  onClick={() => void submitTransferRequest(true)}
                >
                  {submitting ? "Đang gửi…" : "Đồng ý — tiếp tục chuyển phòng"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <div className="form-text">
                      Hợp đồng phòng mới (khi được duyệt) có hiệu lực <strong>1 năm</strong> tính từ{" "}
                      <strong>ngày bạn gửi đơn</strong> (hôm nay).
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Lý do chuyển phòng (tùy chọn)</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      maxLength={500}
                      placeholder="VD: Phòng quá đông, cần phòng yên tĩnh hơn…"
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                    />
                  </div>
                  {overCapacity && (
                    <div className="alert alert-warning small py-2">
                      Phòng đích đang đầy — bạn vẫn có thể gửi đơn, admin sẽ xem xét duyệt hoặc từ chối.
                    </div>
                  )}
                  {transferEligibility?.hasUpcomingRenewal && (
                    <div className="alert alert-warning small py-2 mb-0">
                      Bạn đang có <strong>HĐ gia hạn chờ kích hoạt</strong>. Khi gửi đơn, hệ thống sẽ yêu cầu xác nhận hủy
                      HĐ gia hạn (không cộng dồn thời hạn).
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

      {confirmTarget && (
        <TransferConfirmModal
          registration={confirmTarget}
          confirming={confirming}
          onClose={() => setConfirmTarget(null)}
          onConfirm={() => void submitConfirmTransfer()}
          roomNum={roomNum}
          areaName={areaName}
        />
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
                  {needsStudentConfirm(detail) && (
                    <li className="mt-2">
                      <button type="button" className="btn btn-success btn-sm" onClick={() => openConfirmFlow(detail)}>
                        Xác nhận nhận phòng mới
                      </button>
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

type TransferConfirmModalProps = {
  registration: Registration;
  confirming: boolean;
  onClose: () => void;
  onConfirm: () => void;
  roomNum: (room: Room | string | undefined) => string;
  areaName: (room: Room | string | undefined) => string;
};

const TransferConfirmModal: React.FC<TransferConfirmModalProps> = ({
  registration,
  confirming,
  onClose,
  onConfirm,
  roomNum,
  areaName,
}) => {
  const fin: TransferFinancialSnapshot | null | undefined = registration.financialSnapshot;
  const oldLabel = fin?.labels?.oldRoom;
  const newLabel = fin?.labels?.newRoom;

  const financialLine = () => {
    if (!fin) return <p className="small text-muted mb-0">Đang tải thông tin tài chính…</p>;
    if (fin.financialMode === "defer_room_invoice" || fin.hasPaidOldRoomBill === false) {
      return (
        <p className="mb-0 text-muted small">
          Chưa có hóa đơn tiền phòng cũ đã thanh toán — <strong>không phát sinh phụ thu chuyển phòng</strong>.
          Hệ thống chốt {fin.daysUsedOld ?? "—"} ngày ở phòng cũ (đến ngày nộp đơn) và xuất hóa đơn tiền phòng riêng sau.
        </p>
      );
    }
    if (fin.financialAction === "supplement" && (fin.supplementAmount || 0) > 0) {
      return (
        <p className="mb-0">
          <span className="text-muted">Cần đóng thêm (phụ thu tiền phòng):</span>{" "}
          <strong className="text-danger fs-5">{formatVnd(fin.supplementAmount)}</strong>
          <span className="d-block small text-muted mt-1">
            Bù trừ từ tiền đã đóng phòng cũ so với tháng đầu HĐ mới (prorate từ ngày nộp đơn).
          </span>
        </p>
      );
    }
    if (fin.financialAction === "wallet_credit" && (fin.walletCreditAmount || 0) > 0) {
      const renewalRefund = fin.upcomingRenewal?.refundAmount || 0;
      return (
        <p className="mb-0">
          <span className="text-muted">Được khấu trừ (ví):</span>{" "}
          <strong className="text-success fs-5">{formatVnd(fin.walletCreditAmount)}</strong>
          <span className="d-block small text-muted mt-1">
            {renewalRefund > 0
              ? `Gồm hoàn 100% HĐ gia hạn bị hủy (${formatVnd(renewalRefund)}) + bù trừ chuyển phòng. Tự trừ vào hóa đơn sau.`
              : "Số dư sẽ tự trừ vào hóa đơn tháng sau."}
          </span>
        </p>
      );
    }
    return (
      <p className="mb-0 text-muted small">
        Không phát sinh phụ thu hoặc số dư ví — bạn có thể xác nhận nhận phòng.
      </p>
    );
  };

  return (
    <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-semibold">Xác nhận nhận phòng mới</h5>
            <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} disabled={confirming} />
          </div>
          <div className="modal-body pt-2">
            <p className="text-muted small">
              Hợp đồng mới có hiệu lực 1 năm kể từ <strong>ngày nộp đơn</strong>; hợp đồng cũ thanh lý cùng ngày đó.
            </p>
            {fin?.newContractStartDate && fin?.newContractEndDate && (
              <p className="small mb-3">
                Thời hạn HĐ mới:{" "}
                <strong>
                  {new Date(fin.newContractStartDate).toLocaleDateString("vi-VN")} →{" "}
                  {new Date(fin.newContractEndDate).toLocaleDateString("vi-VN")}
                </strong>
              </p>
            )}
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="p-3 rounded h-100" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div className="small text-uppercase text-muted fw-semibold mb-2">Phòng cũ</div>
                  <div className="fs-5 fw-semibold">{oldLabel?.roomNumber || roomNum(registration.fromRoom)}</div>
                  <div className="small text-muted">{oldLabel?.areaName || areaName(registration.fromRoom)}</div>
                  {fin?.oldContractNumber && (
                    <div className="small mt-2">HĐ: {fin.oldContractNumber}</div>
                  )}
                  {fin?.oldActualCharge != null && (
                    <div className="small mt-1">
                      Tiền phòng thực tế ({fin.daysUsedOld}/{fin.daysInMonth} ngày):{" "}
                      <strong>{formatVnd(fin.oldActualCharge)}</strong>
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="p-3 rounded h-100" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                  <div className="small text-uppercase text-success fw-semibold mb-2">Phòng mới</div>
                  <div className="fs-5 fw-semibold text-success">
                    {newLabel?.roomNumber || roomNum(registration.room)}
                  </div>
                  <div className="small text-muted">{newLabel?.areaName || areaName(registration.room)}</div>
                  {fin?.newMonthlySlotPrice != null && (
                    <div className="small mt-2">
                      Giá slot/tháng (chốt HĐ mới): <strong>{formatVnd(fin.newMonthlySlotPrice)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-3 rounded mb-0" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div className="small text-uppercase text-muted fw-semibold mb-2">Bù trừ tài chính tháng này</div>
              {financialLine()}
              {fin && (
                <details className="mt-2 small text-muted">
                  <summary className="user-select-none">Chi tiết tính toán</summary>
                  <ul className="mb-0 mt-2 ps-3">
                    <li>Đã đóng tiền phòng cũ (tháng): {formatVnd(fin.amountPaidAtMonthStart)}</li>
                    <li>Phòng cũ thực tế ({fin.daysUsedOld}/{fin.daysInMonth} ngày): {formatVnd(fin.oldActualCharge)}</li>
                    <li>
                      Phòng mới tháng đầu ({fin.daysNewFirstMonth ?? fin.daysRemaining} ngày):{" "}
                      {formatVnd(fin.newFirstMonthProrated ?? fin.newRemainingCharge)}
                    </li>
                    {fin.totalCreditFromOld != null ? (
                      <li>Bù trừ từ phòng cũ: {formatVnd(fin.totalCreditFromOld)}</li>
                    ) : null}
                  </ul>
                </details>
              )}
            </div>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={confirming}>
              Để sau
            </button>
            <button type="button" className="btn btn-success px-4" onClick={onConfirm} disabled={confirming}>
              {confirming ? "Đang xử lý…" : "Xác nhận nhận phòng mới"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentTransferPanel;
