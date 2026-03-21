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
  create: (data: Record<string, unknown>) => client.post("/rooms", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/rooms/${id}`, data),
  delete: (id: string) => client.delete(`/rooms/${id}`),
};

export const registrationsApi = {
  getMy: () => client.get("/registrations/my"),
  create: (data: { room: string; semester: string; schoolYear: string; startDate: string }) =>
    client.post("/registrations", data),
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
  extend: (id: string, endDate: string) => client.put(`/contracts/${id}/extend`, { endDate }),
  terminate: (id: string) => client.put(`/contracts/${id}/terminate`),
};

export const billsApi = {
  getMy: () => client.get("/bills/my"),
  markPaid: (id: string) => client.put(`/bills/${id}/paid`),
  getAll: (params?: { status?: string; month?: number; year?: number; page?: number; limit?: number }) =>
    client.get("/bills", { params }),
  create: (data: { contract: string; month: number; year: number; roomFee?: number; electricityFee?: number; waterFee?: number; otherFee?: number; dueDate?: string }) =>
    client.post("/bills", data),
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
};

export const notificationsApi = {
  getMy: (params?: { limit?: number; unreadOnly?: string }) =>
    client.get("/notifications", { params }),
  markRead: (id: string) => client.put(`/notifications/${id}/read`),
  markAllRead: () => client.put("/notifications/read-all"),
};

export const damageReportsApi = {
  getMy: () => client.get("/damage-reports/my"),
  create: (data: { room: string; device: string; description: string; images?: string[] }) =>
    client.post("/damage-reports", data),
};
