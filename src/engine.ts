import data from "./data/case.json";
import map from "./data/layout.json";
import {
  startCase,
  choose,
  currentDecision,
  inspect,
  proofStatus,
  resolveEnding,
  restore,
  compileInvestigationTree,
  compileFullTree,
  type CaseState,
  type TreeNode as NarrativeNode,
  type BinaryTree,
} from "./narrative";
export {
  startCase,
  choose,
  currentDecision,
  inspect,
  proofStatus,
  resolveEnding,
  restore,
};
export const story = data;
export const layout = map;
const investigation = compileInvestigationTree(story);
export const trees = { investigation, full: compileFullTree(investigation) };
const investigationNodes = new Map(
  investigation.nodes.map((node) => [node.id, node]),
);
export type State = CaseState;
export type Ending = keyof typeof story.endings;
export type EvidenceId = keyof typeof story.evidence;
export type RoomId = (typeof layout.rooms)[number]["id"];
export type TreeNode = NarrativeNode;
export type Tree = BinaryTree;
export type Settings = {
  music: number;
  effects: number;
  mute: boolean;
  reducedMotion: boolean;
  shadows: boolean;
  presentation: boolean;
};
export const defaults: Settings = {
  music: 0.35,
  effects: 0.55,
  mute: false,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  shadows: !matchMedia("(pointer: coarse)").matches,
  presentation: false,
};
export function getSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("blackrook-settings") || "{}");
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(s).filter(([k, v]) =>
          k === "music" || k === "effects"
            ? typeof v === "number" && v >= 0 && v <= 1
            : typeof v === "boolean" && Object.hasOwn(defaults, k),
        ),
      ),
    };
  } catch {
    return { ...defaults };
  }
}
export const evidenceName = (id: string) =>
  story.evidence[id as EvidenceId]?.title || id;
/** Read recorded decisions by following real child links, one edge per bit. */
export function history(state: State) {
  let node = investigationNodes.get("root")!;
  return state.path.map((bit, index) => {
    const decision =
      index === 0
        ? story.initial
        : story.suspects.find(
            (suspect) =>
              suspect.id ===
              story.orders[String(state.path[0]) as "0" | "1"][index - 1],
          )!;
    const child = bit === 0 ? node.left! : node.right!;
    const entry = {
      node: node.id,
      child,
      bit,
      speaker:
        index === 0
          ? "Detective Knight"
          : "name" in decision
            ? decision.name
            : "Detective Knight",
      label: decision.choices[bit].label,
      response: decision.choices[bit].response,
      evidence: decision.choices[bit].evidence,
    };
    node = investigationNodes.get(child)!;
    return entry;
  });
}
export function proof(s: State) {
  return proofStatus(story, s) as {
    poison: boolean;
    motive: boolean;
    opportunity: boolean;
    complete: boolean;
  };
}
export function verdictPath(s: State, action: string): string[] {
  const id = "root" + s.path.join("");
  switch (action) {
    case "final_lead":
      return [id, id + "L"];
    case "accuse_scarlet":
      return [id, id + "A", id + "F", id + "S"];
    case "accuse_ash":
      return [id, id + "A", id + "F", id + "P"];
    case "accuse_mara":
      return [id, id + "A", id + "H", id + "M"];
    case "accuse_voss":
      return [id, id + "A", id + "H", id + "V"];
    default:
      return [id];
  }
}
export function selectedNodes(s: State, action?: string) {
  const h = ["root", ...history(s).map((x) => x.child)];
  return [...new Set([...h, ...(action ? verdictPath(s, action) : [])])];
}
export type Save = {
  version: 2;
  proofRevision?: 2;
  state: State;
  position: [number, number];
  stage: "letter" | "arrival" | "world" | "ending";
  action?: string;
  ending?: Ending;
  demo: boolean;
  savedAt: number;
  pendingResponse?: boolean;
  navigation?: string;
  arrivalIndex?: number;
};
export function loadSave(): { save: Save | null; error: string } {
  try {
    const raw = localStorage.getItem("blackrook-case");
    if (!raw) return { save: null, error: "" };
    const r = JSON.parse(raw);
    if (
      r.version !== 2 ||
      (r.proofRevision !== undefined && r.proofRevision !== 2) ||
      (r.arrivalIndex !== undefined &&
        (r.stage !== "arrival" ||
          !Number.isInteger(r.arrivalIndex) ||
          r.arrivalIndex < 0 ||
          r.arrivalIndex >= story.arrival.length)) ||
      !["letter", "arrival", "world", "ending"].includes(r.stage) ||
      !Array.isArray(r.position) ||
      r.position.length !== 2 ||
      !r.position.every(
        (v: unknown) => typeof v === "number" && Number.isFinite(v),
      ) ||
      r.position[0] < 0.33 ||
      r.position[0] > 23.67 ||
      r.position[1] < 0.33 ||
      r.position[1] > 15.67 ||
      typeof r.demo !== "boolean" ||
      typeof r.savedAt !== "number" ||
      !Number.isFinite(r.savedAt) ||
      (r.pendingResponse !== undefined &&
        typeof r.pendingResponse !== "boolean") ||
      (r.navigation !== undefined &&
        r.navigation !== "" &&
        !layout.rooms.some((room) => room.id === r.navigation))
    )
      throw Error();
    r.state = restore(story, r.state);
    if (
      (r.stage === "letter" || r.stage === "arrival") &&
      (r.state.path.length || r.state.evidence.length)
    )
      throw Error();
    if (r.pendingResponse && (r.stage !== "world" || !r.state.path.length))
      throw Error();
    if (r.stage === "ending") {
      if (!story.actions.includes(r.action)) throw Error();
      if (resolveEnding(story, r.state, r.action) !== r.ending) {
        // Earlier cases used different corroboration and opportunity checks.
        // Preserve the player's route and clues instead of discarding the save.
        const evidence = new Set(r.state.evidence);
        const legacyProof =
          evidence.has("poison_flask") &&
          story.proofRule.motiveAny.some((id) => evidence.has(id)) &&
          story.proofRule.opportunityAny.some((id) => evidence.has(id));
        const legacyEnding = legacyProof
          ? "checkmate"
          : r.action === "accuse_voss"
            ? "voss_free"
            : "fire";
        if (
          r.proofRevision !== undefined ||
          r.ending !== legacyEnding ||
          !["accuse_voss", "final_lead"].includes(r.action)
        )
          throw Error();
        r.stage = "world";
        delete r.action;
        delete r.ending;
        return {
          save: r,
          error:
            "Your saved case has been reopened for the updated evidence checks. Continue to review your deductions; your choices and clues are preserved.",
        };
      }
    } else if (r.action || r.ending) throw Error();
    return { save: r, error: "" };
  } catch {
    return {
      save: null,
      error:
        "The saved case is damaged or from an incompatible version. Start a new investigation to replace it.",
    };
  }
}
export function getGallery(): Ending[] {
  try {
    const r = JSON.parse(localStorage.getItem("blackrook-gallery") || "[]");
    return Array.isArray(r)
      ? [
          ...new Set<Ending>(
            r.filter(
              (id: unknown) =>
                typeof id === "string" && Object.hasOwn(story.endings, id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
