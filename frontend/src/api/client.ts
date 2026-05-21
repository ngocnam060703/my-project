import axios from "axios";
import { getToken, clearSessionAuth, clearLegacyLocalAuth, hasToken } from "../utils/authStorage";

/** Chuẩn hóa base URL: nhiều người cấu hình thiếu /api → mọi request 404. */
function normalizeApiBaseUrl(raw: string | undefined): string {
  const fallback = "http://localhost:5000/api";
  const v = (raw || fallback).trim().replace(/\/+$/, "");
  if (/\/api$/i.test(v)) return v;
  try {
    const withProto = /^https?:\/\//i.test(v) ? v : `http://${v}`;
    const u = new URL(withProto);
    const path = u.pathname.replace(/\/$/, "") || "";
    if (path === "" || path === "/") {
      return `${u.origin}/api`;
    }
  } catch {
    /* ignore */
  }
  return v;
}

/**
 * Dev: mặc định dùng `/api` + proxy trong package.json → gọi http://127.0.0.1:5000
 * (tránh lỗi "Network Error" khi backend chạy nhưng trình duyệt chặn / sai CORS).
 * Production: đặt REACT_APP_API_URL khi build, hoặc dùng URL đầy đủ mặc định.
 */
function getApiBaseUrl(): string {
  if (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim() !== "") {
    return normalizeApiBaseUrl(process.env.REACT_APP_API_URL);
  }
  if (process.env.NODE_ENV === "development") {
    return "/api";
  }
  return normalizeApiBaseUrl(undefined);
}

const API_URL = getApiBaseUrl();

const client = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const requestUrl: string = err.config?.url || "";
    const baseURL: string = err.config?.baseURL || "";
    const fullPath = `${baseURL}${requestUrl}`;
    const isAuthEndpoint =
      /\/auth\/login\b/i.test(fullPath) ||
      /\/auth\/register\b/i.test(fullPath) ||
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register");
    const hadToken = hasToken();

    // Only force logout for expired/invalid authenticated sessions.
    // Do not redirect for login/register failures.
    if (status === 401 && hadToken && !isAuthEndpoint) {
      clearSessionAuth();
      clearLegacyLocalAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default client;
