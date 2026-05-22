import { useEffect, useState } from "react";

/** Cập nhật thời gian hiện tại theo interval — dùng cho countdown/trạng thái đợt. */
export function useNowMs(intervalMs = 5000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return nowMs;
}
