export interface User {
  _id: string;
  email: string;
  fullName: string;
  role: string;
  status?: "pending" | "approved" | "rejected" | string;
  approvedAt?: string | null;
  approvedBy?: string | User | null;
  rejectionReason?: string;
  /** Ảnh đại diện (URL tuyệt đối hoặc path — tuỳ backend) */
  avatar?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  phone?: string;
  studentId?: string;
  /** Lớp hành chính */
  className?: string;
  /** Khoa/nhóm ngành */
  facultyGroup?: string;
  major?: string;
  gender?: string;
  citizenId?: string;
  dateOfBirth?: string;
  address?: string;
  isSuperAdmin?: boolean;
  /** Khóa (VD: K26) */
  faculty?: string;
  enrollmentDate?: string;
  homeroomTeacher?: string;
  addressNative?: string;
  addressPermanent?: string;
  ethnicity?: string;
  priorityType?: "normal" | "martyr_child" | "invalid_child" | "minority" | "disabled";
  priorityProofUrl?: string | null;
  checkInDate?: string | null;
  addressTemporary?: string;
  addressAbsent?: string;
  familyFatherName?: string;
  familyFatherPhone?: string;
  familyMotherName?: string;
  familyMotherPhone?: string;
  familyEmergencyPhone?: string;
  /** Khu KTX được gán cho tài khoản quản lý (ref Area) */
  managedArea?: Area | string | null;
}

export type StudentPriorityType = "normal" | "martyr_child" | "invalid_child" | "minority" | "disabled";

export interface StudentProfile {
  _id?: string;
  fullName?: string;
  email?: string;
  studentId?: string;
  className?: string;
  major?: string;
  facultyGroup?: string;
  gender?: string;
  phone?: string;
  address?: string;
  citizenId?: string;
  dateOfBirth?: string | null;
  faculty?: string;
  enrollmentDate?: string | null;
  homeroomTeacher?: string;
  avatar?: string;
  addressNative?: string;
  addressPermanent?: string;
  addressTemporary?: string;
  ethnicity?: string;
  priorityType?: StudentPriorityType;
  priorityProofUrl?: string | null;
  checkInDate?: string | null;
  familyFatherName?: string;
  familyFatherPhone?: string;
  familyMotherName?: string;
  familyMotherPhone?: string;
  familyEmergencyPhone?: string;
}

/** Một dòng lịch sử cư trú theo hợp đồng (+ BedHistory: check-in/out, ghi chú) */
export interface StayHistoryRow {
  contractId: string;
  contractNumber?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  areaName?: string;
  roomNumber?: string;
  bedCode?: string;
  /** VD: A101-01 */
  bedSlotDisplay?: string;
  /** Ngày check-in thực tế (sự kiện checked_in hoặc snapshot giường) */
  checkInAt?: string | Date | null;
  /** Ngày check-out thực tế (sự kiện checked_out) */
  checkOutAt?: string | Date | null;
  /** Theo kỳ HĐ hiện hành / đã kết thúc */
  residencyStayStatus?:
    | "pending_checkin"
    | "staying"
    | "checked_out"
    | "pending_bed"
    | "not_started"
    | string;
  /** Ghi chú từ lịch sử giường (chuyển phòng, checkout, …) */
  note?: string;
  studentName?: string;
  studentId?: string;
}

/** GET /users/:id — payload đầy đủ cho admin */
export interface AdminUserDetailResponse {
  user: User;
  currentRoom: Room | null;
  currentContract: Contract | null;
  contracts: Contract[];
  /** Chỉ có khi user.role === "manager" — danh sách khu phụ trách */
  managedAreas?: Area[];
  /** Sinh viên: các kỳ ở theo từng hợp đồng */
  stayHistory?: StayHistoryRow[];
  /** Sinh viên: công nợ & hóa đơn chưa thanh toán */
  financialSummary?: {
    debtTotal: number;
    unpaidCount: number;
    unpaidBills: Bill[];
  } | null;
  /** Sinh viên: vi phạm gần đây */
  violationsRecent?: Violation[];
  /** Sinh viên: trạng thái vận hành cư trú theo giường/HĐ */
  residencyOperationalStatus?:
    | "no_active_contract"
    | "contract_no_bed"
    | "no_bed_assigned"
    | "assigned_pending_checkin"
    | "checked_in_staying"
    | string
    | null;
}

