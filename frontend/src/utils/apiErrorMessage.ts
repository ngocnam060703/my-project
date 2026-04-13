import { isAxiosError } from "axios";

/**
 * Thông báo lỗi thân thiện cho UI (axios / mạng / 404 backend cũ).
 */
export function apiErrorMessage(e: unknown, fallback = "Có lỗi xảy ra"): string {
  if (!isAxiosError(e)) return fallback;
  const status = e.response?.status;
  const data = e.response?.data as { message?: string } | undefined;
  if (data?.message && typeof data.message === "string") return data.message;
  if (status === 404) {
    return "Không tìm thấy API (404). Chạy backend trong thư mục backend (port 5000), hoặc đặt REACT_APP_PROXY_TARGET / REACT_APP_API_URL. Nếu dùng `serve` thay vì `npm start`, cần build kèm REACT_APP_API_URL=http://127.0.0.1:5000/api (và bật CORS trên backend).";
  }
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 401) return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";
  if (!e.response) {
    return "Không kết nối được máy chủ. Kiểm tra backend (thường port 5000) và mục proxy trong package.json của frontend.";
  }
  return fallback;
}
