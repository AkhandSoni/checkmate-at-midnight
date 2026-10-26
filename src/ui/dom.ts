/** Small DOM helpers. Story and saved text always become text nodes. */
export type Child = Node | string | null | undefined;
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
  b.addEventListener("click", (e) => {
    if (e.detail > 1) return;
    fn();
  });
  return b;
}
