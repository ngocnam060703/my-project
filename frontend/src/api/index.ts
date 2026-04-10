import type { AxiosResponse } from "axios";
import { isAxiosError } from "axios";
import client from "./client";
import { authApi } from "./auth";
import type { Area, Room, ZoneDetailResponse } from "../types";

export { client, authApi };

export const areasApi = {
  getAll: (params?: { search?: string }) => client.get("/areas", { params }),
  getById: (id: string) => client.get(`/areas/${id}`),
  create: (data: Record<string, unknown>) => client.post("/areas", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/areas/${id}`, data),
  delete: (id: string) => client.delete(`/areas/${id}`),
};

type ZoneListParams = {
  search?: string;
  status?: "available" | "full";
  sortBy?: "name" | "totalRooms";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type ZonesListResponseData = {
  zones: Area[];
  total: number;
  page: number;
  limit: number;
  dashboard: { totalZones: number; totalRooms: number; totalStudents: number };
};

type AreaListRow = Area & { totalStudents?: number; occupancyStatus?: string };

function mapAreaRowToZone(a: AreaListRow): Area {
  const totalRooms = Number(a.totalRooms) || 0;
  const totalStudents = Number(a.totalStudents ?? a.currentStudents) || 0;
  const effCap = Number(a.effectiveCapacity ?? a.plannedCapacity) || 0;
  const occ = String(a.occupancyStatus || "");
  const zoneStatus: "available" | "full" =
    occ === "full" || (effCap > 0 && totalStudents >= effCap) ? "full" : "available";
  const fillPercent =
    effCap > 0 ? Math.min(100, Math.round((totalStudents / effCap) * 10000) / 100) : 0;
  return {
    ...a,
    currentStudents: totalStudents,
    actualTotalRooms: totalRooms,
    zoneStatus,
    fillPercent,
  };
}

/** Khi backend chưa mount /api/zones (404), dùng /areas công khai để vẫn hiển thị danh sách. */
async function fetchZonesListViaAreas(params: ZoneListParams): Promise<AxiosResponse<ZonesListResponseData>> {
  const search = params.search?.trim();
  const areasListRes = await client.get<{ areas?: AreaListRow[] }>("/areas", {
    params: { search: search || undefined },
  });
  const allAreasRes = search ? await client.get<{ areas?: AreaListRow[] }>("/areas") : areasListRes;

  let enriched = (areasListRes.data?.areas || []).map(mapAreaRowToZone);

  const st = params.status;
  if (st === "available" || st === "full") {
    enriched = enriched.filter((z) => z.zoneStatus === st);
  }

  const sortBy = params.sortBy || "name";
  const sortOrder = params.sortOrder === "desc" ? -1 : 1;
  enriched.sort((a, b) => {
    if (sortBy === "totalRooms") {
      const d = (a.totalRooms || 0) - (b.totalRooms || 0);
      return d * sortOrder;
    }
    const an = String(a.name || "").toLowerCase();
    const bn = String(b.name || "").toLowerCase();
    if (an < bn) return -1 * sortOrder;
    if (an > bn) return 1 * sortOrder;
    return 0;
  });

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const total = enriched.length;
  const slice = enriched.slice((page - 1) * limit, (page - 1) * limit + limit);

  const allRows = allAreasRes.data?.areas || [];
  let sumRooms = 0;
  let sumStudents = 0;
  for (const row of allRows) {
    sumRooms += Number(row.totalRooms) || 0;
    sumStudents += Number(row.totalStudents ?? row.currentStudents) || 0;
  }

  const data: ZonesListResponseData = {
    zones: slice,
    total,
    page,
    limit,
    dashboard: {
      totalZones: allRows.length,
      totalRooms: sumRooms,
      totalStudents: sumStudents,
    },
  };

  return { ...areasListRes, data } as AxiosResponse<ZonesListResponseData>;
}

function buildZoneDetailPayload(area: Area, rooms: Room[]): ZoneDetailResponse {
  const actualRooms = rooms.length;
  const currentStudents = rooms.reduce((s, r) => s + (Number(r.currentOccupancy) || 0), 0);
  const sumRoomCapacity = rooms.reduce((s, r) => s + (Number(r.capacity) || 0), 0);
  const plannedCap =
    area.plannedCapacity != null && Number(area.plannedCapacity) > 0
      ? Number(area.plannedCapacity)
      : sumRoomCapacity;
  const zoneStatus: "available" | "full" =
    !plannedCap || plannedCap <= 0 ? "available" : currentStudents >= plannedCap ? "full" : "available";
  const fillPercent =
    plannedCap > 0 ? Math.min(100, Math.round((currentStudents / plannedCap) * 10000) / 100) : 0;
  const zone: Area = {
    ...area,
    actualTotalRooms: actualRooms,
    totalRooms: actualRooms,
    currentStudents,
    effectiveCapacity: plannedCap,
    zoneStatus,
    fillPercent,
  };
  return {
    zone,
    rooms,
    summary: {
      currentStudents,
      effectiveCapacity: plannedCap,
      fillPercent,
      zoneStatus,
    },
  };
}

async function fetchZoneDetailViaAreaAndRooms(id: string): Promise<AxiosResponse<ZoneDetailResponse>> {
  const [areaRes, roomsRes] = await Promise.all([
    client.get<Area>(`/areas/${id}`),
    client.get<{ rooms?: Room[] }>("/rooms", { params: { area: id, limit: 500 } }),
  ]);
  const rooms = (roomsRes.data?.rooms || []) as Room[];
  const payload = buildZoneDetailPayload(areaRes.data as Area, rooms);
  return {
    data: payload,
    status: 200,
    statusText: "OK",
    headers: {},
    config: roomsRes.config,
  } as AxiosResponse<ZoneDetailResponse>;
}

function isZonesEndpointMissing(e: unknown): boolean {
  return isAxiosError(e) && e.response?.status === 404;
}

/** Quản lý khu KTX (REST /zones); fallback GET /areas nếu /zones 404 (backend cũ chưa restart). */
export const zonesApi = {
  getAll: async (params?: ZoneListParams): Promise<AxiosResponse<ZonesListResponseData>> => {
    try {
      return await client.get<ZonesListResponseData>("/zones", { params });
    } catch (e) {
      if (!isZonesEndpointMissing(e)) throw e;
      return fetchZonesListViaAreas(params ?? {});
    }
  },
  getById: async (id: string): Promise<AxiosResponse<ZoneDetailResponse>> => {
    try {
      return await client.get<ZoneDetailResponse>(`/zones/${id}`);
    } catch (e) {
      if (!isZonesEndpointMissing(e)) throw e;
      return fetchZoneDetailViaAreaAndRooms(id);
    }
  },
  create: (data: Record<string, unknown>) => client.post("/zones", data),
  update: (id: string, data: Record<string, unknown>) => client.patch(`/zones/${id}`, data),
  delete: (id: string) => client.delete(`/zones/${id}`),
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
  /** Nội trú: không cần chọn phòng — server tự phân theo giới tính & chỗ trống. Chuyển phòng: cần `room`. */
  create: (data: {
    room?: string;
    semester: string;
    schoolYear: string;
    startDate: string;
    registrationType?: "dorm" | "transfer";
  }) => client.post("/registrations", data),
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
  markPaid: (id: string, data?: { paymentMethod?: "manual" | "counter"; paymentReference?: string }) =>
    client.put(`/bills/${id}/paid`, data ?? {}),
  /** Demo thanh toán online (máy chủ mô phỏng giao dịch thành công). */
  payOnline: (id: string) => client.put(`/bills/${id}/pay-online`),
  getAll: (params?: { status?: string; room?: string; month?: number; year?: number; billType?: "monthly" | "penalty"; page?: number; limit?: number }) =>
    client.get("/bills", { params }),
  create: (data: { contract?: string; roomId?: string; month: number; year: number; roomFee?: number; electricityFee?: number; waterFee?: number; otherFee?: number; dueDate?: string }) =>
    client.post("/bills", data),
  generate: (data: { month: number; year: number; dueDate?: string }) => client.post("/bills/generate", data),
};

export const usersApi = {
  getAll: (params?: {
    role?: string;
    search?: string;
    page?: number;
    limit?: number;
    status?: "active" | "locked" | "";
    sortBy?: "id" | "fullName" | "createdAt";
    sortOrder?: "asc" | "desc";
  }) => client.get("/users", { params }),
  getById: (id: string) => client.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => client.post("/users", data),
  update: (id: string, data: Record<string, unknown>) => client.patch(`/users/${id}`, data),
  delete: (id: string) => client.delete(`/users/${id}`),
  lock: (id: string) => client.patch(`/users/${id}/lock`),
  unlock: (id: string) => client.patch(`/users/${id}/unlock`),
  resetPassword: (id: string, newPassword: string) =>
    client.patch(`/users/${id}/reset-password`, { newPassword }),
};

export const studentsApi = {
  getAll: (params?: { search?: string; page?: number; limit?: number }) =>
    client.get("/students", { params }),
  getMe: () => client.get("/students/me"),
  getById: (id: string) => client.get(`/students/${id}`),
  create: (data: Record<string, unknown>) => client.post("/students", data),
  updateById: (id: string, data: Record<string, unknown>) => client.patch(`/students/${id}`, data),
  updateMe: (data: Record<string, unknown>) => client.patch("/students/me", data),
  deleteById: (id: string) => client.delete(`/students/${id}`),
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
