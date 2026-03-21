export interface User {
  _id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  studentId?: string;
  dateOfBirth?: string;
  address?: string;
}

export interface Area {
  _id: string;
  name: string;
  description?: string;
  manager?: User;
}

export interface Room {
  _id: string;
  roomNumber: string;
  area: Area | string;
  capacity: number;
  currentOccupancy: number;
  price: number;
  floor?: number;
  status: string;
  description?: string;
  amenities?: string[];
}

export interface Registration {
  _id: string;
  user: User;
  room: Room;
  semester: string;
  schoolYear: string;
  startDate?: string;
  status: string;
  createdAt: string;
  rejectionReason?: string;
}

export interface Contract {
  _id: string;
  user: User;
  room: Room;
  startDate: string;
  endDate: string;
  status: string;
  contractNumber?: string;
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
  total: number;
  status: string;
  dueDate: string;
  paidAt?: string;
  note?: string;
}
