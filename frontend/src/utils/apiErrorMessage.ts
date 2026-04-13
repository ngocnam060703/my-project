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
    return "Không tìm thấy API (404). Hãy chạy backend bản mới nhất hoặc kiểm tra đường dẫn /api.";
  }
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 401) return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";
  if (!e.response) {
    return "Không kết nối được máy chủ. Kiểm tra backend (thường port 5000) và mục proxy trong package.json của frontend.";
  }
  return fallback;
}
