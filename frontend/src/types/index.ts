export interface User {
  _id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  studentId?: string;
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

export interface Area {
  _id: string;
  name: string;
  description?: string;
  manager?: User;
  genderPolicy?: "male" | "female" | "mixed";
  totalRooms?: number;
  totalStudents?: number;
  occupancyStatus?: "empty" | "available" | "full";
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
}

export interface Bill {
  _id: string;
  user: User;
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
  status: string;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: "manual" | "online" | "counter";
  paymentReference?: string;
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
