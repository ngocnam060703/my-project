import type { AxiosResponse } from "axios";
import { isAxiosError } from "axios";
import client from "./client";
import { authApi } from "./auth";
import type { Area, Room, ZoneDetailResponse, DormApplication, MyContractOverview } from "../types";

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
  getResidents: async (id: string) => {
    try {
      return await client.get(`/zones/${id}/residents`);
    } catch (e) {
      if (!isZonesEndpointMissing(e)) throw e;
      return await client.get(`/areas/${id}/residents`);
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
  getResidencyHistory: (id: string) => client.get(`/rooms/${id}/residency-history`),
  getBeds: (id: string) => client.get(`/rooms/${id}/beds`),
  assignBed: (roomId: string, payload: { bedId: string; contractId: string }) => client.post(`/rooms/${roomId}/beds/assign`, payload),
  checkInBed: (roomId: string, bedId: string) => client.post(`/rooms/${roomId}/beds/check-in/${encodeURIComponent(bedId)}`),
  transferBed: (roomId: string, payload: { contractId: string; targetBedId: string; targetRoomId?: string; reason?: string }) =>
    client.post(`/rooms/${roomId}/beds/transfer`, payload),
  setRoomLeader: (id: string, userId: string) => client.put(`/rooms/${id}/room-leader`, { userId }),
  create: (data: Record<string, unknown>) => client.post("/rooms", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/rooms/${id}`, data),
  delete: (id: string) => client.delete(`/rooms/${id}`),
};

export const bedsApi = {
  checkout: (bedId: string, body?: { note?: string }) =>
    client.post(`/beds/${encodeURIComponent(bedId)}/checkout`, body || {}),
};

export const majorsApi = {
  getAll: (params?: { q?: string; faculty?: string; active?: boolean }) => client.get("/majors", { params }),
  create: (data: { name: string; faculty?: string }) => client.post("/majors", data),
  update: (id: string, data: { name?: string; faculty?: string; isActive?: boolean }) => client.patch(`/majors/${id}`, data),
  delete: (id: string) => client.delete(`/majors/${id}`),
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

/** Thử lần lượt các đường dẫn “đơn của tôi” (alias / router khác nhau). */
async function getMyApplicationsList(): Promise<AxiosResponse<DormApplication[]>> {
  const paths = ["/my-applications", "/applications/my", "/students/me/applications"];
  let last: unknown;
  for (const path of paths) {
    try {
      return await client.get<DormApplication[]>(path);
    } catch (e: unknown) {
      last = e;
      if (isAxiosError(e) && e.response?.status === 404) continue;
      throw e;
    }
  }
  throw last;
}

/** Xét duyệt đơn đăng ký KTX (phân phòng khi duyệt) — REST /applications + alias /my-applications */
export const applicationsApi = {
  getMine: () => client.get<DormApplication[]>("/applications/my"),
  /** GET /my-applications → /applications/my → /students/me/applications */
  getMyApplications: () => getMyApplicationsList(),
  create: (data: {
    semester: string;
    schoolYear: string;
    startDate: string;
    preferenceArea?: string;
    priorityCategory?: "none" | "ho_ngheo" | "con_thuong_binh" | "chinh_sach";
  }) => client.post<DormApplication>("/applications", data),
  getAll: (params?: {
    status?: string;
    search?: string;
    faculty?: string;
    enrollmentYear?: number;
    area?: string;
    priorityCategory?: "none" | "ho_ngheo" | "con_thuong_binh" | "chinh_sach";
    days?: number;
    sortOrder?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) =>
    client.get<{
      applications: DormApplication[];
      total: number;
      page: number;
      limit: number;
      stats?: { pending: number; approved: number; total: number };
    }>("/applications", { params }),
  getById: (id: string) => client.get<DormApplication>(`/applications/${id}`),
  /** Sinh viên: hủy đơn chỉ khi pending */
  cancel: (id: string) => client.delete(`/applications/${encodeURIComponent(id)}`),
  getSuggestedRoom: (id: string) => client.get<{ room: Room; rules: string[] }>(`/applications/${id}/suggested-room`),
  getCandidateRooms: (id: string) => client.get<{ rooms: Room[] }>(`/applications/${id}/candidate-rooms`),
  approve: (id: string, data?: { roomId?: string }) => client.patch(`/applications/${id}/approve`, data || {}),
  reject: (id: string, note: string) => client.patch(`/applications/${id}/reject`, { note }),
  statsByDay: (params?: { days?: number }) =>
    client.get<{ days: number; series: { date: string; count: number }[] }>("/applications/stats/by-day", { params }),
};

export const contractsApi = {
  getMy: () => client.get("/contracts/my"),
  /** GET /api/my-contract — sinh viên: hợp đồng + lịch sử gia hạn */
  getMyContractOverview: () => client.get<MyContractOverview>("/my-contract"),
  getById: (id: string) => client.get(`/contracts/${id}`),
  getAll: (params?: { status?: string; user?: string; room?: string; search?: string; faculty?: string; major?: string; area?: string; hasDebt?: boolean; page?: number; limit?: number }) =>
    client.get("/contracts", { params }),
  get360: (id: string) => client.get(`/contracts/${encodeURIComponent(id)}/360`),
  /** CRUD — giao diện admin có thể ẩn; gọi khi cần (Postman / tích hợp). */
  create: (data: Record<string, unknown>) => client.post("/contracts", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/contracts/${encodeURIComponent(String(id))}`, data),
  extend: (id: string, endDate: string) => client.put(`/contracts/${id}/extend`, { endDate }),
  terminate: (id: string) => client.put(`/contracts/${id}/terminate`),
  remove: (id: string) => client.delete(`/contracts/${id}`),
  uploadSignedPdf: (id: string, signedPdfUrl: string) => client.put(`/contracts/${id}/upload-signed-pdf`, { signedPdfUrl }),
  sign: (id: string, data?: { consentAccepted: true }) => client.put(`/contracts/${id}/sign`, data || {}),
  getRenewalPreview: (id: string, months?: number) =>
    client.get(`/contracts/${id}/renewal-preview`, { params: months != null ? { months } : {} }),
  confirmRenewal: (id: string, data: { months?: number; consentAccepted: true }) =>
    client.post(`/contracts/${id}/confirm-renewal`, data),
  confirmPayment: (id: string) => client.put(`/contracts/${id}/confirm-payment`),
  /** Admin: tạo slot giường nếu thiếu + gán giường trống cho hợp đồng */
  ensureBed: (id: string) => client.put(`/contracts/${encodeURIComponent(id)}/ensure-bed`),
  /** Sinh viên: gửi yêu cầu gia hạn (chỉ hợp đồng active) */
  requestExtend: (contractId: string, months: number) =>
    client.post(`/contracts/${encodeURIComponent(contractId)}/request-extend`, { months }),
  /** Admin: danh sách yêu cầu gia hạn */
  listExtendRequests: (params?: { status?: "pending" | "approved" | "rejected" | "all"; search?: string }) =>
    client.get("/contracts/extend-requests", { params }),
  approveExtendRequest: (requestId: string) => client.patch(`/contracts/extend-requests/${encodeURIComponent(requestId)}/approve`),
  rejectExtendRequest: (requestId: string, note: string) =>
    client.patch(`/contracts/extend-requests/${encodeURIComponent(requestId)}/reject`, { note }),
};

export const opsContractsApi = {
  dashboard: () => client.get("/ops/contracts/dashboard"),
};

export const billsApi = {
  getMy: () => client.get("/bills/my"),
  /** Alias REST: GET /api/my-bills (cùng dữ liệu getMy) */
  getMyBills: () => client.get("/my-bills"),
  getById: (id: string) => client.get(`/bills/${id}`),
  markPaid: (id: string, data?: { paymentMethod?: "manual" | "counter"; paymentReference?: string }) =>
    client.put(`/bills/${id}/paid`, data ?? {}),
  /** PATCH chuẩn REST (cùng handler với markPaid). */
  patchPay: (id: string, data?: { paymentMethod?: "manual" | "counter"; paymentReference?: string }) =>
    client.patch(`/bills/${id}/pay`, data ?? {}),
  /** Demo thanh toán online (máy chủ mô phỏng giao dịch thành công). */
  payOnline: (id: string) => client.put(`/bills/${id}/pay-online`),
  getAll: (params?: {
    status?: string;
    search?: string;
    user?: string;
    room?: string;
    month?: number;
    year?: number;
    billType?: "monthly" | "penalty" | "damage_reimbursement";
    page?: number;
    limit?: number;
  }) => client.get("/bills", { params }),
  create: (data: { contract?: string; roomId?: string; month: number; year: number; roomFee?: number; electricityFee?: number; waterFee?: number; sharedCommonFee?: number; otherFee?: number; dueDate?: string }) =>
    client.post("/bills", data),
  generate: (data: { month: number; year: number; dueDate?: string }) => client.post("/bills/generate", data),
  update: (id: string, data: Record<string, unknown>) => client.patch(`/bills/${id}`, data),
  revenueSummary: (params?: { year?: number }) => client.get("/bills/revenue/summary", { params }),
  refreshOverdue: () => client.post("/bills/overdue/refresh"),
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
    includeDorm?: 1 | 0;
  }) => client.get("/users", { params }),
  getById: (id: string) => client.get(`/users/${id}`),
  create: (data: Record<string, unknown>) => client.post("/users", data),
  update: (id: string, data: Record<string, unknown>) => client.patch(`/users/${id}`, data),
  delete: (id: string) => client.delete(`/users/${id}`),
  lock: (id: string) => client.patch(`/users/${id}/lock`),
  unlock: (id: string) => client.patch(`/users/${id}/unlock`),
  resetPassword: (id: string, newPassword: string) =>
    client.patch(`/users/${id}/reset-password`, { newPassword }),
  getPendingAccounts: () => client.get("/admin/users/pending"),
  approveAccount: (id: string) => client.put(`/admin/users/${id}/approve`),
  rejectAccount: (id: string, rejectionReason: string) =>
    client.put(`/admin/users/${id}/reject`, { rejectionReason }),
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
  getStats: (params?: {
    range?: "7d" | "14d" | "month";
    area?: string;
    roomStatus?: "all" | "available" | "full" | "maintenance";
    billStatus?: "all" | "unpaid" | "pending" | "overdue" | "paid";
    billPeriodType?: "month" | "quarter" | "year";
    billYear?: number;
    billMonth?: number;
    billQuarter?: number;
    maintenanceType?: "all" | "electricity" | "water" | "equipment" | "other";
    maintenanceStatus?: "all" | "pending" | "processing" | "resolved";
    violationSeverity?: "all" | "light" | "medium" | "heavy";
  }) => client.get("/dashboard/stats", { params }),
  getContractExtensionSetting: () => client.get("/dashboard/contract-extension-setting"),
  setContractExtensionSetting: (data: { enable_contract_extension: boolean }) =>
    client.put("/dashboard/contract-extension-setting", data),
};

