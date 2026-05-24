/** Gộp địa chỉ thường trú / tạm trú — chỉ nội dung, không tiền tố nhãn. */
export function joinResidenceAddressPlain(
  permanent?: string | null,
  temporary?: string | null,
  emptyFallback = "—",
): string {
  const unique = Array.from(
    new Set([permanent, temporary].map((x) => String(x || "").trim()).filter(Boolean)),
  );
  return unique.length > 0 ? unique.join("\n") : emptyFallback;
}

/** Giá trị ô form «Thường trú - tạm trú» khi tải hồ sơ. */
export function residenceAddressFormValue(permanent?: string | null, temporary?: string | null): string {
  return joinResidenceAddressPlain(permanent, temporary, "");
}

/** Lưu cùng nội dung vào thường trú & tạm trú (cùng ý nghĩa). */
export function splitResidenceAddressToFields(value: unknown): {
  addressPermanent: string;
  addressTemporary: string;
} {
  const s = String(value ?? "").trim();
  return { addressPermanent: s, addressTemporary: s };
}