export interface StudentProfileResponse {
  student: StudentProfile & User;
  currentRoom: Room | null;
  currentContract: Contract | null;
  contracts: Contract[];
  residenceStatus: "dang_o" | "da_roi";
}

export interface Area {
  _id: string;
  name: string;
  description?: string;
  manager?: User;
  genderPolicy?: "male" | "female" | "mixed";
  /** Số phòng thực tế trong DB */
  totalRooms?: number;
  actualTotalRooms?: number;
  plannedTotalRooms?: number | null;
  plannedCapacity?: number | null;
  effectiveCapacity?: number;
  currentStudents?: number;
  totalStudents?: number;
  zoneStatus?: "available" | "full";
  occupancyStatus?: "empty" | "available" | "full";
  fillPercent?: number;
  createdAt?: string;
}

export interface ZoneDetailResponse {
  zone: Area;
  rooms: Room[];
  summary: {
    currentStudents: number;
    effectiveCapacity: number;
    fillPercent: number;
    zoneStatus: "available" | "full";
  };
}

export interface Room {
  _id: string;
  roomNumber: string;
  area: Area | string;
  capacity: number;
  currentOccupancy: number;
  price: number;
  currentPrice?: number;
  maxCapacity?: number;
  pricePerPerson?: number;
  floor?: number;
  status: string;
  description?: string;
  amenities?: string[];
}

/** Đơn xét duyệt KTX (module Application — phân phòng khi admin duyệt) */
export interface DormApplication {
  _id: string;
  user: User;
  genderSnapshot: "male" | "female" | "unknown";
  preferenceArea?: Area | null;
  semester: string;
  schoolYear: string;
  startDate?: string;
  priorityCategory?: "none" | "ho_ngheo" | "con_thuong_binh" | "chinh_sach";
  status: "pending" | "approved" | "rejected";
  assignedRoom?: Room | null;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedBy?: User | null;
  reviewedAt?: string | null;
  linkedContract?: Contract | string | null;
}

export interface TransferEligibilityContext {
  canTransfer: boolean;
  hasUpcomingRenewal: boolean;
  message?: string;
  warningMessage?: string | null;
  newContractEndDate?: string;
  upcomingRefundPreview?: number;
  activeContract?: {
    _id: string;
    contractNumber?: string;
    endDate?: string;
    roomNumber?: string;
  };
  upcomingContract?: {
    _id: string;
    contractNumber?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  } | null;
}

export interface TransferFinancialSnapshot {
  transferDate?: string;
  month?: number;
  year?: number;
  daysInMonth?: number;
  daysUsedOld?: number;
  daysRemaining?: number;
  oldMonthlySlotPrice?: number;
  newMonthlySlotPrice?: number;
  oldActualCharge?: number;
  newRemainingCharge?: number;
  amountPaidAtMonthStart?: number;
  prepaidSurplus?: number;
  supplementAmount?: number;
  walletCreditAmount?: number;
  financialAction?: "none" | "supplement" | "wallet_credit";
  priceComparison?: "higher" | "lower" | "equal";
  labels?: {
    oldRoom?: { roomNumber?: string; areaName?: string };
    newRoom?: { roomNumber?: string; areaName?: string };
  };
  oldContractNumber?: string;
  registrationDate?: string;
  approvalDate?: string;
  newContractStartDate?: string;
  newContractEndDate?: string;
  annualNewContractValue?: number;
  overlapDays?: number;
  overlapCharge?: number;
  upcomingRenewal?: {
    contractId?: string;
    contractNumber?: string;
    refundAmount?: number;
    willCancel?: boolean;
  } | null;
}

export interface Registration {
  _id: string;
  user: User;
  room: Room;
  registrationType?: "dorm" | "transfer";
  fromRoom?: Room;
  currentContract?: { _id: string; contractNumber?: string; status?: string };
  newContract?: { _id: string; contractNumber?: string; status?: string };
  transferPhase?: "awaiting_confirmation" | "completed" | null;
  financialSnapshot?: TransferFinancialSnapshot | null;
  studentConfirmedAt?: string;
  transferExecutedAt?: string;
  semester: string;
  schoolYear: string;
  startDate?: string;
  status: string;
  createdAt: string;
  rejectionReason?: string;
  note?: string;
  transferReason?: string;
}

