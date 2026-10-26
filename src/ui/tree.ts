import { nodeLabel } from "./tree-labels";
import { Traversal } from "../traversal";
import {
  trees,
  history,
  selectedNodes,
  type State,
  type Tree,
  type TreeNode,
} from "../engine";
import { el, eye, text, button } from "./dom";

/** A presentation of the live Traversal instance; it never changes the story. */
export class TreeView {
  private treeTimer = 0;
  private treeMode: "DFS" | "BFS" = "DFS";
  private treeKind: "investigation" | "full" = "investigation";
  private treeSpeed = 4;
  private treeDepth = 2;
  private traversal: Traversal | null = null;
  private treePlaying = false;
  private inspectedNode: string | null = null;
  private state!: State;
  private action?: string;
  constructor(
    private mount: (panel: HTMLElement, close: () => void) => void,
    private isOpen: () => boolean,
  ) {}

  open(state: State, action: string | undefined, back: () => void) {
    this.state = state;
    this.action = action;
    this.traversal = new Traversal(trees[this.treeKind], this.treeMode);
    this.inspectedNode = null;
    this.renderTree(back);
  }

  stop() {
    clearTimeout(this.treeTimer);
    this.treePlaying = false;
  }

  get snapshot() {
    const t = this.traversal;
    return t
      ? {
          mode: t.mode,
          visited: [...t.visited],
          pending: t.pending,
          head: t.head,
        }
      : null;
  }
  private renderTree(back: () => void) {
    const tree = trees[this.treeKind] as Tree,
      t = this.traversal!,
      by = new Map(tree.nodes.map((n) => [n.id, n]));
    const path = new Set(selectedNodes(this.state, this.action));
    const panel = el("section", "panel tree-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "DSA traversal visualizer");
    panel.append(
      el(
        "header",
        "panel-head",
        el(
          "div",
          "",
          eye("DSA presentation · Actual data structures"),
          el("h2", "", "The anatomy of a decision"),
        ),
        button("Close ×", back, "quiet"),
      ),
    );
    const toolbar = el("div", "tree-toolbar");
    const kind = el("select");
    kind.setAttribute("aria-label", "Tree artifact");
    for (const [value, title] of [
      ["investigation", "Investigation · 127 nodes"],
      ["full", "With verdicts · 639 nodes"],
    ]) {
      const o = el("option", "", title);
      o.value = value;
      kind.append(o);
    }
    kind.value = this.treeKind;
    kind.onchange = () => {
      this.treeKind = kind.value as typeof this.treeKind;
      this.traversal = new Traversal(
        trees[this.treeKind] as Tree,
        this.treeMode,
      );
      this.inspectedNode = null;
      this.renderTree(back);
    };
    toolbar.append(kind);
    for (const mode of ["DFS", "BFS"] as const)
      toolbar.append(
        button(
          mode,
          () => {
            this.treeMode = mode;
            this.traversal = new Traversal(tree, mode);
            this.inspectedNode = null;
            this.renderTree(back);
          },
          "small" + (this.treeMode === mode ? " active" : ""),
        ),
      );
    const play = button(
      "Play",
      () => {
        this.treePlaying = !this.treePlaying;
        play.textContent = this.treePlaying ? "Pause" : "Play";
        play.setAttribute("aria-label", play.textContent);
        if (this.treePlaying) schedule();
        else clearTimeout(this.treeTimer);
      },
      "small primary",
    );
    const step = button(
      "Step",
      () => {
        this.treePlaying = false;
        play.textContent = "Play";
        play.setAttribute("aria-label", "Play");
        clearTimeout(this.treeTimer);
        this.inspectedNode = null;
        t.step();
        refresh();
      },
      "small",
    );
    toolbar.append(
      play,
      step,
      button(
        "Reset",
        () => {
          this.traversal = new Traversal(tree, this.treeMode);
          this.inspectedNode = null;
          this.renderTree(back);
        },
        "small",
      ),
    );
    const speed = el("input");
    speed.type = "range";
    speed.min = "1";
    speed.max = "20";
    speed.step = "1";
    speed.value = String(this.treeSpeed);
    speed.id = "traversal-speed";
    const sl = el("label", "", "Speed");
    sl.htmlFor = speed.id;
    const so = el("output", "sans", this.treeSpeed + " / s");
    speed.oninput = () => {
      this.treeSpeed = Number(speed.value);
      so.textContent = this.treeSpeed + " / s";
    };
    toolbar.append(sl, speed, so);
    const depth = el("select");
    depth.setAttribute("aria-label", "Visible tree depth");
    for (const n of [2, 3, 4, 6, 9]) {
      const o = el("option", "", "Depth " + n);
      o.value = String(n);
      depth.append(o);
    }
    depth.value = String(this.treeDepth);
    depth.onchange = () => {
      this.treeDepth = Number(depth.value);
      refresh();
    };
    toolbar.append(depth);
    const treeView = el("div", "tree-canvas"),
      detail = el("div", "tree-detail"),
      stats = el("div", "tree-stats"),
      side = el("aside", "tree-sidebar"),
      frontier = el("div", "frontier"),
      stack = el("ol", "history-stack");
    for (const h of history(this.state))
      stack.append(
        el(
          "li",
          "",
          el("code", "", h.node + " → " + h.child),
          String(h.bit) + " · " + h.label,
        ),
      );
    if (this.action)
      stack.append(
        el(
          "li",
          "",
          el(
            "code",
            "",
            selectedNodes(this.state, this.action).slice(6).join(" → "),
          ),
          this.action,
        ),
      );
    side.append(
      eye("Path / history stack"),
      stack,
      el(
        "h3",
        "",
        this.treeMode === "DFS"
          ? "Stack · next pop first"
          : "Queue · head first",
      ),
      frontier,
      el("h3", "", "Complexity"),
      text(
        this.treeMode === "DFS"
          ? "Preorder DFS: pop the stack, visit the node, push right then left. O(n) time and O(h) auxiliary stack space for this binary tree."
          : "Level-order BFS: read queue[head++] and append left then right. O(n) time and O(w) frontier space. The retained queue array here uses O(n) storage. Visited history is O(n).",
      ),
      text(
        "Evidence uses a Set: average O(1) membership. The fixed proof rule takes O(1) checks. Decisions follow one root-to-leaf path; DFS/BFS do not determine the murderer.",
      ),
      el("h3", "", "Two different structures"),
      text(
        "Mansion: an undirected room graph with 6 vertices and 7 edges. Narrative: a rooted binary decision tree. This is not a binary search tree; no key-ordering invariant exists.",
      ),
      text(
        "127 = 63 decisions + 64 contextual reviews. The full tree has 639 = 319 decisions + 320 terminal contexts, mapping to six distinct endings. Heights are 6 and at most 9 edges.",
      ),
      text(
        "Path reconstruction follows parent links once per selected edge: O(h) time/output. The current node and its two children are shown below the diagram.",
      ),
    );
    panel.append(
      toolbar,
      el(
        "div",
        "tree-columns",
        el("div", "tree-main", treeView, stats, detail),
        side,
      ),
    );
    this.mount(el("div", "scrim", panel), back);
    const refresh = () => {
      const active =
        by.get(
          this.inspectedNode || t.current || "root" + this.state.path.join(""),
        ) || by.get(tree.root)!;
      const visited = new Set(t.visited);
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("role", "group");
      svg.setAttribute(
        "aria-label",
        this.treeMode + " visitation, selected path and focused subtree",
      );
      // Focus a deep node's ancestors/subtree at readable scale, instead of 639 unreadable boxes.
      const parent = new Map<string, string>();
      for (const n of tree.nodes) {
        if (n.left) parent.set(n.left, n.id);
        if (n.right) parent.set(n.right, n.id);
      }
      let focusRoot = tree.root;
      if (active.depth > this.treeDepth) {
        focusRoot = active.id;
        for (let i = 0; i < Math.min(2, active.depth); i++)
          focusRoot = parent.get(focusRoot) || focusRoot;
      }
      const localRoot = by.get(focusRoot)!;
      const levels = Math.min(
        this.treeDepth,
        Math.max(...tree.nodes.map((n) => n.depth)) - localRoot.depth,
      );
      const visibleLevels = Math.min(levels, 6);
      const width = Math.max(880, Math.pow(2, visibleLevels) * 212 + 40);
      const height = Math.max(330, (visibleLevels + 1) * 110 + 30);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      if (levels > 2) {
        svg.style.minWidth = width + "px";
        svg.style.height = height + "px";
      }
      const loc = new Map<string, { x: number; y: number }>();
      function place(n: TreeNode, lo: number, hi: number) {
        const depth = n.depth - localRoot.depth;
        if (depth > Math.min(levels, 6)) return;
        loc.set(n.id, { x: (lo + hi) / 2, y: 48 + depth * 110 });
        if (n.left) place(by.get(n.left)!, lo, (lo + hi) / 2);
        if (n.right) place(by.get(n.right)!, (lo + hi) / 2, hi);
      }
      place(localRoot, 20, width - 20);
      for (const [id, pos] of loc) {
        const n = by.get(id)!;
        for (const child of [n.left, n.right])
          if (child && loc.has(child)) {
            const dest = loc.get(child)!;
            const line = document.createElementNS(ns, "path");
            line.setAttribute(
              "d",
              `M${pos.x},${pos.y + 31}L${dest.x},${dest.y - 31}`,
            );
            line.setAttribute(
              "class",
              "tree-link" + (path.has(child) ? " path" : ""),
            );
            svg.append(line);
          }
      }
      for (const [id, pos] of loc) {
        const group = document.createElementNS(ns, "g");
        const n = by.get(id)!;
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        group.setAttribute("aria-label", id + " " + (n.prompt || n.type));
        group.style.cursor = "pointer";
        const description = nodeLabel(n);
        group.setAttribute("data-node-id", id);
        group.setAttribute(
          "aria-label",
          description.title + ", " + description.subtitle + ", " + id,
        );
        group.setAttribute(
          "class",
          "tree-card" + (active.id === id ? " current" : ""),
        );
        const card = document.createElementNS(ns, "rect");
        card.setAttribute("x", String(pos.x - 96));
        card.setAttribute("y", String(pos.y - 31));
        card.setAttribute("width", "192");
        card.setAttribute("height", "62");
        card.setAttribute("rx", "3");
        card.setAttribute(
          "class",
          "tree-node" +
            (visited.has(id) ? " visited" : "") +
            (path.has(id) ? " path" : "") +
            (active.id === id ? " current" : ""),
        );
        const title = document.createElementNS(ns, "title");
        title.textContent =
          description.title +
          " · " +
          id +
          " · " +
          (n.prompt || n.outcomeRule || n.type);
        group.append(card, title);
        for (const [content, x, y, className] of [
          [description.icon, pos.x - 80, pos.y + 11, "tree-card-icon"],
          [description.title, pos.x - 48, pos.y - 3, "tree-card-title"],
          [description.subtitle, pos.x - 48, pos.y + 16, "tree-card-subtitle"],
        ] as [string, number, number, string][]) {
          const label = document.createElementNS(ns, "text");
          label.setAttribute("x", String(x));
          label.setAttribute("y", String(y));
          label.setAttribute("class", className);
          label.textContent = content;
          group.append(label);
        }
        const select = (target = id) => {
          this.inspectedNode = target;
          refresh();
          queueMicrotask(() =>
            treeView
              .querySelector<SVGElement>('[data-node-id="' + target + '"]')
              ?.focus(),
          );
        };
        group.addEventListener("click", () => select());
        group.addEventListener("keydown", (event) => {
          const destinations: Record<string, string | undefined> = {
            ArrowLeft: n.left,
            ArrowRight: n.right,
            ArrowUp: n.parent || parent.get(id),
            ArrowDown: n.left || n.right,
          };
          if (event.key in destinations) {
            event.preventDefault();
            event.stopPropagation();
            const destination = destinations[event.key];
            if (destination) select(destination);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            select();
          }
        });
        svg.append(group);
      }
      treeView.replaceChildren(svg);
      stats.textContent = `Visited ${t.visited.length} / ${tree.nodes.length} · ${this.treeMode} current: ${t.current || "not started"} · ${this.treeMode === "BFS" ? "head index " + t.head : "frontier size " + t.pending.length} · View root: ${focusRoot} · Red edges: chosen path · Filled cards: visited · White card: inspected`;
      frontier.textContent = t.pending.length
        ? t.pending.slice(0, 30).join(" → ") +
          (t.pending.length > 30 ? ` … +${t.pending.length - 30} more` : "")
        : "Empty · traversal complete";
      detail.replaceChildren(
        el(
          "strong",
          "",
          nodeLabel(active).title +
            " · " +
            active.id +
            " · " +
            active.type +
            " · depth " +
            active.depth,
        ),
        el(
          "div",
          "",
          active.prompt ||
            active.speaker ||
            active.outcomeRule ||
            "Contextual case review",
        ),
        el(
          "div",
          "child-choices",
          ...(active.left && active.right
            ? [
                el(
                  "span",
                  "",
                  "Left / 0: " + active.choices?.[0] + " → " + active.left,
                ),
                el(
                  "span",
                  "",
                  "Right / 1: " + active.choices?.[1] + " → " + active.right,
                ),
              ]
            : [
                el(
                  "span",
                  "",
                  "Terminal context" +
                    (active.action
                      ? " · " + active.action
                      : " · Evidence and verdict menus resolve the outcome."),
                ),
              ]),
        ),
      );
      step.disabled = t.done;
      play.disabled = t.done;
    };
    const schedule = () => {
      clearTimeout(this.treeTimer);
      if (!this.treePlaying || !this.isOpen()) return;
      this.treeTimer = window.setTimeout(() => {
        this.inspectedNode = null;
        t.step();
        refresh();
        if (t.done) {
          this.treePlaying = false;
          play.textContent = "Play";
          play.setAttribute("aria-label", "Play");
        } else schedule();
      }, 1000 / this.treeSpeed);
    };
    refresh();
  }
}
