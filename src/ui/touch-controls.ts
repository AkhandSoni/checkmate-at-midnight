import { el, button } from "./dom";
import type { Target } from "../world";

/** Pointer capture keeps a dragged thumb on the stick until release or cancel. */
export class TouchControls {
  private root = el("nav", "touch-controls");
  private stick: HTMLButtonElement;
  private thumb = el("span", "joystick-thumb");
  private investigate: HTMLButtonElement;
  private pointer: number | null = null;
  private active = false;
  private target = "";
  private suppressClick = false;
  private media = matchMedia("(pointer: coarse), (max-width: 700px)");

  constructor(
    private move: (right: number, down: number) => void,
    interact: () => void,
    menu: () => void,
  ) {
    this.root.id = "touch-controls";
    this.root.setAttribute("aria-label", "Touch controls");
    this.root.hidden = true;
    this.stick = button("", () => {}, "joystick");
    this.stick.setAttribute("aria-label", "Movement joystick");
    this.stick.setAttribute("aria-describedby", "joystick-help");
    const help = el(
      "span",
      "sr-only",
      "Drag in any direction to move. Release to stop.",
    );
    help.id = "joystick-help";
    this.stick.append(el("span", "joystick-track"), this.thumb);
    const menuButton = button("☰  Menu", menu, "touch-menu");
    menuButton.setAttribute("aria-label", "Menu");
    this.investigate = button(
      "Investigate",
      interact,
      "touch-investigate primary",
    );
    this.investigate.disabled = true;
    this.touchAction(menuButton, menu);
    this.touchAction(this.investigate, interact);
    this.root.append(
      el(
        "div",
        "joystick-area",
        this.stick,
        el("span", "touch-hint", "Drag to move"),
        help,
      ),
      el("div", "touch-actions", menuButton, this.investigate),
    );
    document.body.append(this.root);
    document.addEventListener(
      "pointerdown",
      () => {
        this.suppressClick = false;
      },
      true,
    );
    document.addEventListener(
      "click",
      (event) => {
        // A native touch click can land on the dialogue replacing this control.
        if (
          this.suppressClick &&
          (event.detail > 0 || (event as PointerEvent).pointerType === "touch")
        ) {
          this.suppressClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    this.stick.addEventListener("pointerdown", (event) => {
      if (!this.active || this.pointer !== null || event.button !== 0) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      this.updatePointer(event);
    });
    this.stick.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.pointer) return;
      event.preventDefault();
      this.updatePointer(event);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      this.stick.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.pointer) this.reset();
      });
    window.addEventListener("blur", () => this.reset());
    window.addEventListener("resize", () => this.reset());
    this.media.addEventListener("change", () => this.setActive(this.active));
  }

  /** A second finger must work while the joystick owns the primary pointer. */
  private touchAction(control: HTMLButtonElement, action: () => void) {
    control.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch" || !this.active || control.disabled)
        return;
      const bounds = control.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        return;
      event.preventDefault();
      this.suppressClick = true;
      action();
    });
  }

  private updatePointer(event: PointerEvent) {
    const bounds = this.stick.getBoundingClientRect();
    const radius = bounds.width * 0.32;
    const x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    this.thumb.style.transform = `translate(${x * scale * radius}px, ${y * scale * radius}px)`;
    const strength = Math.max(0, Math.min(1, (length - 0.12) / 0.88));
    this.move(
      length ? (x / length) * strength : 0,
      length ? (y / length) * strength : 0,
    );
  }

  reset() {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.stick.hasPointerCapture(pointer))
      this.stick.releasePointerCapture(pointer);
    this.thumb.style.transform = "translate(0, 0)";
    this.move(0, 0);
  }

  setActive(active: boolean) {
    this.active = active;
    this.root.hidden = !active || !this.media.matches;
    this.reset();
  }

  update(target: Target | null) {
    if (this.root.hidden) return;
    const id = target?.id || "";
    if (id === this.target) return;
    this.target = id;
    this.investigate.disabled = !target;
    this.investigate.textContent = target ? target.label : "Move closer";
    this.investigate.setAttribute(
      "aria-label",
      target
        ? "Investigate " + target.label
        : "Investigate: move closer to an object",
    );
  }
}