export interface Contract {
  _id: string;
  user: User;
  room: Room;
  startDate: string;
  endDate: string;
  status: string;
  contractNumber?: string;
  signedAt?: string | null;
  consentAcceptedAt?: string | null;
  studentSignStatus?: "pending" | "student_signed";
  signedPdfUrl?: string;
  studentConfirmedAt?: string | null;
  paymentConfirmedAt?: string | null;
  terms?: string;
  application?: string | null;
  contractPrice?: number;
  roomCurrentPriceSnapshot?: number;
  roomCapacityAtSigning?: number;
  priorityDiscountPercent?: number;
  monthlyRent?: number | null;
  depositAmount?: number | null;
  renewedFromContract?: string | Contract | null;
  isRenewalContract?: boolean;
  isTransferContract?: boolean;
  bed?: string | Bed | null;
  financialLockedAt?: string | null;
  displayPricing?: {
    pricingFrozen?: boolean;
    contractPrice?: number;
    roomMonthlySnapshot?: number;
    roomCapacityAtSigning?: number;
    baseSlotPriceBeforeDiscount?: number;
    priorityDiscountPercent?: number;
  };
}

export interface ContractRenewalPreview {
  renewalMode?: "batch" | "individual";
  fixedTerm?: boolean;
  batchExtensionMonths?: number;
  extensionPeriod?: ExtensionPeriodInfo;
  sourceContract: {
    _id: string;
    contractNumber?: string;
    endDate: string;
    contractPrice?: number;
    roomCapacityAtSigning?: number;
  };
  newContractPreview: {
    startDate: string;
    endDate: string;
    months: number;
    contractPrice: number;
    roomCurrentPriceSnapshot: number;
    roomCapacityAtSigning: number;
    priorityDiscountPercent?: number;
    room?: Room;
  };
  consentText: string;
  consentTextVersion?: string;
}

