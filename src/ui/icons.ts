/** Tiny original line drawings. Labels stay in accessible, selectable text. */
export function evidenceIcon(id: string): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "evidence-icon");
  const paths: Record<string, string> = {
    poison_flask: "M9 3h6m-5 0v6l-5 9q-1 3 2 3h10q3 0 2-3l-5-9V3M8 14h8",
    goblet_residue: "M6 3h12l-1 8q-5 6-10 0L6 3m6 12v6m-4 0h8",
    red_thread:
      "M4 4l7 2 8-2-1 9 2 7-8-2-8 2 1-8-1-8m5 5q8 2 5 6m-4 5q-4 3-6 0",
    low_bleeding: "M5 20L17 5l2 2L7 22M14 9l5 4m-1-8 2-3",
    borrowed_keys:
      "M9 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0m-1 3 10 9 3-3-3-3m-3 3 2-2",
    document: "M6 3h9l4 4v14H6V3m9 0v5h4M9 12h7m-7 4h7",
    book: "M5 3h14v18H5q-3-1 0-3h14M5 3v15m4-11h6m-6 4h6",
    testimony: "M5 5h14v11h-7l-5 4v-4H5V5m4 4h6m-6 3h8",
  };
  const documentIds = ["torn_will", "burned_accounts"];
  const bookIds = ["study_ledger", "medicine_register", "duty_book"];
  const kind = paths[id]
    ? id
    : documentIds.includes(id)
      ? "document"
      : bookIds.includes(id)
        ? "book"
        : "testimony";
  const drawing = document.createElementNS(namespace, "path");
  drawing.setAttribute("d", paths[kind]);
  drawing.setAttribute("fill", "none");
  drawing.setAttribute("stroke", "currentColor");
  drawing.setAttribute("stroke-width", "1.5");
  drawing.setAttribute("stroke-linecap", "round");
  drawing.setAttribute("stroke-linejoin", "round");
  icon.append(drawing);
  return icon;
}
