/** Arrow keys move focus; Enter/Space keep the browser's normal button activation. */
export function navigateMenu(root: HTMLElement, event: KeyboardEvent): boolean {
  const key = event.key;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key))
    return false;
  const active = document.activeElement as HTMLElement | null;
  if (active?.matches("select, textarea, input[type=text], input[type=number]"))
    return false;
  if (
    active?.matches("input[type=range]") &&
    (key === "ArrowLeft" || key === "ArrowRight")
  )
    return false;

  const visible = (node: HTMLElement) => node.getClientRects().length > 0;
  const selector =
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';
  let choices = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    visible,
  );
  const grid = active?.closest<HTMLElement>(
    ".choices, .map, .gallery-grid, .demo-controls, .review-actions",
  );
  let columns = 1;
  if (grid) {
    choices = [...grid.querySelectorAll<HTMLElement>(selector)].filter(visible);
    columns = grid.classList.contains("floor-plan")
      ? 3
      : Math.max(
          1,
          getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        );
  }
  if (!choices.length) return false;
  const current = Math.max(0, choices.indexOf(active!));
  const delta =
    key === "ArrowLeft"
      ? -1
      : key === "ArrowRight"
        ? 1
        : key === "ArrowUp"
          ? -columns
          : columns;
  const next = (current + delta + choices.length) % choices.length;
  choices[next].focus({ preventScroll: true });
  choices[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  event.preventDefault();
  return true;
}
