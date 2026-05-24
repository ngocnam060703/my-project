/**
 * Module "Hợp đồng của tôi" — Bootstrap 5: thông tin SV, phòng, HĐ, countdown, yêu cầu gia hạn.
 * API: GET /api/my-contract, GET /api/contracts/:id/renewal-preview, POST confirm-renewal
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { message } from "antd";
import { isAxiosError } from "axios";
import { contractsApi, dashboardApi, extensionPeriodsApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import { useAuth } from "../../contexts/AuthContext";
import type {
  Contract,
  ContractExtendRequest,
  ContractRenewalPreview,
  ExtensionPeriodInfo,
  MyContractOverview,
  Room,
} from "../../types";
import { CONTRACT_CONSENT_LABEL, capacityAtSigning, contractRoomMonthlySnapshot, roomFeePerSlot } from "../../utils/contractPricing";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n)).toLocaleString("vi-VN")}đ`;
}

function fmtDateDmy(d?: string | Date | null): string {
  if (!d) return "—";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "—";
  return `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`;
}

function monthsBetween(start: string | Date, end: string | Date): number {
  const a = new Date(start);
  const b = new Date(end);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

function daysRemaining(endDate: string | Date): number {
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** HĐ mới / chuyển phòng cần SV ký (kể cả bản lỗi cũ: active nhưng chưa consentAcceptedAt). */
function needsStudentContractSign(c: Contract): boolean {
  if (c.isRenewalContract) return false;
  if (c.status === "pending_payment" && !c.signedAt) return true;
  if (c.isTransferContract && !c.consentAcceptedAt) return true;
  const cn = String(c.contractNumber || "");
  if (!c.consentAcceptedAt && (c.isTransferContract || cn.startsWith("HD-CP"))) return true;
  return false;
}

function statusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "active":
      return { cls: "text-bg-success", label: "Đang hiệu lực" };
    case "upcoming":
      return { cls: "text-bg-info text-dark", label: "Sắp có hiệu lực" };
    case "pending_payment":
      return { cls: "text-bg-warning text-dark", label: "Chưa hiệu lực (chờ ký + xác nhận)" };
    case "completed":
      return { cls: "text-bg-secondary", label: "Đã hoàn thành" };
    case "expired":
      return { cls: "text-bg-secondary", label: "Hết hạn" };
    case "terminated":
      return { cls: "text-bg-danger", label: "Đã kết thúc" };
    default:
      return { cls: "text-bg-light text-dark", label: status };
  }
}

function monthlyRentDisplay(c: Contract): string {
  const r = c.room as Room | undefined;
  return fmtMoney(roomFeePerSlot(c, r));
}

function depositDisplay(c: Contract): string {
  if (c.depositAmount != null && c.depositAmount >= 0) return fmtMoney(c.depositAmount);
  return "Theo quy định KTX (liên hệ BQL)";
}

function errMsg(e: unknown): string {
  if (isAxiosError(e)) {
    const m = (e.response?.data as { message?: string } | undefined)?.message;
    if (m) return m;
  }
  return "Có lỗi xảy ra";
}

function isExtensionPeriodOpen(period?: ExtensionPeriodInfo | null, nowMs = Date.now()): boolean {
  if (!period?.isOpen || !period.endDate) return false;
  const start = period.startDate ? new Date(period.startDate).getTime() : 0;
  const end = new Date(period.endDate).getTime();
  return nowMs >= start && nowMs <= end;
}

