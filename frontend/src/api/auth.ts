import client from "./client";

export const authApi = {
  register: (data: { email: string; password: string; fullName: string; phone?: string; studentId?: string }) =>
    client.post("/auth/register", data),
  // login: (email: string, password: string) => client.post("/auth/login", { email, password }),
  login: (data: { email: string; password: string }) => client.post("/auth/login", data),
  getProfile: () => client.get("/auth/profile"),
  updateProfile: (data: Record<string, unknown>) => client.put("/auth/profile", data),
};
