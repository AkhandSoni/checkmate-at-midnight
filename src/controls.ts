/** Input preferences are independent of case saves and audio/video settings. */
export const actions = {
  up: { label: "Move up", keys: ["w", "arrowup"] },
  down: { label: "Move down", keys: ["s", "arrowdown"] },
  left: { label: "Move left", keys: ["a", "arrowleft"] },
  right: { label: "Move right", keys: ["d", "arrowright"] },
  sprint: { label: "Run", keys: ["shift"] },
  interact: { label: "Investigate", keys: ["e"] },
  notebook: { label: "Notebook", keys: ["j"] },
  map: { label: "Floor plan", keys: ["g"] },
  pause: { label: "Pause / back", keys: ["escape"] },
  fullscreen: { label: "Fullscreen", keys: ["f"] },
  mute: { label: "Mute audio", keys: ["m"] },
  choice1: { label: "First choice", keys: ["1"] },
  choice2: { label: "Second choice", keys: ["2"] },
  tree: { label: "DSA visualizer", keys: ["t"] },
};
export type Action = keyof typeof actions;
export type Bindings = Record<Action, string[]>;
export const touchNames = {
  joystick: "Joystick",
  menu: "Menu",
  interact: "Investigate",
  notebook: "Notebook",
  map: "Map",
  review: "Case review",
};
export type TouchId = keyof typeof touchNames;
export type Placement = { x: number | null; y: number | null; scale: number };
export type TouchLayout = Record<TouchId, Placement>;
export type ControlPreferences = {
  version: 1;
  bindings: Bindings;
  mobile: TouchLayout;
};
export const CONTROL_STORAGE = "blackrook-controls";
export function defaultControls(): ControlPreferences {
  return {
    version: 1,
    bindings: Object.fromEntries(
      Object.entries(actions).map(([id, a]) => [id, [...a.keys]]),
    ) as Bindings,
    mobile: Object.fromEntries(
      Object.keys(touchNames).map((id) => [id, { x: null, y: null, scale: 1 }]),
    ) as TouchLayout,
  };
}
const movement = new Set<Action>(["up", "down", "left", "right", "sprint"]);
export function isMovement(action: Action) {
  return movement.has(action);
}
export function normalizeKey(key: string) {
  return key.toLowerCase();
}
export function keyName(key: string) {
  return (
    (
      {
        " ": "Space",
        arrowup: "↑",
        arrowdown: "↓",
        arrowleft: "←",
        arrowright: "→",
        escape: "Esc",
        shift: "Shift",
        backspace: "Backspace",
        delete: "Delete",
      } as Record<string, string>
    )[key] ||
    (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1))
  );
}
export function actionForKey(
  bindings: Bindings,
  key: string,
): Action | undefined {
  return (Object.keys(actions) as Action[]).find((id) =>
    bindings[id].includes(normalizeKey(key)),
  );
}
export function actionHeld(
  bindings: Bindings,
  keys: ReadonlySet<string>,
  action: Action,
) {
  return bindings[action].some((key) => keys.has(key));
}
function validBindingKey(key: string): boolean {
  return !(
    [
      "escape",
      "enter",
      "tab",
      "control",
      "alt",
      "meta",
      "dead",
      "unidentified",
      "f5",
      "f11",
      "f12",
    ].includes(key) ||
    !(
      key.length === 1 ||
      [
        "shift",
        "backspace",
        "delete",
        "home",
        "end",
        "pageup",
        "pagedown",
      ].includes(key) ||
      /^arrow(up|down|left|right)$/.test(key) ||
      /^f([1-9]|10)$/.test(key)
    )
  );
}
export function bindingError(
  bindings: Bindings,
  action: Action,
  key: string,
): string {
  if (!validBindingKey(key))
    return "Choose a single key. Esc cancels; Enter and Tab stay available for menus.";
  if (key.startsWith("arrow") && !isMovement(action))
    return "Arrow keys navigate menus. Use another key for this action.";
  const owner = actionForKey(bindings, key);
  return owner && owner !== action
    ? `${keyName(key)} is already assigned to ${actions[owner].label}.`
    : "";
}
export function rebind(
  bindings: Bindings,
  action: Action,
  slot: number,
  raw: string,
): Bindings {
  const key = normalizeKey(raw),
    error = bindingError(bindings, action, key);
  if (error) throw Error(error);
  if (
    slot < 0 ||
    slot >= actions[action].keys.length ||
    !Number.isInteger(slot)
  )
    throw Error("Unknown key slot");
  if (bindings[action].some((other, i) => other === key && i !== slot))
    throw Error("That key is already assigned to this action.");
  const result = structuredClone(bindings);
  result[action][slot] = key;
  return result;
}
export function restoreControls(raw: unknown): ControlPreferences {
  const result = defaultControls();
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as ControlPreferences).version !== 1
  )
    return result;
  const saved = raw as Partial<ControlPreferences>;
  if (saved.bindings && typeof saved.bindings === "object") {
    const seen = new Set<string>();
    const valid = (Object.keys(actions) as Action[]).every((id) => {
      const keys = saved.bindings![id];
      if (
        !Array.isArray(keys) ||
        !keys.length ||
        keys.length > actions[id].keys.length
      )
        return false;
      return keys.every((key) => {
        if (
          typeof key !== "string" ||
          seen.has(key) ||
          key !== normalizeKey(key)
        )
          return false;
        // Escape remains a built-in recovery key, and is the default pause binding.
        if (!(id === "pause" && key === "escape") && !validBindingKey(key))
          return false;
        if (key.startsWith("arrow") && !isMovement(id)) return false;
        seen.add(key);
        return true;
      });
    });
    if (valid)
      result.bindings = Object.fromEntries(
        (Object.keys(actions) as Action[]).map((id) => [
          id,
          [...saved.bindings![id]],
        ]),
      ) as Bindings;
  }
  if (saved.mobile && typeof saved.mobile === "object")
    for (const id of Object.keys(touchNames) as TouchId[]) {
      const item = saved.mobile[id];
      if (!item || typeof item !== "object") continue;
      const positionValid =
        (item.x === null && item.y === null) ||
        [item.x, item.y].every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
        );
      if (
        positionValid &&
        typeof item.scale === "number" &&
        Number.isFinite(item.scale) &&
        item.scale >= 0.7 &&
        item.scale <= 1.7
      )
        result.mobile[id] = { x: item.x, y: item.y, scale: item.scale };
    }
  return result;
}
export function loadControls(): ControlPreferences {
  try {
    return restoreControls(
      JSON.parse(localStorage.getItem(CONTROL_STORAGE) || "null"),
    );
  } catch {
    return defaultControls();
  }
}
export function controlSize(id: TouchId, scale: number) {
  const sizes: Record<TouchId, [number, number]> = {
    joystick: [140, 140],
    menu: [124, 48],
    interact: [144, 64],
    notebook: [92, 44],
    map: [64, 44],
    review: [112, 44],
  };
  return {
    width: Math.max(44, sizes[id][0] * scale),
    height: Math.max(44, sizes[id][1] * scale),
  };
}
export function controlRect(
  layout: TouchLayout,
  id: TouchId,
  width: number,
  height: number,
  insets = { left: 12, right: 12, top: 10, bottom: 16 },
) {
  const pref = layout[id];
  const size = controlSize(id, pref.scale);
  const w = Math.min(
    size.width,
    Math.max(44, width - insets.left - insets.right),
  );
  const h = Math.min(
    size.height,
    Math.max(44, height - insets.top - insets.bottom),
  );
  let x = pref.x === null ? width / 2 : pref.x * width;
  let y = pref.y === null ? height / 2 : pref.y * height;
  if (pref.x === null) {
    if (id === "joystick") {
      x = Math.max(92, width * 0.16);
      y = height - Math.max(32, height * 0.1) - h / 2;
    }
    if (id === "menu") {
      x = width - insets.right - w / 2;
      y =
        height -
        insets.bottom -
        controlSize("interact", layout.interact.scale).height -
        10 -
        h / 2;
    }
    if (id === "interact") {
      x = width - insets.right - w / 2;
      y = height - insets.bottom - h / 2;
    }
    if (id === "map") {
      x = width - insets.right - w / 2;
      y = insets.top + h / 2;
    }
    if (id === "notebook") {
      x =
        width -
        insets.right -
        controlSize("map", layout.map.scale).width -
        8 -
        w / 2;
      y = insets.top + h / 2;
    }
    if (id === "review") {
      x = width / 2;
      y = Math.max(90, height * 0.24);
    }
  }
  return {
    left: Math.max(insets.left, Math.min(width - insets.right - w, x - w / 2)),
    top: Math.max(insets.top, Math.min(height - insets.bottom - h, y - h / 2)),
    width: w,
    height: h,
  };
}
