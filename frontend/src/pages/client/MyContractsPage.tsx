/**
 * Module "Hợp đồng của tôi" — Bootstrap 5: thông tin SV, phòng, HĐ, countdown, yêu cầu gia hạn.
 * API: GET /api/my-contract, GET /api/contracts/:id, POST /api/contracts/:id/request-extend
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { message } from "antd";
import { isAxiosError } from "axios";
import { contractsApi, dashboardApi, extensionPeriodsApi } from "../../api";
import { useSocket } from "../../contexts/SocketContext";
import { useAuth } from "../../contexts/AuthContext";
import type { Contract, ContractExtendRequest, MyContractOverview, Room } from "../../types";

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

function statusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "active":
      return { cls: "text-bg-success", label: "Đang hiệu lực" };
    case "pending_payment":
      return { cls: "text-bg-warning text-dark", label: "Chưa hiệu lực (chờ ký + xác nhận)" };
    case "expired":
      return { cls: "text-bg-secondary", label: "Hết hạn" };
    case "terminated":
      return { cls: "text-bg-danger", label: "Đã kết thúc" };
    default:
      return { cls: "text-bg-light text-dark", label: status };
  }
}

function roomFeePerSlot(c: Contract): number {
  if (c.monthlyRent != null && c.monthlyRent > 0) return Number(c.monthlyRent);
  const r = c.room as Room | undefined;
  const price = Number(r?.price ?? 0);
  const cap = Number(r?.capacity ?? 0);
  const slots = Number.isFinite(cap) && cap >= 1 ? cap : 1;
  return Math.round(price / slots);
}

function monthlyRentDisplay(c: Contract): string {
  return fmtMoney(roomFeePerSlot(c));
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
  const [viewModalContract, setViewModalContract] = useState<Contract | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: d } = await contractsApi.getMyContractOverview();
      setData(d);
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
        setData({
          student: null,
          contracts,
          activeContract: contracts.find((c) => c.status === "active") || null,
          extendRequests: [],
          extensionEnabled: globallyEnabled,
          extensionPeriod,
          canRequestExtension: globallyEnabled && extensionPeriod.isOpen,
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

  const canExtend = Boolean(data?.canRequestExtension);
  const extensionHint = useMemo(() => {
    if (data?.extensionBlockReason) return data.extensionBlockReason;
    if (!data?.extensionEnabled) return "Chức năng gia hạn đang tắt trên hệ thống.";
    if (!data?.extensionPeriod?.isOpen) return "Hiện chưa trong đợt gia hạn. Vui lòng chờ Ban quản lý mở đợt.";
    if (data?.hasPendingExtendRequest) return "Bạn đã gửi yêu cầu gia hạn — đang chờ Ban quản lý duyệt.";
    const end = data.extensionPeriod.endDate;
    const daysLeft = data.daysUntilContractEnd;
    const windowDays = data.eligibilityDays ?? 60;
    if (typeof daysLeft === "number" && daysLeft > windowDays) {
      return `Hợp đồng còn ${daysLeft} ngày. Bạn có thể gửi yêu cầu khi còn tối đa ${windowDays} ngày trước hạn.`;
    }
    return end
      ? `Đang trong đợt gia hạn — hết hạn nhận đơn ${new Date(end).toLocaleString("vi-VN")}.`
      : "Đang trong đợt gia hạn — bạn có thể gửi yêu cầu.";
  }, [data?.extensionEnabled, data?.extensionPeriod, data?.extensionBlockReason, data?.hasPendingExtendRequest, data?.daysUntilContractEnd, data?.eligibilityDays]);

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
      message.success("Đã gửi yêu cầu gia hạn — chờ Ban quản lý duyệt.");
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
      message.success("Đã ký xác nhận hợp đồng. Vui lòng chờ admin xác nhận thanh toán.");
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
          {primary.status === "active" && data && (
            <div className={`alert ${canExtend ? "alert-success" : "alert-secondary"} small mb-3`}>{extensionHint}</div>
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
                  <button type="button" className="btn btn-outline-light btn-sm w-100 mb-2" onClick={() => setViewModalContract(primary)}>
                    Xem hợp đồng
                  </button>
                  {primary.status === "pending_payment" && !primary.signedAt && (
                    <button type="button" className="btn btn-warning btn-sm w-100" onClick={() => void signContract(primary)}>
                      Ký xác nhận hợp đồng
                    </button>
                  )}
                  {primary.status === "active" && (
                    <button
                      type="button"
                      className={`btn btn-sm w-100 ${canExtend ? "btn-outline-primary" : "btn-outline-secondary"}`}
                      disabled={!canExtend}
                      title={!canExtend ? extensionHint : undefined}
                      onClick={() => canExtend && setExtendModalContract(primary)}
                    >
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
                  const fee = roomFeePerSlot(c);
                  const roomFullMonthly = Math.round(Number(r?.price ?? 0));
                  const slots = (() => {
                    const cap = Number(r?.capacity ?? 0);
                    return Number.isFinite(cap) && cap >= 1 ? cap : 1;
                  })();
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
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setViewModalContract(null)}>
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
