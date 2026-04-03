import client from "./client";
import { authApi } from "./auth";

export { client, authApi };

export const areasApi = {
  getAll: (params?: { search?: string }) => client.get("/areas", { params }),
  getById: (id: string) => client.get(`/areas/${id}`),
  create: (data: Record<string, unknown>) => client.post("/areas", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/areas/${id}`, data),
  delete: (id: string) => client.delete(`/areas/${id}`),
};

export const roomsApi = {
  getAll: (params?: { area?: string; status?: string; available?: string; minPrice?: number; maxPrice?: number; minCapacity?: number; capacity?: number; roomNumber?: string; sortBy?: string; sortOrder?: "asc" | "desc"; page?: number; limit?: number }) =>
    client.get("/rooms", { params }),
  getById: (id: string) => client.get(`/rooms/${id}`),
  getResidents: (id: string) => client.get(`/rooms/${id}/residents`),
  setRoomLeader: (id: string, userId: string) => client.put(`/rooms/${id}/room-leader`, { userId }),
  create: (data: Record<string, unknown>) => client.post("/rooms", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/rooms/${id}`, data),
  delete: (id: string) => client.delete(`/rooms/${id}`),
};

export const registrationsApi = {
  getMy: () => client.get("/registrations/my"),
  create: (data: { room: string; semester: string; schoolYear: string; startDate: string; registrationType?: "dorm" | "transfer" }) =>
    client.post("/registrations", data),
  createTransfer: (data: { room: string; startDate?: string; semester?: string; schoolYear?: string }) =>
    client.post("/registrations", { ...data, registrationType: "transfer" }),
  cancel: (id: string) => client.put(`/registrations/${id}/cancel`),
  getAll: (params?: { status?: string; page?: number; limit?: number }) =>
    client.get("/registrations", { params }),
  approve: (id: string) => client.put(`/registrations/${id}/approve`),
  reject: (id: string, reason?: string) => client.put(`/registrations/${id}/reject`, { reason }),
};

export const contractsApi = {
  getMy: () => client.get("/contracts/my"),
  getById: (id: string) => client.get(`/contracts/${id}`),
  getAll: (params?: { status?: string; user?: string; room?: string; page?: number; limit?: number }) =>
    client.get("/contracts", { params }),
  /** CRUD — giao diện admin có thể ẩn; gọi khi cần (Postman / tích hợp). */
  create: (data: Record<string, unknown>) => client.post("/contracts", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/contracts/${encodeURIComponent(String(id))}`, data),
  extend: (id: string, endDate: string) => client.put(`/contracts/${id}/extend`, { endDate }),
  terminate: (id: string) => client.put(`/contracts/${id}/terminate`),
  sign: (id: string) => client.put(`/contracts/${id}/sign`),
  confirmPayment: (id: string) => client.put(`/contracts/${id}/confirm-payment`),
};

export const billsApi = {
  getMy: () => client.get("/bills/my"),
  markPaid: (id: string) => client.put(`/bills/${id}/paid`),
  getAll: (params?: { status?: string; room?: string; month?: number; year?: number; billType?: "monthly" | "penalty"; page?: number; limit?: number }) =>
    client.get("/bills", { params }),
  create: (data: { contract?: string; roomId?: string; month: number; year: number; roomFee?: number; electricityFee?: number; waterFee?: number; otherFee?: number; dueDate?: string }) =>
    client.post("/bills", data),
  generate: (data: { month: number; year: number; dueDate?: string }) => client.post("/bills/generate", data),
};

export const usersApi = {
  getAll: (params?: { role?: string; search?: string; page?: number; limit?: number }) =>
    client.get("/users", { params }),
  getById: (id: string) => client.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => client.post("/users", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/users/${id}`, data),
  delete: (id: string) => client.delete(`/users/${id}`),
};

export const dashboardApi = {
  getStats: () => client.get("/dashboard/stats"),
  getContractExtensionSetting: () => client.get("/dashboard/contract-extension-setting"),
  setContractExtensionSetting: (data: { enable_contract_extension: boolean }) =>
    client.put("/dashboard/contract-extension-setting", data),
};

export const ratingsApi = {
  getByRoom: (roomId: string) => client.get(`/ratings/room/${roomId}`),
  create: (data: { room: string; rating: number; comment?: string }) => client.post("/ratings", data),
};

export const studentDashboardApi = {
  get: () => client.get("/student-dashboard"),
};

