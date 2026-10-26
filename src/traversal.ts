import type { Tree, TreeNode } from "./engine";
/** The displayed frontier is the real algorithm state, not a precomputed animation. */
export class Traversal {
  readonly by: Map<string, TreeNode>;
  readonly frontier: string[];
  readonly visited: string[] = [];
  head = 0;
  current: string | null = null;
  readonly tree: Tree;
  readonly mode: "DFS" | "BFS";

  constructor(tree: Tree, mode: "DFS" | "BFS") {
    this.tree = tree;
    this.mode = mode;
    this.by = new Map(tree.nodes.map((n) => [n.id, n]));
    this.frontier = [tree.root];
  }
  /** One visible algorithm step: pop for DFS, dequeue by head index for BFS. */
  step() {
    if (this.done) return null;
    const id =
      this.mode === "DFS" ? this.frontier.pop()! : this.frontier[this.head++];
    const n = this.by.get(id);
    if (!n) throw Error("Broken tree edge: " + id);
    this.current = id;
    this.visited.push(id);
    if (this.mode === "DFS") {
      if (n.right) this.frontier.push(n.right);
      if (n.left) this.frontier.push(n.left);
    } else {
      if (n.left) this.frontier.push(n.left);
      if (n.right) this.frontier.push(n.right);
    }
    return n;
  }
  get pending() {
    return this.mode === "DFS"
      ? [...this.frontier].reverse()
      : this.frontier.slice(this.head);
  }
  get done() {
    return this.mode === "DFS"
      ? this.frontier.length === 0
      : this.head >= this.frontier.length;
  }
}
