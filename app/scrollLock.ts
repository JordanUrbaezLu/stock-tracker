/**
 * iOS-safe body scroll lock for modal overlays. `body { overflow: hidden }` is
 * ignored by iOS Safari for touch scrolling — the page behind a fixed overlay
 * still pans and rubber-bands. Pinning the body with position:fixed at the
 * current scroll offset actually locks it; the offset is restored on unlock.
 * Ref-counted so stacked overlays (modal over popup) compose safely.
 */
let locks = 0;
let savedY = 0;

export function lockBodyScroll() {
  if (typeof document === "undefined") return;
  locks += 1;
  if (locks > 1) return;
  savedY = window.scrollY;
  const { style } = document.body;
  style.position = "fixed";
  style.top = `-${savedY}px`;
  style.left = "0";
  style.right = "0";
  style.width = "100%";
}

export function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  const { style } = document.body;
  style.position = "";
  style.top = "";
  style.left = "";
  style.right = "";
  style.width = "";
  window.scrollTo(0, savedY);
}
