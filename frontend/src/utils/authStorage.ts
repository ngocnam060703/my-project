const TOKEN_KEY = "token";
const USER_KEY = "user";

/**
 * Phiên đăng nhập theo tab: dùng sessionStorage để hai tab (admin + sinh viên)
 * không ghi đè token của nhau như khi dùng chung localStorage.
 *
 * Tương thích cũ: nếu tab chưa có session nhưng còn token trong localStorage,
 * copy một lần vào session của tab đó (không xóa local ngay).
 */
export function getToken(): string | null {
  let t = sessionStorage.getItem(TOKEN_KEY);
  if (t) return t;
  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    sessionStorage.setItem(TOKEN_KEY, legacy);
    const u = localStorage.getItem(USER_KEY);
    if (u) sessionStorage.setItem(USER_KEY, u);
    return legacy;
  }
  return null;
}

export function getUserString(): string | null {
  const s = sessionStorage.getItem(USER_KEY);
  if (s) return s;
  return localStorage.getItem(USER_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function setUserString(json: string): void {
  sessionStorage.setItem(USER_KEY, json);
}

/** Xóa phiên đăng nhập của tab hiện tại. */
export function clearSessionAuth(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/** Xóa token/user legacy trên localStorage (sau đăng nhập mới — tab khác đã dùng session riêng). */
export function clearLegacyLocalAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasToken(): boolean {
  return !!getToken();
}
