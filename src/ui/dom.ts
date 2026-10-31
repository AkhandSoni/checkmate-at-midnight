/** Small DOM helpers. Story and saved text always become text nodes. */
export type Child = Node | string | null | undefined;
let suppressTouchClick = false;
document.addEventListener(
  "pointerdown",
  () => {
    suppressTouchClick = false;
  },
  true,
);
document.addEventListener(
  "click",
  (event) => {
    if (
      suppressTouchClick &&
      (event.detail > 0 || (event as PointerEvent).pointerType === "touch")
    ) {
      suppressTouchClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  for (const c of children) {
    if (c != null)
      e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}
export const text = (s: string, cls = "") => el("p", cls, s);
export const eye = (s: string) => el("div", "eyebrow", s);
export function button(label: string, fn: () => void, cls = "") {
  const b = el("button", cls, label);
  b.type = "button";
  // Decorative chess glyphs must not change a control's accessible name.
  if (label.trim()) b.setAttribute("aria-label", label);
  b.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !b.isConnected || b.disabled) return;
    const rect = b.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    // Pointer-up also works for a second finger and after a captured drag.
    // Consume the native click so it cannot hit a newly opened panel.
    event.preventDefault();
    suppressTouchClick = true;
    fn();
  });
  b.addEventListener("click", () => {
    // Touch browsers count successive taps across newly rendered controls.
    // Reject stale controls without suppressing the next screen's tap.
    if (!b.isConnected || b.disabled) return;
    fn();
  });
  return b;
}
