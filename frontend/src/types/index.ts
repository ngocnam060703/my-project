export interface User {
  _id: string;
  email: string;
  fullName: string;
  role: string;
  /** Ảnh đại diện (URL tuyệt đối hoặc path — tuỳ backend) */
  avatar?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  phone?: string;
  studentId?: string;
  major?: string;
  gender?: string;
  citizenId?: string;
  dateOfBirth?: string;
  address?: string;
  isSuperAdmin?: boolean;
  faculty?: string;
  enrollmentDate?: string;
  homeroomTeacher?: string;
  addressNative?: string;
  addressPermanent?: string;
  addressTemporary?: string;
  addressAbsent?: string;
  familyFatherName?: string;
  familyFatherPhone?: string;
  familyMotherName?: string;
  familyMotherPhone?: string;
  familyEmergencyPhone?: string;
}

/** GET /users/:id — payload đầy đủ cho admin */
export interface AdminUserDetailResponse {
  user: User;
  currentRoom: Room | null;
  currentContract: Contract | null;
  contracts: Contract[];
}

export interface StudentProfileResponse {
  student: User;
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
  status: "pending" | "approved" | "rejected";
  assignedRoom?: Room | null;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedBy?: User | null;
  reviewedAt?: string | null;
  linkedContract?: Contract | string | null;
}

export interface Registration {
  _id: string;
  user: User;
  room: Room;
  registrationType?: "dorm" | "transfer";
  fromRoom?: Room;
  currentContract?: { _id: string; contractNumber?: string; status?: string };
  semester: string;
  schoolYear: string;
  startDate?: string;
  status: string;
  createdAt: string;
  rejectionReason?: string;
  note?: string;
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
  terms?: string;
  application?: string | null;
  /** VNĐ/tháng — nếu null UI dùng giá phòng */
  monthlyRent?: number | null;
  /** VNĐ — nếu null hiển thị “theo quy định” */
  depositAmount?: number | null;
}

/** Yêu cầu gia hạn hợp đồng (sinh viên → admin duyệt) */
export interface ContractExtendRequest {
  _id: string;
  contract: Contract | { _id?: string; contractNumber?: string; status?: string; endDate?: string; startDate?: string };
  user?: string | User;
  months: number;
  status: "pending" | "approved" | "rejected";
  snapshotEndDate?: string;
  appliedEndDate?: string | null;
  note?: string;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MyContractOverview {
  student: Pick<User, "fullName" | "email" | "phone" | "studentId" | "gender" | "citizenId" | "dateOfBirth" | "avatar"> | null;
  contracts: Contract[];
  activeContract: Contract | null;
  extendRequests: ContractExtendRequest[];
  extensionEnabled: boolean;
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
  paidAt?: string;
  paymentMethod?: "manual" | "online" | "counter";
  paymentReference?: string;
  paymentHistory?: BillPaymentHistoryEntry[];
  note?: string;
  billType?: "monthly" | "penalty";
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
  status?: ViolationStatus;
  resolution?: ViolationResolution | null;
}

/** Khai báo hư hỏng / sự cố phòng (module Maintenance) */
export type MaintenanceIncidentType = "electricity" | "water" | "equipment" | "other";
export type MaintenanceReportStatus = "pending" | "processing" | "resolved";

export interface MaintenanceReport {
  _id: string;
  user?: User | string;
  room?: Room | string;
  incidentType: MaintenanceIncidentType;
  description: string;
  images?: string[];
  status: MaintenanceReportStatus;
  adminNote?: string;
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
