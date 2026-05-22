/** Gỡ lớp phủ/modal còn sót (Bootstrap / Ant Design) gây chặn click trên UI. */
export function clearBlockingOverlays(): void {
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");

  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());

  document.querySelectorAll(".ant-modal-root").forEach((root) => {
    const wrap = root.querySelector(".ant-modal-wrap");
    const visible = wrap && window.getComputedStyle(wrap).display !== "none";
    if (!visible) root.remove();
  });

  document.querySelectorAll(".ant-modal-mask").forEach((mask) => {
    const root = mask.closest(".ant-modal-root");
    const wrap = root?.querySelector(".ant-modal-wrap");
    if (!wrap || window.getComputedStyle(wrap).display === "none") {
      root?.remove();
    }
  });

  document.querySelectorAll(".ant-drawer").forEach((drawer) => {
    if (!drawer.classList.contains("ant-drawer-open")) {
      drawer.parentElement?.remove();
    }
  });

  document.querySelectorAll(".ant-dropdown-hidden").forEach((el) => {
    (el as HTMLElement).style.pointerEvents = "none";
  });
}