export const registrationPeriodsApi = {
  getActive: () => client.get("/registration-periods/active"),
  getAll: () => client.get("/registration-periods"),
  create: (data: { name: string; startDate: string; endDate: string; note?: string }) =>
    client.post("/registration-periods", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/registration-periods/${id}`, data),
  delete: (id: string) => client.delete(`/registration-periods/${id}`),
};

export const notificationsApi = {
  getMy: (params?: { limit?: number; unreadOnly?: string }) =>
    client.get("/notifications", { params }),
  markRead: (id: string) => client.put(`/notifications/${id}/read`),
  markAllRead: () => client.put("/notifications/read-all"),
};

export const damageReportsApi = {
  getMy: () => client.get("/damage-reports/my"),
  getRoomDevices: (roomId: string) => client.get(`/damage-reports/room/${roomId}/devices`),
  create: (data: { room: string; device: string; description: string; images?: string[] }) =>
    client.post("/damage-reports", data),
};

export const facilitiesApi = {
  // Student
  getMyRoom: () => client.get("/facilities/my-room"),
  // Admin
  getStats: () => client.get("/facilities/stats"),
  getAll: (params?: { q?: string; category?: string; status?: string; page?: number; limit?: number }) =>
    client.get("/facilities", { params }),
  getLocations: (params?: { roomId?: string; areaId?: string; facilityId?: string; page?: number; limit?: number }) =>
    client.get("/facilities/locations", { params }),
  create: (data: { name: string; code: string; category?: string; status?: string; quantityTotal?: number }) =>
    client.post("/facilities", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/facilities/${id}`, data),
  delete: (id: string) => client.delete(`/facilities/${id}`),
  assignLocation: (data: { facilityId: string; areaId?: string; floor?: number; roomId: string; quantity: number }) =>
    client.post("/facilities/locations", data),
  updateLocation: (id: string, data: { quantity: number }) => client.put(`/facilities/locations/${id}`, data),
  deleteLocation: (id: string) => client.delete(`/facilities/locations/${id}`),
};

export const facilityReportsApi = {
  // Student
  getMy: () => client.get("/facility-reports/my"),
  getRoomFacilities: (roomId: string) => client.get(`/facility-reports/room/${roomId}/facilities`),
  create: (data: { facilityId: string; roomId: string; description: string }) =>
    client.post("/facility-reports", data),
  // Admin
  getAll: (params?: { status?: string; room?: string; page?: number; limit?: number }) =>
    client.get("/facility-reports", { params }),
  approve: (id: string, adminNote?: string) => client.put(`/facility-reports/${id}/approve`, { adminNote }),
  reject: (id: string, adminNote: string) => client.put(`/facility-reports/${id}/reject`, { adminNote }),
  done: (id: string, adminNote?: string) => client.put(`/facility-reports/${id}/done`, { adminNote }),
};

export const servicesApi = {
  getAll: (params?: { type?: "common" | "personal"; activeOnly?: string }) => client.get("/services", { params }),
  create: (data: { name: string; type: "common" | "personal"; price: number; unit: "monthly" | "once"; description?: string; isActive?: boolean }) =>
    client.post("/services", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/services/${id}`, data),
  toggle: (id: string) => client.put(`/services/${id}/toggle`),
  getMyRegistrations: (params?: { month?: number; year?: number }) => client.get("/services/my-registrations", { params }),
  upsertMyRegistration: (data: { serviceId: string; month: number; year: number; quantity?: number; enabled?: boolean }) =>
    client.post("/services/my-registrations", data),
};

export const roomCostsApi = {
  getAll: (params?: { month?: number; year?: number }) => client.get("/room-costs", { params }),
  upsert: (data: { roomId: string; month: number; year: number; electricityFee: number; waterFee: number; note?: string }) =>
    client.post("/room-costs", data),
};

export const violationsApi = {
  getRules: () => client.get("/violations/rules"),
  getMy: () => client.get("/violations/my"),
  getMyStats: (params: { schoolYear: string; semester: string }) => client.get("/violations/my/stats", { params }),
  getAll: (params?: {
    user?: string;
    room?: string;
    schoolYear?: string;
    semester?: string;
    search?: string;
    severity?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => client.get("/violations", { params }),
  getById: (id: string) => client.get(`/violations/${id}`),
  getStudentsSummary: (params: { schoolYear: string; semester: string }) => client.get("/violations/students-summary", { params }),
  create: (data: Record<string, unknown>) => client.post("/violations", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/violations/${id}`, data),
  remove: (id: string) => client.delete(`/violations/${id}`),
};

export const disciplinaryApi = {
  resolve: (data: { violationId: string; actionType: string; penaltyAmount?: number; note?: string }) =>
    client.post("/disciplinary", data),
  get: (violationId: string) => client.get(`/disciplinary/${violationId}`),
};