export interface Bed {
  _id: string;
  room: string | Room;
  code: string; // A1, A2, B1...
  status: "available" | "occupied" | "reserved" | "maintenance" | "locked" | string;
  currentUser?: string | User | null;
  currentContract?: string | Contract | null;
  assignedAt?: string | null;
  checkInAt?: string | null;
  /** Server enrich (GET /rooms/:id/beds) */
  residencyPhase?: string;
  equipmentStatus?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Thống kê slot giường theo phòng */
export interface RoomSlotStats {
  totalSlots: number;
  occupiedSlots: number;
  reservedSlots: number;
  emptySlots: number;
  fillRatePercent: number;
}

export interface BedHistory {
  _id: string;
  bed: string | Bed;
  room: string | Room;
  user?: string | User | null;
  contract?: string | Contract | null;
  action: "assigned" | "transferred_in" | "transferred_out" | "checked_out" | "status_changed" | "note_updated" | string;
  fromBedCode?: string;
  toBedCode?: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
  performedBy?: string | User | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Yêu cầu gia hạn hợp đồng (sinh viên → admin duyệt) */
export interface ContractExtendRequest {
  _id: string;
  contract: Contract | { _id?: string; contractNumber?: string; status?: string; endDate?: string; startDate?: string; signedAt?: string | null; signedPdfUrl?: string };
  user?: string | User;
  months: number;
  requestedMonths?: number;
  status: "pending" | "approved" | "rejected";
  snapshotEndDate?: string;
  appliedEndDate?: string | null;
  newContract?: string | Contract | null;
  adminNote?: string;
  requestedAt?: string;
  note?: string;
  reviewedAt?: string | null;
  reviewedBy?: string | User;
  extensionPeriod?: { _id?: string; name?: string; startDate?: string; endDate?: string } | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExtensionPeriodInfo {
  isOpen: boolean;
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface MyContractOverview {
  student: Pick<User, "fullName" | "email" | "phone" | "studentId" | "gender" | "citizenId" | "dateOfBirth" | "avatar"> | null;
  contracts: Contract[];
  activeContract: Contract | null;
  extendRequests: ContractExtendRequest[];
  extensionEnabled: boolean;
  extensionPeriod?: ExtensionPeriodInfo;
  canRequestExtension?: boolean;
  canRenewContract?: boolean;
  extensionBlockReason?: string | null;
  renewalBlockReason?: string | null;
  renewalWindowDays?: number;
  renewalMode?: "batch" | "individual";
  batchExtensionMonths?: number;
  pendingRenewalContract?: Contract | null;
  hasPendingExtendRequest?: boolean;
  daysUntilContractEnd?: number | null;
  eligibilityDays?: number;
}

export interface BillPaymentHistoryEntry {
  at?: string;
  action?: "paid" | "created" | "adjusted";
  method?: string;
  reference?: string;
  amount?: number;
  note?: string;
}

export interface Bill {
  _id: string;
  billCode?: string;
  user: User;
  contract?: Contract | string;
  room: Room;
  month: number;
  year: number;
  roomFee: number;
  electricityFee: number;
  waterFee: number;
  otherFee?: number;
  sharedCommonFee?: number;
  personalServiceFee?: number;
  occupants?: number;
  total: number;
  /** Alias backend trả về ở GET /bills/:id */
  amount?: number;
  status: "unpaid" | "pending" | "paid" | "overdue" | string;
  dueDate: string;
  createdAt?: string;
  paidAt?: string;
  paidBy?: User | string | null;
  paymentMethod?: "manual" | "online" | "counter" | "vnpay" | "cash";
  paymentReference?: string;
  paymentHistory?: BillPaymentHistoryEntry[];
  note?: string;
  billType?: "monthly" | "penalty" | "damage_reimbursement";
  violation?: string | { _id?: string; ruleName?: string; description?: string; fineAmount?: number; compensationAmount?: number; createdAt?: string };
  penaltyBreakdown?: Array<{ label?: string; amount?: number }>;
  personalServiceBreakdown?: Array<{
    service?: string;
    name?: string;
    unit?: string;
    quantity?: number;
    amount?: number;
  }>;
}

export interface ViolationRule {
  _id: string;
  order: number;
  code: string;
  name: string;
  severity: "light" | "medium" | "heavy";
  points: number;
  fineMin: number;
  fineMax: number;
  compensationRequired: boolean;
  compensationNote?: string;
  handlingAction?: string;
  canImmediateExpulsion?: boolean;
}

export type ViolationStatus = "pending" | "resolved";

export type DisciplinaryActionType = "warning" | "fine" | "expulsion";

export interface ViolationResolution {
  actionType: DisciplinaryActionType;
  penaltyAmount?: number;
  note?: string;
  resolvedAt?: string;
  resolvedBy?: User | string;
}

export interface Violation {
  _id: string;
  rule?: ViolationRule | string;
  user?: User | string;
  room?: Room | string;
  semester: string;
  schoolYear: string;
  ruleName?: string;
  severity: string;
  points: number;
  fineAmount: number;
  compensationAmount: number;
  description?: string;
  images?: string[];
  splitToRoom?: boolean;
  noIndividualPoints?: boolean;
  immediateExpulsion?: boolean;
  createdAt?: string;
  recordedBy?: User | string;
  bill?: string | { _id?: string };
  totalRecordedAmount?: number;
  status?: ViolationStatus;
  resolution?: ViolationResolution | null;
}

/** Khai báo hư hỏng / sự cố phòng (module Maintenance) */
export type MaintenanceIncidentType = "electricity" | "water" | "equipment" | "other";
export type MaintenanceReportStatus = "pending" | "processing" | "resolved" | "cancelled";
export type MaintenanceSeverity = "light" | "medium" | "heavy" | "";
export type MaintenanceDamageCause = "natural_wear" | "student_caused" | "";
export type MaintenanceResolutionType = "maintenance" | "compensation" | "";
export type MaintenanceStatus = "none" | "scheduled" | "in_progress" | "completed" | "";

export interface MaintenanceReport {
  _id: string;
  user?: User | string;
  room?: Room | string;
  incidentType: MaintenanceIncidentType;
  description: string;
  images?: string[];
  status: MaintenanceReportStatus;
  adminNote?: string;
  requestCode?: string;
  severity?: MaintenanceSeverity;
  damageCause?: MaintenanceDamageCause;
  resolutionType?: MaintenanceResolutionType;
  compensationAmount?: number;
  maintenanceStatus?: MaintenanceStatus;
  bill?: Bill | string | null;
  processedAt?: string | null;
  processedBy?: User | string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Lịch của tôi — GET /my-schedule (tổng hợp động) */
export type ScheduleEventType = "payment" | "contract" | "maintenance" | "event";

export interface ScheduleEvent {
  id: string;
  title: string;
  description: string;
  type: ScheduleEventType;
  startDate: string;
  endDate: string;
  status?: string;
  createdAt?: string;
  ref?: { kind: string; refId: string };
}

export interface ScheduleEventDetail extends ScheduleEvent {
  raw?: Record<string, unknown>;
  images?: string[];
}

export interface MyScheduleResponse {
  from: string;
  to: string;
  events: ScheduleEvent[];
}
