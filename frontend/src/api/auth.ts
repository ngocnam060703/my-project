import client from "./client";

export const authApi = {
  register: (data: { email: string; password: string; fullName: string; phone?: string; studentId?: string }) =>
    client.post("/auth/register", data),
  login: (email: string, password: string) => client.post("/auth/login", { email, password }),
  getProfile: () => client.get("/auth/profile"),
  updateProfile: (data: { fullName?: string; phone?: string; dateOfBirth?: string; address?: string }) =>
    client.put("/auth/profile", data),
};
