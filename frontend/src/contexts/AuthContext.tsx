import React, { createContext, useContext, useState, useEffect, ReactNode, Dispatch, SetStateAction } from "react";
import { authApi } from "../api";
import {
  getToken,
  getUserString,
  setToken,
  setUserString,
  clearSessionAuth,
  clearLegacyLocalAuth,
} from "../utils/authStorage";

interface User {
  id?: string;
  _id?: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  studentId?: string;
  className?: string;
  major?: string;
  gender?: string;
  citizenId?: string;
  dateOfBirth?: string | null;
  address?: string;
  profileComplete?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: Dispatch<SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const savedUser = getUserString();
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      authApi
        .getProfile()
        .then((res) => {
          setUser(res.data);
          setUserString(JSON.stringify(res.data));
        })
        .catch(() => {
          clearSessionAuth();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    clearSessionAuth();
    setUser(null);
    const res = await authApi.login({ email: normalizedEmail, password });
    const raw = res?.data;
    const payload =
      raw && typeof raw === "object" && raw !== null && "data" in raw && (raw as { data: unknown }).data != null
        ? (raw as { data: Record<string, unknown> }).data
        : raw && typeof raw === "object" && raw !== null
          ? (raw as Record<string, unknown>)
          : null;

    const u = payload?.user as User | undefined;
    const tokenVal = payload?.token;
    const token = typeof tokenVal === "string" ? tokenVal : "";

    if (!u || !token) {
      throw new Error("Phản hồi đăng nhập không hợp lệ từ máy chủ (thiếu user hoặc token).");
    }

    const merged: User = {
      ...u,
      id: u.id ?? u._id ?? String((u as unknown as { _id?: string })._id ?? ""),
      email: String(u.email ?? ""),
      fullName: String(u.fullName ?? ""),
      role: String(u.role ?? "user"),
    };

    setToken(token);
    setUserString(JSON.stringify(merged));
    clearLegacyLocalAuth();
    setUser(merged);
  };

  const logout = () => {
    clearSessionAuth();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