export const ratingsApi = {
  getByRoom: (roomId: string) => client.get(`/ratings/room/${roomId}`),
  create: (data: { room: string; rating: number; comment?: string }) =>
    client.post(`/ratings/room/${data.room}`, { rating: data.rating, comment: data.comment }),
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

export const extensionPeriodsApi = {
  getActive: () => client.get("/extension-periods/active"),
  getAll: () => client.get("/extension-periods"),
  create: (data: { name: string; startDate: string; endDate: string; note?: string }) =>
    client.post("/extension-periods", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/extension-periods/${id}`, data),
  delete: (id: string) => client.delete(`/extension-periods/${id}`),
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

/** Thử lần lượt các đường dẫn backend (deploy / proxy khác nhau có thể chỉ mount một số route). */
async function getMyMaintenanceReports(): Promise<AxiosResponse<unknown>> {
  const paths = ["/my-reports", "/reports/my", "/students/me/maintenance-reports", "/student/maintenance-reports"];
  let last: unknown;
  for (const path of paths) {
    try {
      return await client.get(path);
    } catch (e: unknown) {
      last = e;
      if (isAxiosError(e) && e.response?.status === 404) continue;
      throw e;
    }
  }
  throw last;
}

/** Khai báo hư hỏng theo loại sự cố (điện/nước/thiết bị/khác) — REST: my-reports + reports */
export const maintenanceReportsApi = {
  getMy: () => getMyMaintenanceReports(),
  create: (data: { type: string; description: string; images?: string[] }) => client.post("/reports", data),
  getById: (id: string) => client.get(`/reports/${id}`),
  cancel: (id: string) => client.delete(`/reports/${id}`),
};

/** Lịch sinh viên (hóa đơn, hợp đồng, bảo trì, kỳ đăng ký) */
export const scheduleApi = {
  getMy: (params?: { from?: string; to?: string }) => client.get("/my-schedule", { params }),
  getEvent: (id: string) => client.get(`/events/${encodeURIComponent(id)}`),
};

export const maintenanceReportsAdminApi = {
  list: (params?: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
    month?: number;
    year?: number;
    date?: string;
  }) => client.get("/admin/maintenance-reports", { params }),
  patch: (
    id: string,
    data: {
      status?: string;
      adminNote?: string;
      severity?: string;
      damageCause?: string;
      resolutionType?: string;
      compensationAmount?: number;
      maintenanceStatus?: string;
    }
  ) => client.patch(`/admin/maintenance-reports/${id}`, data),
  getById: (id: string) => client.get(`/reports/${id}`),
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
  create: (data: {
    name: string;
    type: "common" | "personal";
    price: number;
    unit: "monthly" | "once";
    measureUnit?: "month" | "kwh" | "m3";
    tariffType?: "fixed" | "variable";
    description?: string;
    isActive?: boolean;
  }) => client.post("/services", data),
  update: (id: string, data: Record<string, unknown>) => client.put(`/services/${id}`, data),
  patch: (id: string, data: Record<string, unknown>) => client.patch(`/services/${id}`, data),
  remove: (id: string) => client.delete(`/services/${id}`),
  toggle: (id: string) => client.put(`/services/${id}/toggle`),
  getMyRegistrations: (params?: { month?: number; year?: number }) => client.get("/services/my-registrations", { params }),
  upsertMyRegistration: (data: { serviceId: string; month: number; year: number; quantity?: number; enabled?: boolean }) =>
    client.post("/services/my-registrations", data),
};

export const roomServicesApi = {
  list: (params?: { room?: string; service?: string; page?: number; limit?: number }) => client.get("/room-services", { params }),
  create: (data: { room: string; service: string; note?: string; isActive?: boolean }) => client.post("/room-services", data),
  remove: (id: string) => client.delete(`/room-services/${id}`),
};

export const serviceUsageApi = {
  list: (params?: {
    room?: string;
    service?: string;
    month?: number;
    year?: number;
    page?: number;
    limit?: number;
  }) => client.get("/service-usage", { params }),
  getPeriodStatus: (params: { room: string; month: number; year: number }) =>
    client.get("/service-usage/period-status", { params }),
  create: (data: { room: string; service: string; month: number; year: number; oldIndex: number; newIndex: number; note?: string }) =>
    client.post("/service-usage", data),
};

export const roomCostsApi = {
  getAll: (params?: { month?: number; year?: number }) => client.get("/room-costs", { params }),
  upsert: (data: {
    roomId: string;
    month: number;
    year: number;
    electricityFee: number;
    waterFee: number;
    wifiMonthlyFee?: number;
    note?: string;
  }) => client.post("/room-costs", data),
};

export const violationsApi = {
  getRules: () => client.get("/violations/rules"),
  getMy: () => client.get("/violations/my"),
  /** Alias REST: GET /api/my-violations */
  getMyViolations: () => client.get("/my-violations"),
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
