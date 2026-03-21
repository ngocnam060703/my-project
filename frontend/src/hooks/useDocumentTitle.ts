import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | KTX FDORM` : "KTX FDORM";
  }, [title]);
}
