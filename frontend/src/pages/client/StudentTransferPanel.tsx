/**
 * Tab «Chuyển phòng» trong trang Đơn của tôi (sinh viên) — Bootstrap 5, giao diện gần admin ApplicationsPage.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contractsApi, registrationsApi } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import { formatStudentGender, areaGenderPolicyLabel } from "../../utils/genderDisplay";
import { canRequestRoomTransfer, pickResidenceContract } from "../../utils/ktxMembership";
import type {
  Contract,
  Registration,
  Room,
  TransferEligibilityContext,
  User,
} from "../../types";

type TransferRoomGroup = {
  areaId: string;
  areaName: string;
  genderPolicy: string;
  isCurrentArea: boolean;
  isGenderZone: boolean;
  rooms: Array<{
    _id: string;
    roomNumber: string;
    capacity: number;
    currentOccupancy: number;
    vacantSlots: number;
  }>;
};

const statusBadge: Record<string, { cls: string; text: string }> = {
  pending: { cls: "text-bg-warning", text: "Chờ duyệt" },
  approved: { cls: "text-bg-success", text: "Đã duyệt" },
  rejected: { cls: "text-bg-danger", text: "Từ chối" },
};

function formatVnd(n?: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
}

function isTransferCompleted(r: Registration): boolean {
  return r.status === "approved" && r.transferPhase === "completed";
}

/** Admin đã duyệt — SV cần ký HĐ mới tại trang Hợp đồng. */
function needsTransferContractSign(r: Registration): boolean {
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRoomId = searchParams.get("roomId")?.trim() || "";

  const [list, setList] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [myContracts, setMyContracts] = useState<Contract[]>([]);
  const [candidateGroups, setCandidateGroups] = useState<TransferRoomGroup[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferReason, setTransferReason] = useState("");
  const [detail, setDetail] = useState<Registration | null>(null);
  const [transferEligibility, setTransferEligibility] = useState<TransferEligibilityContext | null>(null);
  const [showUpcomingAckModal, setShowUpcomingAckModal] = useState(false);

  const notify = (alert: { type: "success" | "danger" | "info" | "warning"; text: string }) => {
    onNotify?.(alert);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [regRes, contractsRes, eligRes] = await Promise.all([
        registrationsApi.getMy(),
        contractsApi.getMy().catch(() => ({ data: [] })),
        registrationsApi.getTransferEligibility().catch(() => ({ data: null })),
      ]);
      setList(Array.isArray(regRes.data) ? regRes.data : []);
      const contracts = (contractsRes.data || []) as Contract[];
      setMyContracts(contracts);
      setActiveContract(pickResidenceContract(contracts));
      setTransferEligibility((eligRes.data as TransferEligibilityContext) || null);
    } catch (e) {
      setErr(apiErrorMessage(e, "Không tải được dữ liệu chuyển phòng"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket || !user) return;
    const uid = String((user as { _id?: string })._id || (user as { id?: string }).id || "");
    if (!uid) return;
    const refresh = (payload: { userId?: string }) => {
      if (!payload?.userId || payload.userId === uid) void load();
    };
    socket.on("registration:approved", refresh);
    socket.on("registration:rejected", refresh);
    socket.on("registration:transfer-changed", refresh);
    return () => {
      socket.off("registration:approved", refresh);
      socket.off("registration:rejected", refresh);
      socket.off("registration:transfer-changed", refresh);
    };
  }, [socket, user, load]);

  const currentRoom = activeContract?.room && typeof activeContract.room === "object" ? activeContract.room : null;

  const candidateRooms = useMemo(
    () => candidateGroups.flatMap((g) => g.rooms.map((r) => ({ ...r, _areaName: g.areaName, _genderPolicy: g.genderPolicy }))),
    [candidateGroups]
  );

  const hasRoomsInCurrentArea = candidateGroups.some((g) => g.isCurrentArea && g.rooms.length > 0);
  const hasRoomsOtherAreas = candidateGroups.some((g) => !g.isCurrentArea && g.rooms.length > 0);

  const pendingTransfer = useMemo(() => list.find((r) => r.status === "pending"), [list]);
  const awaitingSignContract = useMemo(() => list.find(needsTransferContractSign), [list]);

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

  const loadCandidateRooms = async () => {
    setCandidateLoading(true);
    try {
      const { data } = await registrationsApi.getTransferCandidateRooms();
      setCandidateGroups(data?.groups || []);
    } catch (e) {
      setCandidateGroups([]);
      setErr(apiErrorMessage(e, "Không tải được danh sách phòng chuyển"));
    } finally {
      setCandidateLoading(false);
    }
  };

  const regUserGender = (r: Registration) => {
    const u = r.user;
    if (u && typeof u === "object") return formatStudentGender((u as User).gender);
    return formatStudentGender(user?.gender);
  };

  const openCreate = async () => {
    setErr(null);
    setTargetRoomId("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setTransferReason("");
    try {
      const eligRes = await registrationsApi.getTransferEligibility();
      setTransferEligibility(eligRes.data as TransferEligibilityContext);
      await loadCandidateRooms();
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
            Chỉ chuyển vào phòng có <strong>bạn cùng giới tính</strong> đang ở; ưu tiên khu hiện tại, nếu không còn chỗ sẽ hiển thị khu khác phù hợp. Đơn có hiệu lực sau khi
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

      {awaitingSignContract && (
        <div className="alert alert-info small mb-3">
          Admin đã duyệt đơn chuyển phòng. Vui lòng{" "}
          <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => navigate("/student/my-contracts")}>
            ký hợp đồng mới
          </button>{" "}
          tại mục «Hợp đồng của tôi», sau đó chờ admin xác nhận để hoàn tất chuyển phòng.
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
                <th>Giới tính</th>
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
                      : needsTransferContractSign(r)
                        ? "Đã duyệt — chờ ký HĐ mới"
                        : r.status === "pending"
                          ? "Chờ admin duyệt"
                          : "—";
                return (
                  <tr key={r._id}>
                    <td>{idx + 1}</td>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
                    <td>{regUserGender(r)}</td>
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
                        {needsTransferContractSign(r) && (
                          <button type="button" className="btn btn-success" onClick={() => navigate("/student/my-contracts")}>
                            Ký HĐ
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
                  <td colSpan={9} className="text-center text-muted py-4">
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
                    Từ phòng <strong>{roomNum(currentRoom || undefined)}</strong> ({areaName(currentRoom || undefined)}) — giới tính của bạn:{" "}
                    <strong>{formatStudentGender(user?.gender)}</strong>. Chỉ chọn phòng có người cùng giới tính đang ở.
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Phòng đích</label>
                    <select
                      className="form-select"
                      value={targetRoomId}
                      onChange={(e) => setTargetRoomId(e.target.value)}
                      required
                      disabled={!activeContract || candidateLoading}
                    >
                      <option value="">-- Chọn phòng --</option>
                      {candidateGroups.map((g) => (
                        <optgroup
                          key={g.areaId}
                          label={`${g.areaName} (${areaGenderPolicyLabel(g.genderPolicy)})${g.isCurrentArea ? " — khu hiện tại" : g.isGenderZone ? " — khu cùng giới" : ""}`}
                        >
                          {g.rooms.map((r) => {
                            const occ = `${Number(r.currentOccupancy || 0)}/${Number(r.capacity || 0)}`;
                            return (
                              <option key={r._id} value={r._id}>
                                Phòng {r.roomNumber} — trống {r.vacantSlots}/{r.capacity} ({occ})
                              </option>
                            );
                          })}
                        </optgroup>
                      ))}
                    </select>
                    {candidateLoading && <div className="form-text">Đang tải phòng phù hợp…</div>}
                    {!candidateLoading && candidateRooms.length === 0 && activeContract && (
                      <div className="form-text text-warning">
                        Không có phòng phù hợp giới tính. Liên hệ ban quản lý KTX.
                      </div>
                    )}
                    {!candidateLoading && !hasRoomsInCurrentArea && hasRoomsOtherAreas && (
                      <div className="form-text text-info">
                        Khu hiện tại không còn phòng trống phù hợp — danh sách bên dưới là các khu khác bạn có thể chuyển tới.
                      </div>
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
                    <strong>Giới tính:</strong> {regUserGender(detail)}
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
                  {needsTransferContractSign(detail) && (
                    <li className="mt-2">
                      <button type="button" className="btn btn-success btn-sm" onClick={() => navigate("/student/my-contracts")}>
                        Ký hợp đồng mới
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

export default StudentTransferPanel;
