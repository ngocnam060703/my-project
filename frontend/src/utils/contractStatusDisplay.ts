import type { CSSProperties } from "react";
import dayjs from "dayjs";

/** Tag/badge trạng thái HĐ — cho phép xuống dòng, không vỡ cột bảng. */
export const contractStatusTagWrapStyle: CSSProperties = {
  fontWeight: 600,
  margin: 0,
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: 1.35,
  height: "auto",
  maxWidth: "100%",
  display: "inline-block",
  textAlign: "left",
};

export const contractStatusBadgeWrapStyle: CSSProperties = {
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: 1.35,
  maxWidth: "100%",
  display: "inline-block",
  verticalAlign: "middle",
};

export const CONTRACT_STATUS_TAG_CLASS = "contract-status-tag-wrap";

/** Nhãn tiếng Việt cho trạng thái hợp đồng KTX (đồng bộ backend Contract.status). */
export const CONTRACT_STATUS_VI: Record<string, string> = {
  pending_payment: "Chờ thanh toán",
  upcoming: "Sắp có hiệu lực",
  active: "Đang hiệu lực",
  completed: "Đã hoàn thành",
  expired: "Đã hết hạn",
  terminated: "Đã chấm dứt",
  cancelled: "Đã hủy",
  transferred_settled: "Đã thanh lý (chuyển phòng)",
  terminated_due_to_transfer: "Chấm dứt do chuyển phòng",
};

/** Admin: không dùng «chờ thanh toán» cho HĐ — thanh toán chỉ ở hóa đơn. */
export const CONTRACT_STATUS_VI_ADMIN: Record<string, string> = {
  ...CONTRACT_STATUS_VI,
  pending_payment: "Chưa hiệu lực",
};

const CONTRACT_STATUS_ANT_COLOR: Record<string, string> = {
  pending_payment: "gold",
  upcoming: "blue",
  active: "green",
  completed: "default",
  expired: "default",
  terminated: "default",
  cancelled: "default",
  transferred_settled: "default",
  terminated_due_to_transfer: "default",
};

export function contractStatusLabelVi(status?: string | null): string {
  const k = String(status || "").trim();
  if (!k) return "—";
  return CONTRACT_STATUS_VI[k] || k;
}

/** SV đã ký HĐ (đủ điều kiện; HĐ chuyển phòng cần thêm consentAcceptedAt). */
export function hasStudentSignedContract(c: {
  signedAt?: string | Date | null;
  studentSignStatus?: string | null;
  consentAcceptedAt?: string | Date | null;
  isTransferContract?: boolean;
  contractNumber?: string | null;
}): boolean {
  const signed = !!(c.signedAt || String(c.studentSignStatus || "") === "student_signed");
  if (!signed) return false;
  const cn = String(c.contractNumber || "");
  const transferLike = !!(c.isTransferContract || cn.startsWith("HD-CP"));
  if (transferLike) return !!c.consentAcceptedAt;
  return true;
}

/** Cần hiển thị nút / luồng ký trên trang sinh viên. */
export function needsStudentContractSign(c: {
  status?: string | null;
  signedAt?: string | Date | null;
  studentSignStatus?: string | null;
  consentAcceptedAt?: string | Date | null;
  isRenewalContract?: boolean;
  isTransferContract?: boolean;
  contractNumber?: string | null;
}): boolean {
  if (c.isRenewalContract) return false;
  if (hasStudentSignedContract(c)) return false;
  const st = String(c.status || "");
  const cn = String(c.contractNumber || "");
  const transferLike = !!(c.isTransferContract || cn.startsWith("HD-CP"));
  if (st === "pending_payment") return true;
  if (transferLike && !c.consentAcceptedAt) return true;
  if (st === "active" && transferLike && !c.consentAcceptedAt) return true;
  return false;
}

export function contractStatusAntTag(status?: string | null): { color: string; text: string } {
  const k = String(status || "").trim();
  return {
    color: CONTRACT_STATUS_ANT_COLOR[k] || "default",
    text: contractStatusLabelVi(k),
  };
}

/** Badge Bootstrap (trang sinh viên — Hợp đồng của tôi). */
export function contractStatusBootstrapBadge(
  status?: string | null,
  contract?: {
    signedAt?: string | Date | null;
    studentSignStatus?: string | null;
    consentAcceptedAt?: string | Date | null;
    isTransferContract?: boolean;
    contractNumber?: string | null;
  } | null,
): { cls: string; label: string } {
  const k = String(status || "").trim();
  if (k === "pending_payment" && contract && hasStudentSignedContract(contract)) {
    return { cls: "text-bg-info text-dark", label: "Đã ký — chờ admin xác nhận" };
  }
  const label = contractStatusLabelVi(k);
  switch (k) {
    case "active":
      return { cls: "text-bg-success", label };
    case "upcoming":
      return { cls: "text-bg-info text-dark", label };
    case "pending_payment":
      return { cls: "text-bg-warning text-dark", label: "Chờ ký & xác nhận" };
    case "completed":
    case "expired":
    case "transferred_settled":
    case "terminated_due_to_transfer":
      return { cls: "text-bg-secondary", label };
    case "terminated":
    case "cancelled":
      return { cls: "text-bg-danger", label };
    default:
      return { cls: "text-bg-light text-dark", label };
  }
}