function formatPeriodEndVi(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function avatarSrc(student: MyContractOverview["student"] | null): string | null {
  const a = student?.avatar;
  if (!a || typeof a !== "string") return null;
  if (a.startsWith("http")) return a;
  return null;
}

const MyContractsPage: React.FC = () => {
  const { user: authUser } = useAuth();
  const { socket } = useSocket();
  const [data, setData] = useState<MyContractOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renewModalContract, setRenewModalContract] = useState<Contract | null>(null);
  const [renewMonths, setRenewMonths] = useState(12);
  const [renewPreview, setRenewPreview] = useState<ContractRenewalPreview | null>(null);
  const [renewPreviewLoading, setRenewPreviewLoading] = useState(false);
  const [renewConsent, setRenewConsent] = useState(false);
  const [renewSubmitting, setRenewSubmitting] = useState(false);
  const [viewModalContract, setViewModalContract] = useState<Contract | null>(null);
  const [signConsent, setSignConsent] = useState(false);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const [batchCountdown, setBatchCountdown] = useState("");

  const mergeActiveExtensionPeriod = (
    base: MyContractOverview,
    activeRaw: { name?: string; startDate?: string; endDate?: string } | null
  ): MyContractOverview => {
    if (!activeRaw?.endDate) return base;
    const extensionPeriod: ExtensionPeriodInfo = {
      isOpen: true,
      name: activeRaw.name ?? null,
      startDate: activeRaw.startDate ?? null,
      endDate: activeRaw.endDate ?? null,
    };
    const active = base.activeContract;
    const canBatchRenew =
      active?.status === "active" && !base.pendingRenewalContract && isExtensionPeriodOpen(extensionPeriod);
    return {
      ...base,
      extensionPeriod,
      extensionEnabled: base.extensionEnabled !== false || extensionPeriod.isOpen,
      canRenewContract: canBatchRenew || Boolean(base.canRenewContract),
      renewalMode: canBatchRenew ? "batch" : base.renewalMode,
    };
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [overviewRes, activePeriodRes] = await Promise.all([
        contractsApi.getMyContractOverview(),
        extensionPeriodsApi.getActive().catch(() => ({ data: null })),
      ]);
      const activeRaw = activePeriodRes.data as { name?: string; startDate?: string; endDate?: string } | null;
      setData(mergeActiveExtensionPeriod(overviewRes.data, activeRaw));
    } catch (firstErr) {
      /** Backend cũ chưa mount GET /api/my-contract → dùng GET /contracts/my + setting gia hạn */
      try {
        const [contractsRes, settingRes, periodRes] = await Promise.all([
          contractsApi.getMy(),
          dashboardApi.getContractExtensionSetting().catch(() => ({ data: { enable_contract_extension: true } })),
          extensionPeriodsApi.getActive().catch(() => ({ data: null })),
        ]);
        const contracts = (contractsRes.data as Contract[]) || [];
        const globallyEnabled =
          (settingRes.data as { enable_contract_extension?: boolean } | undefined)?.enable_contract_extension !== false;
        const periodRaw = periodRes.data as { name?: string; startDate?: string; endDate?: string } | null;
        const extensionPeriod = periodRaw
          ? { isOpen: true, name: periodRaw.name, startDate: periodRaw.startDate, endDate: periodRaw.endDate }
          : { isOpen: false, name: null, startDate: null, endDate: null };
        const activeContract = contracts.find((c) => c.status === "active") || null;
        const canBatch =
          Boolean(extensionPeriod.isOpen) && activeContract?.status === "active";
        setData({
          student: null,
          contracts,
          activeContract,
          extendRequests: [],
          extensionEnabled: globallyEnabled || extensionPeriod.isOpen,
          extensionPeriod,
          canRequestExtension: canBatch || (globallyEnabled && extensionPeriod.isOpen),
          canRenewContract: canBatch,
          renewalMode: canBatch ? "batch" : undefined,
          batchExtensionMonths: 6,
        });
        setErr(null);
      } catch {
        setErr(errMsg(firstErr));
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket || !authUser) return;
    const uid = String((authUser as { _id?: string })._id || (authUser as { id?: string }).id || "");
    const onExt = (payload: { userId?: string }) => {
      if (payload.userId === uid) void load();
    };
    socket.on("contract:extended", onExt);
    socket.on("contract:renewal-created", onExt);
    socket.on("contract:renewal-activated", onExt);
    socket.on("registration:approved", onExt);
    return () => {
      socket.off("contract:extended", onExt);
      socket.off("contract:renewal-created", onExt);
      socket.off("contract:renewal-activated", onExt);
      socket.off("registration:approved", onExt);
    };
  }, [socket, authUser, load]);

  const primary = data?.activeContract || data?.contracts?.[0] || null;
  const contractAwaitingSign = useMemo(
    () => (data?.contracts ?? []).find((c) => needsStudentContractSign(c)) ?? null,
    [data?.contracts],
  );
  /** Thẻ HĐ: ưu tiên HĐ đang chờ ký (chuyển phòng / pending_payment). */
  const contractCard = contractAwaitingSign ?? primary;
  const student =
    data?.student ||
    (authUser
      ? {
          fullName: authUser.fullName,
          email: authUser.email,
          phone: authUser.phone,
          studentId: authUser.studentId,
          gender: authUser.gender,
          citizenId: authUser.citizenId,
          dateOfBirth: authUser.dateOfBirth ?? undefined,
          avatar: (authUser as { avatar?: string }).avatar,
        }
      : null);

  const renewalWindow = data?.renewalWindowDays ?? 30;
  const batchMonths = data?.batchExtensionMonths ?? 6;
  const isBatchOpen = isExtensionPeriodOpen(data?.extensionPeriod);
  const daysLeft = primary ? daysRemaining(primary.endDate) : null;
  const canRenewLocal =
    primary?.status === "active" &&
    !data?.pendingRenewalContract &&
    (isBatchOpen ||
      (Boolean(data?.extensionEnabled) && daysLeft != null && daysLeft >= 0 && daysLeft <= renewalWindow));
  const canRenew = isBatchOpen
    ? primary?.status === "active" && !data?.pendingRenewalContract
    : (data?.canRenewContract ?? canRenewLocal);
  const isBatchRenewal = renewPreview?.renewalMode === "batch" || isBatchOpen;

  useEffect(() => {
    if (!isBatchOpen || !data?.extensionPeriod?.endDate) {
      setBatchCountdown("");
      return;
    }
    const tick = () => {
      const diffMs = new Date(data.extensionPeriod!.endDate!).getTime() - Date.now();
      if (diffMs <= 0) {
        setBatchCountdown("00:00:00");
        void load();
        return;
      }
      const totalSeconds = Math.floor(diffMs / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const s = String(totalSeconds % 60).padStart(2, "0");
      setBatchCountdown(`${h}:${m}:${s}`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isBatchOpen, data?.extensionPeriod?.endDate, load]);

  const renewalHint = useMemo(() => {
    if (data?.pendingRenewalContract) {
      const pr = data.pendingRenewalContract;
      const from = pr.startDate ? new Date(pr.startDate).toLocaleDateString("vi-VN") : "—";
      if (pr.status === "upcoming") {
        return `HĐ gia hạn ${pr.contractNumber || ""} — sắp hiệu lực từ ${from}. HĐ hiện tại vẫn active đến hết hạn.`;
      }
      return `Đã tạo HĐ gia hạn ${pr.contractNumber || ""} — chờ xử lý.`;
    }
    if (isBatchOpen) {
      const name = data?.extensionPeriod?.name ? `「${data.extensionPeriod.name}」` : "";
      return `Gia hạn hợp đồng đang mở${name}. Hết hạn đợt: ${formatPeriodEndVi(data?.extensionPeriod?.endDate)} — còn ${batchCountdown || "…"}. Gia hạn thêm ${batchMonths} tháng.`;
    }
    if (data?.renewalBlockReason) return data.renewalBlockReason;
    if (!data?.extensionEnabled) return null;
    if (primary?.status !== "active") return "Chỉ hợp đồng đang hoạt động mới được gia hạn.";
    if (daysLeft != null && daysLeft > renewalWindow) {
      return `Còn ${daysLeft} ngày — chỉ gia hạn khi còn tối đa ${renewalWindow} ngày trước hạn, hoặc khi BQL mở đợt gia hạn.`;
    }
    if (daysLeft != null && daysLeft < 0) return "Hợp đồng đã hết hạn.";
    return canRenew ? `Còn ${daysLeft} ngày đến hạn — bạn có thể gia hạn hợp đồng.` : "";
  }, [data, primary, canRenew, daysLeft, renewalWindow, isBatchOpen, batchMonths, batchCountdown]);

  const countdown = useMemo(() => {
    if (!primary || primary.status !== "active") return null;
    const d = daysRemaining(primary.endDate);
    if (d < 0) return { text: "Đã quá hạn kết thúc", warn: true };
    if (d <= 30) return { text: `Còn ${d} ngày đến hạn hợp đồng`, warn: true };
    return { text: `Còn ${d} ngày đến ngày kết thúc (${new Date(primary.endDate).toLocaleDateString("vi-VN")})`, warn: false };
  }, [primary]);

  const loadRenewPreview = useCallback(async (contractId: string, months?: number) => {
    setRenewPreviewLoading(true);
    try {
      const { data: preview } = await contractsApi.getRenewalPreview(contractId, months);
      setRenewPreview(preview);
    } catch (e2) {
      setRenewPreview(null);
      setErr(errMsg(e2));
    } finally {
      setRenewPreviewLoading(false);
    }
  }, []);

  const openRenewModal = (c: Contract) => {
    setRenewModalContract(c);
    setRenewConsent(false);
    setRenewPreview(null);
    const defaultMonths = monthsBetween(c.startDate, c.endDate) || 12;
    setRenewMonths(defaultMonths);
    void loadRenewPreview(c._id, isBatchOpen ? undefined : defaultMonths);
  };

  useEffect(() => {
    if (!renewModalContract || isBatchRenewal) return;
    void loadRenewPreview(renewModalContract._id, renewMonths);
  }, [renewMonths, renewModalContract, loadRenewPreview, isBatchRenewal]);

  const submitRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewModalContract || !renewConsent) return;
    setRenewSubmitting(true);
    setErr(null);
    try {
      const payload: { consentAccepted: true; months?: number } = { consentAccepted: true };
      if (!isBatchRenewal) payload.months = renewMonths;
      const { data: result } = await contractsApi.confirmRenewal(renewModalContract._id, payload);
      setRenewModalContract(null);
      setRenewPreview(null);
      setRenewConsent(false);
      const nc = result.newContract;
      message.success(
        `Đã tạo HĐ gia hạn ${nc?.contractNumber || ""} (sắp hiệu lực từ ${fmtDateDmy(nc?.startDate)}). HĐ hiện tại vẫn active.`
      );
      await load();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setRenewSubmitting(false);
    }
  };

  const signContract = async (c: Contract) => {
    if (!signConsent) {
      setErr("Vui lòng tích xác nhận điều khoản trước khi ký.");
      return;
    }
    setSignSubmitting(true);
    try {
      await contractsApi.sign(c._id, { consentAccepted: true });
      const transferLike =
        c.isTransferContract || String(c.contractNumber || "").startsWith("HD-CP");
      message.success(
        transferLike
          ? "Đã ký hợp đồng chuyển phòng. Hợp đồng phòng mới đã có hiệu lực."
          : "Sinh viên đã ký hợp đồng. Vui lòng chờ admin xác nhận thanh toán."
      );
      setViewModalContract(null);
      setSignConsent(false);
      await load();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setSignSubmitting(false);
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
    <div className="container pb-5" style={{ maxWidth: 960 }}>
      <h4 className="mb-1">Hợp đồng của tôi</h4>
      <p className="text-muted small mb-4">Xem thông tin KTX, thời hạn và gia hạn hợp đồng (tạo hợp đồng mới, giá theo bảng phòng hiện tại).</p>

      {err && (
        <div className="alert alert-danger py-2" role="alert">
          {err}
        </div>
      )}

      {!primary && (
        <div className="alert alert-info">Bạn chưa có hợp đồng nào trên hệ thống.</div>
      )}

      {primary && (
        <>
          {countdown && (
            <div className={`alert ${countdown.warn ? "alert-warning" : "alert-light border"} small mb-3`}>{countdown.text}</div>
          )}
          {primary.status === "active" && data && isBatchOpen && (
            <div className="alert alert-success small mb-3">
              <strong>Gia hạn hợp đồng đang mở</strong>
              {data.extensionPeriod?.name ? ` — ${data.extensionPeriod.name}` : ""}
              <div className="mt-1">
                Hết hạn đợt: <strong>{formatPeriodEndVi(data.extensionPeriod?.endDate)}</strong>
                {batchCountdown ? (
                  <>
                    {" "}
                    · Còn lại: <strong className="font-monospace">{batchCountdown}</strong>
                  </>
                ) : null}
              </div>
              <div className="mt-1 text-muted">Bạn có thể gia hạn thêm {batchMonths} tháng (tạo hợp đồng mới).</div>
            </div>
          )}
          {primary.status === "active" && data && !isBatchOpen && renewalHint && (
            <div className={`alert ${canRenew ? "alert-success" : "alert-secondary"} small mb-3`}>{renewalHint}</div>
          )}
          {data?.pendingRenewalContract && (
            <div className="alert alert-info small mb-3">
              <strong>Hợp đồng gia hạn:</strong> {data.pendingRenewalContract.contractNumber} —{" "}
              <span className="badge text-bg-info">Sắp có hiệu lực</span>
              <div className="mt-1">
                Bắt đầu: <strong>{fmtDateDmy(data.pendingRenewalContract.startDate)}</strong>
                {data.pendingRenewalContract.endDate ? (
                  <>
                    {" "}
                    · Kết thúc: <strong>{fmtDateDmy(data.pendingRenewalContract.endDate)}</strong>
                  </>
                ) : null}
              </div>
              <div className="mt-1 text-muted small">
                HĐ hiện tại vẫn đang hiệu lực; hệ thống tự chuyển giao khi đến ngày bắt đầu (không giải phóng phòng/giường).
              </div>
            </div>
          )}

          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="card h-100 shadow-sm">
                <div className="card-header bg-white fw-semibold">Thông tin sinh viên</div>
                <div className="card-body text-center">
                  {avatarSrc(student) ? (
                    <img src={avatarSrc(student) || ""} alt="" className="rounded-circle mb-2" width={88} height={88} style={{ objectFit: "cover" }} />
                  ) : (
                    <div
                      className="rounded-circle bg-primary-subtle text-primary mx-auto mb-2 d-flex align-items-center justify-content-center fw-bold"
                      style={{ width: 88, height: 88, fontSize: "1.5rem" }}
                    >
                      {(student?.fullName || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h6 className="mb-1">{student?.fullName || "—"}</h6>
                  <p className="small text-muted mb-0">Mã SV: {student?.studentId || "—"}</p>
                  <p className="small text-muted mb-0">{student?.email || "—"}</p>
                  <p className="small text-muted mb-0">SĐT: {student?.phone || "—"}</p>
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card h-100 shadow-sm">
                <div className="card-header bg-white fw-semibold">Thông tin phòng</div>
                <div className="card-body small">
                  <p className="mb-1">
                    <strong>Phòng:</strong> {(primary.room as Room)?.roomNumber || "—"}
                  </p>
                  <p className="mb-1">
                    <strong>Khu:</strong>{" "}
                    {typeof (primary.room as Room)?.area === "object" && (primary.room as Room).area
                      ? String(((primary.room as Room).area as { name?: string }).name)
                      : "—"}
                  </p>
                  <p className="mb-1">
                    <strong>Sức chứa (theo HĐ):</strong> {capacityAtSigning(primary, primary.room as Room)} chỗ
                  </p>
                  <p className="mb-0 text-muted">
                    Phòng hiện tại: {(primary.room as Room)?.capacity ?? "—"} chỗ / đang ở{" "}
                    {(primary.room as Room)?.currentOccupancy ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card h-100 shadow-sm border-primary border-opacity-25">
                <div className="card-header bg-primary text-white fw-semibold">
                  {contractAwaitingSign ? "Hợp đồng cần ký" : "Hợp đồng hiện tại"}
                </div>
                <div className="card-body small">
                  {contractCard ? (
                    <>
                      <p className="mb-2">
                        <span className={`badge ${statusBadge(contractCard.status).cls}`}>
                          {statusBadge(contractCard.status).label}
                        </span>
                        {contractAwaitingSign ? (
                          <span className="badge text-bg-warning text-dark ms-1">Chờ ký</span>
                        ) : null}
                      </p>
                      <p className="mb-1">
                        <strong>Số HĐ:</strong> {contractCard.contractNumber || "—"}
                      </p>
                      <p className="mb-1">
                        <strong>Bắt đầu:</strong> {new Date(contractCard.startDate).toLocaleDateString("vi-VN")}
                      </p>
                      <p className="mb-1">
                        <strong>Kết thúc:</strong> {new Date(contractCard.endDate).toLocaleDateString("vi-VN")}
                      </p>
                      <p className="mb-1">
                        <strong>Thời hạn (~tháng):</strong> {monthsBetween(contractCard.startDate, contractCard.endDate)}
                      </p>
                      <p className="mb-1">
                        <strong>Giá thuê / tháng (theo HĐ):</strong> {monthlyRentDisplay(contractCard)}
                        {contractCard.status === "active" && !contractAwaitingSign ? (
                          <span className="text-muted d-block small">Giá đóng băng — không đổi khi BQL cập nhật phòng</span>
                        ) : null}
                      </p>
                      <p className="mb-3">
                        <strong>Tiền cọc:</strong> {depositDisplay(contractCard)}
                      </p>
                      {contractAwaitingSign ? (
                        <div className="alert alert-warning py-2 small mb-2">
                          {contractAwaitingSign.isTransferContract ||
                          String(contractAwaitingSign.contractNumber || "").startsWith("HD-CP")
                            ? "Sau khi admin duyệt chuyển phòng, bạn cần ký hợp đồng mới (1 năm) tại đây."
                            : "Bạn cần ký xác nhận hợp đồng để hợp đồng có hiệu lực."}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-light btn-sm w-100 mb-2"
                        onClick={() => setViewModalContract(contractCard)}
                      >
                        Xem hợp đồng
                      </button>
                      {contractAwaitingSign ? (
                        <div className="border border-warning rounded p-2 mb-2 bg-warning bg-opacity-10">
                          <div className="form-check mb-2">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="signConsentInline"
                              checked={signConsent}
                              onChange={(e) => setSignConsent(e.target.checked)}
                            />
                            <label className="form-check-label small" htmlFor="signConsentInline">
                              {CONTRACT_CONSENT_LABEL}
                            </label>
                          </div>
                          <button
                            type="button"
                            className="btn btn-warning btn-sm w-100 fw-semibold"
                            disabled={!signConsent || signSubmitting}
                            onClick={() => void signContract(contractAwaitingSign)}
                          >
                            {signSubmitting ? "Đang ký…" : "Ký xác nhận hợp đồng"}
                          </button>
                        </div>
                      ) : null}
                      {primary?.status === "active" && canRenew && !contractAwaitingSign ? (
                        <button
                          type="button"
                          className="btn btn-warning btn-sm w-100 fw-semibold"
                          onClick={() => openRenewModal(primary)}
                        >
                          Gia hạn hợp đồng
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted mb-0">Chưa có hợp đồng.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {data && data.contracts.length > 1 && (
            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">Lịch sử hợp đồng</div>
              <div className="table-responsive">
                <table className="table table-sm table-striped mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Số HĐ</th>
                      <th>Phòng</th>
                      <th>Từ</th>
                      <th>Đến</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.contracts.map((c) => {
                      const b = statusBadge(c.status);
                      return (
                        <tr key={c._id}>
                          <td>{c.contractNumber}</td>
                          <td>{(c.room as Room)?.roomNumber}</td>
                          <td>{new Date(c.startDate).toLocaleDateString("vi-VN")}</td>
                          <td>{new Date(c.endDate).toLocaleDateString("vi-VN")}</td>
                          <td>
                            <span className={`badge ${b.cls}`}>{b.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">Lịch sử gia hạn (yêu cầu)</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Thời gian</th>
                    <th>Hợp đồng</th>
                    <th>Số tháng</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú / kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.extendRequests || []).map((r) => (
                    <ExtendRow key={r._id} r={r} />
                  ))}
                  {(!data?.extendRequests || data.extendRequests.length === 0) && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Chưa có yêu cầu gia hạn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {renewModalContract && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Gia hạn hợp đồng</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Đóng"
                  onClick={() => {
                    setRenewModalContract(null);
                    setRenewPreview(null);
                    setRenewConsent(false);
                  }}
                />
              </div>
              <form onSubmit={submitRenew}>
                <div className="modal-body">
                  <p className="small text-muted mb-3">
                    Hệ thống tạo <strong>hợp đồng mới</strong> (mã mới), không sửa hợp đồng hiện tại. Bạn tiếp tục ở phòng cũ; giá và sức chứa lấy từ bảng phòng tại thời điểm xác nhận.
                  </p>
                  {renewPreviewLoading && <p className="small text-muted">Đang tải biểu mẫu…</p>}
                  {renewPreview && (
                    <div className="border rounded p-3 mb-3 bg-light small">
                      <div className="row g-2">
                        <div className="col-md-6">
                          <strong>HĐ hiện tại</strong>
                          <div>{renewPreview.sourceContract.contractNumber}</div>
                          <div>Hết hạn: {fmtDateDmy(renewPreview.sourceContract.endDate)}</div>
                          <div>
                            Giá đang áp dụng: {fmtMoney(renewPreview.sourceContract.contractPrice ?? 0)}/tháng (chỗ)
                          </div>
                        </div>
                        <div className="col-md-6">
                          <strong>HĐ gia hạn (dự kiến)</strong>
                          <div>
                            Từ {fmtDateDmy(renewPreview.newContractPreview.startDate)} → {fmtDateDmy(renewPreview.newContractPreview.endDate)}
                          </div>
                          <div>
                            Giá mới:{" "}
                            <strong>{fmtMoney(renewPreview.newContractPreview.contractPrice)}</strong>/tháng (chỗ)
                          </div>
                          <div>Sức chứa phòng: {renewPreview.newContractPreview.roomCapacityAtSigning} chỗ</div>
                          {renewPreview.newContractPreview.priorityDiscountPercent ? (
                            <div className="text-success">
                              Ưu tiên: −{renewPreview.newContractPreview.priorityDiscountPercent}%
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {typeof renewPreview.newContractPreview.room === "object" && renewPreview.newContractPreview.room && (
                        <div className="mt-2">
                          Phòng: {(renewPreview.newContractPreview.room as Room).roomNumber}
                        </div>
                      )}
                    </div>
                  )}
                  {isBatchRenewal ? (
                    <p className="alert alert-info py-2 small mb-3">
                      <strong>Đợt gia hạn:</strong> thời hạn mới = ngày kết thúc HĐ cũ + đúng{" "}
                      <strong>{renewPreview?.batchExtensionMonths ?? batchMonths} tháng</strong>
                      {renewPreview?.extensionPeriod?.name ? ` (${renewPreview.extensionPeriod.name})` : ""}.
                    </p>
                  ) : (
                    <>
                      <label className="form-label">Thời hạn gia hạn</label>
                      <p className="small text-muted mb-1">
                        Mặc định bằng thời hạn HĐ hiện tại (~{monthsBetween(renewModalContract.startDate, renewModalContract.endDate)} tháng).
                      </p>
                      <select className="form-select mb-3" value={renewMonths} onChange={(e) => setRenewMonths(Number(e.target.value))}>
                        {[6, 9, 12, 18, 24, 36].map((m) => (
                          <option key={m} value={m}>
                            {m} tháng
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="renewConsent"
                      checked={renewConsent}
                      onChange={(e) => setRenewConsent(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="renewConsent">
                      {renewPreview?.consentText || CONTRACT_CONSENT_LABEL}
                    </label>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setRenewModalContract(null);
                      setRenewPreview(null);
                    }}
                  >
                    Đóng
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={renewSubmitting || !renewConsent || renewPreviewLoading}>
                    {renewSubmitting ? "Đang xử lý…" : "Xác nhận gia hạn"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {viewModalContract && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">HỢP ĐỒNG THUÊ CHỖ Ở NỘI TRÚ</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setViewModalContract(null)} />
              </div>
              <div className="modal-body small">
                {(() => {
                  const c = viewModalContract;
                  const r = c.room as Room | undefined;
                  const areaName =
                    typeof r?.area === "object" && r.area ? String((r.area as { name?: string }).name || "") : "";
                  const gender = String((student as { gender?: string } | null)?.gender || "");
                  const genderLabel = gender.toLowerCase().includes("nam") ? "Nam" : gender.toLowerCase().includes("nữ") || gender.toLowerCase().includes("nu") ? "Nữ" : "—";
                  const fee = roomFeePerSlot(c, r);
                  const roomFullMonthly = contractRoomMonthlySnapshot(c, r) || Math.round(Number(r?.currentPrice ?? r?.price ?? 0));
                  const slots = capacityAtSigning(c, r);
                  const months = monthsBetween(c.startDate, c.endDate) || 12;
                  const total = fee * months;
                  const deposit = c.depositAmount != null ? Number(c.depositAmount) : 100000;
                  const floor = (r as { floor?: number } | undefined)?.floor;
                  const roomFull = `Phòng ${(r as Room | undefined)?.roomNumber || "—"}${typeof floor === "number" ? `, Tầng ${floor}` : ""}${areaName ? `, Nhà ${areaName}` : ""} của KTX Trường ĐH.`;
                  const signedB = c.signedAt ? "Đã ký" : "Chưa ký";
                  const signedA = c.status === "active" ? "Đã xác nhận" : "Chờ admin xác nhận";
                  const statusNow =
                    c.status === "active"
                      ? "Có hiệu lực"
                      : c.signedAt
                        ? "Chưa hiệu lực (chờ admin xác nhận)"
                        : "Chưa hiệu lực (chờ ký + xác nhận ký)";

                  return (
                    <div style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
{`Số hợp đồng: ${c.contractNumber || "—"}

BÊN CHO THUÊ (BÊN A): KÝ TÚC XÁ TRƯỜNG ĐẠI HỌC (ĐH)

Địa chỉ: ................................................................................................

Điện thoại: .............................................................................................

BÊN THUÊ (BÊN B):

Họ và tên: ${student?.fullName || "—"}     Nam/Nữ: ${genderLabel}

Mã SV: ${student?.studentId || "—"}     CCCD: ${String((student as { citizenId?: string } | null)?.citizenId || "—")}

Ngày sinh: ${fmtDateDmy((student as { dateOfBirth?: string } | null)?.dateOfBirth || null)}     Dân tộc: -

Email: ${student?.email || "—"}

SĐT: ${student?.phone || "—"}

ĐIỀU 1: NỘI DUNG THUÊ

Bên A đồng ý cho Bên B thuê 01 chỗ ở nội trú tại: ${roomFull}

Bên B được sử dụng trang thiết bị tại phòng theo nội quy của Trường ĐH.

ĐIỀU 2: CHI PHÍ VÀ THANH TOÁN

Giá thuê: Phòng có ${slots} chỗ (slot). Tổng tiền thuê toàn phòng: ${roomFullMonthly.toLocaleString("vi-VN")} VNĐ/tháng. Giá thuê 01 chỗ (01 sinh viên — Bên B): ${Math.round(fee).toLocaleString("vi-VN")} VNĐ/tháng${c.monthlyRent != null && Number(c.monthlyRent) > 0 ? " (theo thỏa thuận trong hợp đồng)" : ` (= ${roomFullMonthly.toLocaleString("vi-VN")} ÷ ${slots})`}.
Tổng tiền Bên B thanh toán tiền thuê cho cả thời hạn (theo 01 chỗ, ${months} tháng): ${Math.round(total).toLocaleString("vi-VN")} VNĐ.

Tiền thế chấp tài sản: ${Math.round(deposit).toLocaleString("vi-VN")} VNĐ/sinh viên.

Thời hạn thuê: Từ ngày ${fmtDateDmy(c.startDate)} đến ngày ${fmtDateDmy(c.endDate)}.

Phương thức thanh toán: Thanh toán trực tuyến qua tài khoản của Trường ĐH tại thời điểm nhận phòng.

Tiền điện, nước: Thanh toán hàng tháng theo chỉ số công tơ và đơn giá quy định.

ĐIỀU 3: TRÁCH NHIỆM CỦA SINH VIÊN

Chấp hành nghiêm chỉnh pháp luật, nội quy KTX và quy định về PCCC.

Ở đúng vị trí được sắp xếp; không tự ý chuyển nhượng chỗ ở cho người khác.

Giữ gìn vệ sinh, bảo quản tài sản công. Bồi thường nếu gây hư hỏng, mất mát.

Thanh toán đầy đủ các khoản phí dịch vụ (điện, nước, gửi xe, wifi...) đúng hạn.

Bàn giao phòng và chìa khóa ngay khi hết hạn hợp đồng hoặc nghỉ hè/Tết.

ĐIỀU 4: CHẤM DỨT HỢP ĐỒNG

Hợp đồng chấm dứt khi: Hết thời hạn; SV tự nguyện xin ra; SV tốt nghiệp/thôi học; hoặc SV vi phạm kỷ luật bị buộc ra khỏi KTX.

(Lưu ý: Trường ĐH không hoàn trả phí nội trú nếu SV vi phạm kỷ luật hoặc chấm dứt hợp đồng sau 01 tháng).

ĐIỀU 5: ĐIỀU KHOẢN CHUNG

Mọi hư hỏng tài sản hoặc nợ phí sẽ được trừ vào tiền thế chấp. Sau khi hoàn tất thủ tục trả phòng, Trường ĐH sẽ hoàn trả lại tiền thế chấp cho sinh viên.

ĐẠI DIỆN BÊN B
(Ký, ghi rõ họ tên)
${signedB}

ĐẠI DIỆN BÊN A
(Ký, ghi rõ họ tên)
${signedA}

Trạng thái hiện tại: ${statusNow}

Hướng dẫn: ${c.signedAt ? "Bạn đã ký xác nhận. Vui lòng chờ admin xác nhận để hợp đồng có hiệu lực." : "Sinh viên chưa ký xác nhận hợp đồng."}
`}
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer flex-column flex-sm-row align-items-stretch gap-2">
                {needsStudentContractSign(viewModalContract) && (
                  <div className="form-check text-start me-auto mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="signConsent"
                      checked={signConsent}
                      onChange={(e) => setSignConsent(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="signConsent">
                      {CONTRACT_CONSENT_LABEL}
                    </label>
                  </div>
                )}
                <div className="d-flex gap-2 ms-sm-auto">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setViewModalContract(null);
                      setSignConsent(false);
                    }}
                  >
                    Đóng
                  </button>
                  {needsStudentContractSign(viewModalContract) && (
                    <button
                      type="button"
                      className="btn btn-warning"
                      disabled={!signConsent || signSubmitting}
                      onClick={() => void signContract(viewModalContract)}
                    >
                      {signSubmitting ? "Đang ký…" : "Ký xác nhận"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ExtendRow({ r }: { r: ContractExtendRequest }) {
  const cn = typeof r.contract === "object" ? r.contract.contractNumber || r.contract._id : r.contract;
  const newCn =
    typeof r.newContract === "object" && r.newContract
      ? (r.newContract as Contract).contractNumber || (r.newContract as Contract)._id
      : r.newContract
        ? String(r.newContract)
        : "—";
  let stLabel: string = r.status;
  let stCls = "text-bg-secondary";
  if (r.status === "pending") {
    stLabel = "Chờ duyệt";
    stCls = "text-bg-warning text-dark";
  } else if (r.status === "approved") {
    stLabel = "Đã xác nhận";
    stCls = "text-bg-success";
  } else if (r.status === "rejected") {
    stLabel = "Từ chối";
    stCls = "text-bg-danger";
  }
  const note =
    r.status === "approved" && r.appliedEndDate
      ? `HĐ mới đến ${new Date(r.appliedEndDate).toLocaleDateString("vi-VN")}${newCn !== "—" ? ` (${newCn})` : ""}`
      : r.note || r.adminNote || "—";
  return (
    <tr>
      <td className="small">
        {r.requestedAt || r.createdAt ? new Date(r.requestedAt || r.createdAt!).toLocaleString("vi-VN") : "—"}
      </td>
      <td>{cn}</td>
      <td>{r.requestedMonths ?? r.months}</td>
      <td>
        <span className={`badge ${stCls}`}>{stLabel}</span>
      </td>
      <td className="small">{note}</td>
    </tr>
  );
}

export default MyContractsPage;
