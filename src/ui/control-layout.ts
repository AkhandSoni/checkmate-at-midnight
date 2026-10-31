import { button, el, text } from "./dom";
import {
  controlRect,
  defaultControls,
  touchNames,
  type TouchId,
  type TouchLayout,
} from "../controls";

/** The preview uses the same placement calculation as the actual touch controls. */
export function editTouchLayout(
  initial: TouchLayout,
  save: (layout: TouchLayout) => void,
  cancel: () => void,
) {
  let draft = structuredClone(initial);
  let selected: TouchId = "joystick";
  let drag: {
    id: TouchId;
    pointer: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null = null;
  let suppressClick = false;
  const root = el("section", "control-layout-editor");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Arrange touch controls");
  const select = el("select");
  select.setAttribute("aria-label", "Selected touch control");
  for (const id of Object.keys(touchNames) as TouchId[]) {
    const option = el("option", "", touchNames[id]);
    option.value = id;
    select.append(option);
  }
  const size = el("input");
  size.type = "range";
  size.min = ".7";
  size.max = "1.7";
  size.step = ".05";
  size.id = "touch-control-size";
  const label = el("label", "", "Size");
  label.htmlFor = size.id;
  const output = el("output");
  const stage = el("div", "control-layout-preview");
  const controls = new Map<TouchId, HTMLButtonElement>();
  const finishDrag = () => {
    if (drag?.moved) suppressClick = true;
    drag = null;
  };
  root.addEventListener(
    "pointerdown",
    () => {
      suppressClick = false;
    },
    true,
  );
  root.addEventListener(
    "click",
    (event) => {
      if (suppressClick && event.detail) {
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  const place = () => {
    const style = getComputedStyle(stage);
    const insets = {
      left: parseFloat(style.paddingLeft) || 12,
      right: parseFloat(style.paddingRight) || 12,
      top: parseFloat(style.paddingTop) || 10,
      bottom: parseFloat(style.paddingBottom) || 16,
    };
    for (const [id, node] of controls) {
      const rect = controlRect(draft, id, innerWidth, innerHeight, insets);
      Object.assign(node.style, {
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
      node.classList.toggle("selected", selected === id);
    }
    select.value = selected;
    size.value = String(draft[selected].scale);
    output.textContent = Math.round(draft[selected].scale * 100) + "%";
  };
  const move = (id: TouchId, x: number, y: number) => {
    draft[id].x = Math.max(0, Math.min(1, x / innerWidth));
    draft[id].y = Math.max(0, Math.min(1, y / innerHeight));
    place();
  };
  for (const id of Object.keys(touchNames) as TouchId[]) {
    const node = button(
      touchNames[id],
      () => {
        selected = id;
        place();
      },
      "layout-control" + (id === "joystick" ? " layout-joystick" : ""),
    );
    node.dataset.control = id;
    node.setAttribute("aria-label", "Move " + touchNames[id]);
    if (id === "joystick") node.append(el("span", "layout-joystick-thumb"));
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      selected = id;
      const rect = node.getBoundingClientRect();
      drag = {
        id,
        pointer: event.pointerId,
        dx: event.clientX - rect.left - rect.width / 2,
        dy: event.clientY - rect.top - rect.height / 2,
        moved: false,
      };
      node.setPointerCapture(event.pointerId);
      place();
    });
    node.addEventListener("pointermove", (event) => {
      if (drag?.pointer !== event.pointerId) return;
      event.preventDefault();
      drag.moved = true;
      move(id, event.clientX - drag.dx, event.clientY - drag.dy);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      node.addEventListener(name, finishDrag);
    node.addEventListener("keydown", (event) => {
      const delta: Record<string, [number, number]> = {
        ArrowUp: [0, -5],
        ArrowDown: [0, 5],
        ArrowLeft: [-5, 0],
        ArrowRight: [5, 0],
      };
      if (!delta[event.key]) return;
      event.preventDefault();
      event.stopPropagation();
      selected = id;
      const rect = node.getBoundingClientRect(),
        [dx, dy] = delta[event.key];
      move(
        id,
        rect.left + rect.width / 2 + dx,
        rect.top + rect.height / 2 + dy,
      );
    });
    stage.append(node);
    controls.set(id, node);
  }
  select.onchange = () => {
    selected = select.value as TouchId;
    place();
  };
  size.oninput = () => {
    draft[selected].scale = Number(size.value);
    place();
  };
  const toolbar = el(
    "div",
    "control-layout-toolbar",
    el(
      "div",
      "layout-instructions",
      el("h2", "", "Arrange touch controls"),
      text(
        "Drag any control. Select it to change its size. Nothing moves in the game while editing.",
      ),
    ),
    el(
      "div",
      "layout-options",
      select,
      label,
      size,
      output,
      button("Move controls", () => {
        toolbar.hidden = true;
        compact.hidden = false;
      }),
      button("Reset", () => {
        draft = defaultControls().mobile;
        place();
      }),
      button("Cancel", cancel),
      button("Save layout", () => save(draft), "primary"),
    ),
  );
  const compact = el(
    "div",
    "layout-compact-bar",
    button("Sizes", () => {
      compact.hidden = true;
      toolbar.hidden = false;
    }),
    button("Cancel", cancel),
    button("Save layout", () => save(draft), "primary"),
  );
  compact.hidden = true;
  root.append(stage, toolbar, compact);
  window.addEventListener("resize", finishDrag);
  const observer = new ResizeObserver(place);
  observer.observe(root);
  const dispose = () => {
    observer.disconnect();
    window.removeEventListener("resize", finishDrag);
  };
  queueMicrotask(place);
  return { element: root, dispose };
}