export type ContractStatusRow = {
  _id?: string;
  status?: string;
  endDate?: string | Date | null;
  signedAt?: string | Date | null;
  paymentConfirmedAt?: string | Date | null;
  studentSignStatus?: string | null;
  consentAcceptedAt?: string | Date | null;
  isTransferContract?: boolean;
  contractNumber?: string | null;
};

/** HĐ đã được admin xác nhận — mới coi là có hiệu lực (backend status = active). */
export function isContractActiveStatus(status?: string | null): boolean {
  return String(status || "").trim() === "active";
}

/** SV đã ký nhưng admin chưa xác nhận + chưa upload PDF — chưa có hiệu lực. */
export function isContractAwaitingAdminConfirm(c: ContractStatusRow): boolean {
  if (String(c.status || "") !== "pending_payment") return false;
  if (c.paymentConfirmedAt) return false;
  return hasStudentSignedContract(c);
}

const AWAITING_ADMIN_CONFIRM_LABEL = "Đã ký — chờ admin xác nhận";

/** Nhãn trạng thái HĐ trên giao diện admin (có xét SV đã ký). */
export function contractStatusLabelViAdmin(
  status?: string | null,
  signedAt?: string | Date | null,
  contract?: {
    paymentConfirmedAt?: string | Date | null;
    studentSignStatus?: string | null;
    consentAcceptedAt?: string | Date | null;
    isTransferContract?: boolean;
    contractNumber?: string | null;
  } | null,
): string {
  const st = String(status || "").trim();
  const row: ContractStatusRow = { status: st, signedAt, ...contract };
  if (isContractAwaitingAdminConfirm(row)) return AWAITING_ADMIN_CONFIRM_LABEL;
  if (st === "pending_payment") return CONTRACT_STATUS_VI_ADMIN.pending_payment;
  return CONTRACT_STATUS_VI[st] || CONTRACT_STATUS_VI_ADMIN[st] || st || "—";
}

/**
 * Trạng thái HĐ cho admin: chỉ «Đang hiệu lực» khi status = active (sau admin xác nhận + PDF).
 */
export function contractStatusAntTagAdmin(
  c: ContractStatusRow,
  overdueContractIds?: Set<string>,
): { color: string; text: string } {
  const st = String(c.status || "");
  const cid = c._id ? String(c._id) : "";
  const end = c.endDate ? dayjs(c.endDate) : null;
  const expiredByDate = !!(end && end.isBefore(dayjs(), "day"));
  const settledLike = ["expired", "terminated", "cancelled", "transferred_settled", "terminated_due_to_transfer"].includes(
    st,
  );
  if (cid && overdueContractIds?.has(cid) && !settledLike && isContractActiveStatus(st)) {
    return { color: "red", text: "Hóa đơn quá hạn" };
  }
  if (st === "active" && expiredByDate) return { color: "orange", text: "Hết hạn" };
  if (isContractAwaitingAdminConfirm(c)) {
    return { color: "blue", text: AWAITING_ADMIN_CONFIRM_LABEL };
  }
  if (st === "pending_payment") {
    return { color: "gold", text: CONTRACT_STATUS_VI_ADMIN.pending_payment };
  }
  const color = CONTRACT_STATUS_ANT_COLOR[st] || "default";
  return { color, text: contractStatusLabelVi(st) };
}

/** @deprecated Dùng contractStatusAntTagAdmin */
export function contractStatusAntTagEnterprise(
  c: ContractStatusRow,
  overdueContractIds?: Set<string>,
): { color: string; text: string } {
  return contractStatusAntTagAdmin(c, overdueContractIds);
}

/** Map filter trạng thái — trang admin quản lý HĐ. */
export function buildContractStatusMapForAdmin(): Record<string, { color: string; text: string }> {
  const map: Record<string, { color: string; text: string }> = {};
  for (const key of Object.keys(CONTRACT_STATUS_VI_ADMIN)) {
    map[key] = {
      color: CONTRACT_STATUS_ANT_COLOR[key] || "default",
      text: CONTRACT_STATUS_VI_ADMIN[key],
    };
  }
  return map;
}

/** Map cho Ant Design — mặc định (sinh viên / dùng chung khi không cần ngữ cảnh admin). */
export function buildContractStatusMapForAnt(): Record<string, { color: string; text: string }> {
  const map: Record<string, { color: string; text: string }> = {};
  for (const key of Object.keys(CONTRACT_STATUS_VI)) {
    map[key] = contractStatusAntTag(key);
  }
  return map;
}
