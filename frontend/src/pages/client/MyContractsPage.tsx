/**
 * Module "Hợp đồng của tôi" — Bootstrap 5: thông tin SV, phòng, HĐ, countdown, yêu cầu gia hạn.
 * API: GET /api/my-contract, GET /api/contracts/:id, POST /api/contracts/:id/request-extend
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { isAxiosError } from "axios";
import { contractsApi, dashboardApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import { useAuth } from "../../contexts/AuthContext";
import type { Contract, ContractExtendRequest, MyContractOverview, Room } from "../../types";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n)).toLocaleString("vi-VN")}đ`;
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

function statusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "active":
      return { cls: "text-bg-success", label: "Đang hiệu lực" };
    case "pending_payment":
      return { cls: "text-bg-warning text-dark", label: "Chờ thanh toán / chờ hiệu lực" };
    case "expired":
      return { cls: "text-bg-secondary", label: "Hết hạn" };
    case "terminated":
      return { cls: "text-bg-danger", label: "Đã kết thúc" };
    default:
      return { cls: "text-bg-light text-dark", label: status };
  }
}

function monthlyRentDisplay(c: Contract): string {
  if (c.monthlyRent != null && c.monthlyRent > 0) return fmtMoney(c.monthlyRent);
  const r = c.room as Room | undefined;
  if (r?.pricePerPerson != null && r.pricePerPerson > 0) return fmtMoney(r.pricePerPerson);
  if (r?.price != null) return fmtMoney(r.price);
  return "—";
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
  const [extendModalContract, setExtendModalContract] = useState<Contract | null>(null);
  const [extendMonths, setExtendMonths] = useState(6);
  const [extendSubmitting, setExtendSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: d } = await contractsApi.getMyContractOverview();
      setData(d);
    } catch (firstErr) {
      /** Backend cũ chưa mount GET /api/my-contract → dùng GET /contracts/my + setting gia hạn */
      try {
        const [contractsRes, settingRes] = await Promise.all([
          contractsApi.getMy(),
          dashboardApi.getContractExtensionSetting().catch(() => ({ data: { enable_contract_extension: true } })),
        ]);
        const contracts = (contractsRes.data as Contract[]) || [];
        setData({
          student: null,
          contracts,
          activeContract: contracts.find((c) => c.status === "active") || null,
          extendRequests: [],
          extensionEnabled:
            (settingRes.data as { enable_contract_extension?: boolean } | undefined)?.enable_contract_extension !== false,
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
    return () => {
      socket.off("contract:extended", onExt);
    };
  }, [socket, authUser, load]);

  const primary = data?.activeContract || data?.contracts?.[0] || null;
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

  const countdown = useMemo(() => {
    if (!primary || primary.status !== "active") return null;
    const d = daysRemaining(primary.endDate);
    if (d < 0) return { text: "Đã quá hạn kết thúc", warn: true };
    if (d <= 30) return { text: `Còn ${d} ngày đến hạn hợp đồng`, warn: true };
    return { text: `Còn ${d} ngày đến ngày kết thúc (${new Date(primary.endDate).toLocaleDateString("vi-VN")})`, warn: false };
  }, [primary]);

  const submitExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendModalContract) return;
    setExtendSubmitting(true);
    try {
      await contractsApi.requestExtend(extendModalContract._id, extendMonths);
      setExtendModalContract(null);
      await load();
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setExtendSubmitting(false);
    }
  };

  const signContract = async (c: Contract) => {
    try {
      await contractsApi.sign(c._id);
      await load();
    } catch (e2) {
      setErr(errMsg(e2));
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
      <p className="text-muted small mb-4">Xem thông tin KTX, thời hạn và gửi yêu cầu gia hạn (admin duyệt).</p>

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
                  <p className="mb-0">
                    <strong>Sức chứa / đang ở:</strong> {(primary.room as Room)?.capacity ?? "—"} /{" "}
                    {(primary.room as Room)?.currentOccupancy ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card h-100 shadow-sm border-primary border-opacity-25">
                <div className="card-header bg-primary text-white fw-semibold">Hợp đồng hiện tại</div>
                <div className="card-body small">
                  <p className="mb-2">
                    <span className={`badge ${statusBadge(primary.status).cls}`}>{statusBadge(primary.status).label}</span>
                  </p>
                  <p className="mb-1">
                    <strong>Số HĐ:</strong> {primary.contractNumber || "—"}
                  </p>
                  <p className="mb-1">
                    <strong>Bắt đầu:</strong> {new Date(primary.startDate).toLocaleDateString("vi-VN")}
                  </p>
                  <p className="mb-1">
                    <strong>Kết thúc:</strong> {new Date(primary.endDate).toLocaleDateString("vi-VN")}
                  </p>
                  <p className="mb-1">
                    <strong>Thời hạn (~tháng):</strong> {monthsBetween(primary.startDate, primary.endDate)}
                  </p>
                  <p className="mb-1">
                    <strong>Giá thuê / tháng:</strong> {monthlyRentDisplay(primary)}
                  </p>
                  <p className="mb-3">
                    <strong>Tiền cọc:</strong> {depositDisplay(primary)}
                  </p>
                  {primary.status === "pending_payment" && !primary.signedAt && (
                    <button type="button" className="btn btn-warning btn-sm w-100" onClick={() => void signContract(primary)}>
                      Ký xác nhận (chờ BQL xác nhận thanh toán)
                    </button>
                  )}
                  {primary.status === "active" && Boolean(data?.extensionEnabled) && (
                    <button type="button" className="btn btn-outline-primary btn-sm w-100" onClick={() => setExtendModalContract(primary)}>
                      Yêu cầu gia hạn
                    </button>
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

      {extendModalContract && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Yêu cầu gia hạn</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setExtendModalContract(null)} />
              </div>
              <form onSubmit={submitExtend}>
                <div className="modal-body">
                  <p className="small text-muted">
                    Gửi yêu cầu gia hạn thêm số tháng. Trạng thái sẽ là <strong>chờ duyệt</strong> cho đến khi BQL xử lý. Chỉ áp dụng khi hợp đồng đang{" "}
                    <strong>active</strong>.
                  </p>
                  <label className="form-label">Số tháng gia hạn</label>
                  <select className="form-select" value={extendMonths} onChange={(e) => setExtendMonths(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36].map((m) => (
                      <option key={m} value={m}>
                        {m} tháng
                      </option>
                    ))}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setExtendModalContract(null)}>
                    Đóng
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={extendSubmitting}>
                    {extendSubmitting ? "Đang gửi…" : "Gửi yêu cầu"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ExtendRow({ r }: { r: ContractExtendRequest }) {
  const cn = typeof r.contract === "object" ? r.contract.contractNumber || r.contract._id : r.contract;
  let stLabel: string = r.status;
  let stCls = "text-bg-secondary";
  if (r.status === "pending") {
    stLabel = "Chờ duyệt";
    stCls = "text-bg-warning text-dark";
  } else if (r.status === "approved") {
    stLabel = "Đã duyệt";
    stCls = "text-bg-success";
  } else if (r.status === "rejected") {
    stLabel = "Từ chối";
    stCls = "text-bg-danger";
  }
  const note =
    r.status === "approved" && r.appliedEndDate
      ? `Ngày kết thúc mới: ${new Date(r.appliedEndDate).toLocaleDateString("vi-VN")}`
      : r.note || "—";
  return (
    <tr>
      <td className="small">{r.createdAt ? new Date(r.createdAt).toLocaleString("vi-VN") : "—"}</td>
      <td>{cn}</td>
      <td>{r.months}</td>
      <td>
        <span className={`badge ${stCls}`}>{stLabel}</span>
      </td>
      <td className="small">{note}</td>
    </tr>
  );
}

export default MyContractsPage;
