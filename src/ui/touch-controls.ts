import { el, button } from "./dom";
import type { Target } from "../world";
import {
  controlRect,
  defaultControls,
  type TouchId,
  type TouchLayout,
} from "../controls";

/** Pointer capture keeps a dragged thumb on the stick until release or cancel. */
export class TouchControls {
  private root = el("nav", "touch-controls");
  private stick: HTMLButtonElement;
  private thumb = el("span", "joystick-thumb");
  private investigate: HTMLButtonElement;
  private pointer: number | null = null;
  private active = false;
  private target = "";
  private layout: TouchLayout = defaultControls().mobile;
  private controls: Record<TouchId, HTMLButtonElement>;
  private media = matchMedia("(pointer: coarse), (max-width: 700px)");

  constructor(
    private move: (right: number, down: number) => void,
    interact: () => void,
    menu: () => void,
    extra: { notebook: () => void; map: () => void; review: () => void },
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
    const notebook = button("Notebook", extra.notebook, "touch-notebook");
    const map = button("Map", extra.map, "touch-map");
    const review = button("Case review", extra.review, "touch-review");
    review.hidden = true;
    this.controls = {
      joystick: this.stick,
      menu: menuButton,
      interact: this.investigate,
      notebook,
      map,
      review,
    };
    for (const [id, control] of Object.entries(this.controls)) {
      control.dataset.control = id;
      this.root.append(control);
    }
    this.root.append(help);
    document.body.append(this.root);
    this.place();
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
    window.addEventListener("resize", () => {
      this.reset();
      this.place();
    });
    this.media.addEventListener("change", () => this.setActive(this.active));
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

  setLayout(layout: TouchLayout) {
    this.layout = structuredClone(layout);
    this.reset();
    this.place();
  }

  private place() {
    const style = getComputedStyle(this.root);
    const insets = {
      left: parseFloat(style.paddingLeft) || 12,
      right: parseFloat(style.paddingRight) || 12,
      top: parseFloat(style.paddingTop) || 10,
      bottom: parseFloat(style.paddingBottom) || 16,
    };
    for (const id of Object.keys(this.controls) as TouchId[]) {
      const rect = controlRect(
        this.layout,
        id,
        innerWidth,
        innerHeight,
        insets,
      );
      Object.assign(this.controls[id].style, {
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
    }
    const thumbSize =
      controlRect(this.layout, "joystick", innerWidth, innerHeight).width *
      0.34;
    Object.assign(this.thumb.style, {
      width: thumbSize + "px",
      height: thumbSize + "px",
      left: `calc(50% - ${thumbSize / 2}px)`,
      top: `calc(50% - ${thumbSize / 2}px)`,
    });
  }

  update(target: Target | null, reviewReady = false) {
    if (this.root.hidden) return;
    this.controls.review.hidden = !reviewReady;
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
