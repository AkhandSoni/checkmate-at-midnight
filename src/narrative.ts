/**
 * Pure narrative engine. No DOM, rendering, timers, or randomness.
 * case.json defines the authored choices and corroboration requirements.
 */
export type CaseData = typeof import("./data/case.json");
export type EndingId = keyof CaseData["endings"];
export type CaseState = {
  version: number;
  path: number[];
  evidence: string[];
  phase: "initial" | "investigating" | "review";
};
export type Decision = {
  id: string;
  name: string;
  room: string;
  opening: string;
  prompt?: string;
  choices: { label: string; response: string; evidence: string[] }[];
};
export type TreeNode = {
  id: string;
  depth: number;
  type: string;
  parent?: string;
  left?: string;
  right?: string;
  choices?: string[];
  prompt?: string;
  speaker?: string;
  path?: string;
  evidence?: string[];
  action?: string;
  outcomeRule?: string;
};
export type BinaryTree = { root: string; nodes: TreeNode[] };

export function startCase(): CaseState {
  return { version: 1, path: [], evidence: [], phase: "initial" };
}

export function currentDecision(
  caseData: CaseData,
  state: CaseState,
): Decision | null {
  if (state.path.length === 0) {
    return {
      ...caseData.initial,
      id: "king",
      name: "Detective Knight",
      room: "study",
      opening: caseData.initial.prompt,
    };
  }
  if (state.path.length >= 6) return null;

  const route = caseData.orders[String(state.path[0]) as "0" | "1"];
  const suspectId = route[state.path.length - 1];
  return caseData.suspects.find((suspect) => suspect.id === suspectId)!;
}

/** One committed choice follows one edge and pushes a bit onto the path stack. */
export function choose(
  caseData: CaseData,
  state: CaseState,
  bit: number,
): CaseState {
  if (bit !== 0 && bit !== 1) throw new Error("Choice must be 0 or 1");
  const decision = currentDecision(caseData, state);
  if (!decision) throw new Error("All interrogations are already complete");

  const path = [...state.path, bit];
  const evidence = new Set(state.evidence);
  for (const id of decision.choices[bit].evidence) evidence.add(id);

  return {
    version: 1,
    path,
    evidence: [...evidence],
    phase: path.length === 6 ? "review" : "investigating",
  };
}

/** Exploration is independent of narrative edges. Set insertion is idempotent. */
export function inspect(
  caseData: CaseData,
  state: CaseState,
  clueId: string,
): CaseState {
  if (!caseData.clues.some((clue) => clue.id === clueId)) {
    throw new Error("Unknown physical clue");
  }
  const evidence = new Set(state.evidence);
  evidence.add(clueId);
  return { ...state, evidence: [...evidence] };
}

export function proofStatus(caseData: CaseData, state: CaseState) {
  const evidence = new Set(state.evidence);
  const rule = caseData.proofRule;
  const poison = rule.poison.every((id) => evidence.has(id));
  const motive =
    rule.motiveAll.every((id) => evidence.has(id)) &&
    rule.motiveAny.some((id) => evidence.has(id));
  const opportunity =
    rule.opportunityAny.some((id) => evidence.has(id)) ||
    rule.opportunityAll.every((id) => evidence.has(id));
  return {
    poison,
    motive,
    opportunity,
    complete: poison && motive && opportunity,
  };
}

export function resolveEnding(
  caseData: CaseData,
  state: CaseState,
  action: string,
): EndingId {
  if (state.path.length !== 6)
    throw new Error("Finish all five interrogations");
  if (!caseData.actions.includes(action))
    throw new Error("Unknown verdict action");

  const wrongAccusations: Record<string, EndingId> = {
    accuse_scarlet: "scarlet",
    accuse_ash: "ash",
    accuse_mara: "mara",
  };
  if (wrongAccusations[action]) return wrongAccusations[action];

  // Secured proof always survives the final confrontation: no fire loophole.
  if (proofStatus(caseData, state).complete) return "checkmate";
  return action === "accuse_voss" ? "voss_free" : "fire";
}

/** Rebuild from committed choices; never trust a saved phase or invented evidence. */
export function restore(caseData: CaseData, raw: unknown): CaseState {
  const saved = raw as Partial<CaseState> | null;
  if (
    !saved ||
    saved.version !== 1 ||
    !Array.isArray(saved.path) ||
    saved.path.length > 6 ||
    !saved.path.every((bit) => bit === 0 || bit === 1) ||
    !Array.isArray(saved.evidence) ||
    !saved.evidence.every(
      (id) => typeof id === "string" && Object.hasOwn(caseData.evidence, id),
    )
  ) {
    throw new Error("Invalid saved case");
  }

  let state = startCase();
  for (const bit of saved.path) state = choose(caseData, state, bit);
  const required = new Set(state.evidence);
  const physical = new Set(caseData.clues.map((clue) => clue.id));
  if (
    [...required].some((id) => !saved.evidence!.includes(id)) ||
    saved.evidence.some((id) => !required.has(id) && !physical.has(id))
  ) {
    throw new Error("Saved evidence does not match the chosen path");
  }
  return { ...state, evidence: [...new Set(saved.evidence)] };
}

/** Unfold distinct context nodes: 6 decisions deep, 2^(6+1)-1 = 127 nodes. */
export function compileInvestigationTree(caseData: CaseData): BinaryTree {
  const nodes: TreeNode[] = [];

  function visit(state: CaseState, id: string, depth: number, parent?: string) {
    const decision = currentDecision(caseData, state);
    const node: TreeNode = {
      id,
      parent,
      depth,
      path: state.path.join(""),
      type: decision ? "decision" : "case_review",
      speaker: depth === 0 ? "Knight" : decision?.name,
      evidence: state.evidence,
    };
    nodes.push(node);
    if (!decision) return;

    node.prompt = decision.prompt || decision.opening;
    node.choices = decision.choices.map((choice) => choice.label);
    node.left = id + "0";
    node.right = id + "1";
    visit(choose(caseData, state, 0), node.left, depth + 1, id);
    visit(choose(caseData, state, 1), node.right, depth + 1, id);
  }

  visit(startCase(), "root", 0);
  return { root: "root", nodes };
}

/** Each review context receives the same binary verdict structure, with unique IDs. */
export function compileFullTree(investigation: BinaryTree): BinaryTree {
  const nodes = structuredClone(investigation.nodes);
  const reviews = nodes.filter((node) => node.type === "case_review");

  for (const review of reviews) {
    const id = review.id;
    const depth = review.depth;
    review.type = "decision";
    review.prompt = "Is the case ready?";
    review.choices = ["Make an accusation", "Pursue one final lead"];
    review.left = id + "A";
    review.right = id + "L";

    nodes.push(
      {
        id: id + "A",
        parent: id,
        depth: depth + 1,
        type: "decision",
        choices: ["Family", "Household"],
        left: id + "F",
        right: id + "H",
      },
      {
        id: id + "L",
        parent: id,
        depth: depth + 1,
        type: "ending",
        action: "final_lead",
        outcomeRule: "checkmate if proof complete, else fire",
      },
      {
        id: id + "F",
        parent: id + "A",
        depth: depth + 2,
        type: "decision",
        choices: ["Scarlet", "Ash"],
        left: id + "S",
        right: id + "P",
      },
      {
        id: id + "H",
        parent: id + "A",
        depth: depth + 2,
        type: "decision",
        choices: ["Mara", "Voss"],
        left: id + "M",
        right: id + "V",
      },
    );

    const accusations = [
      ["S", "accuse_scarlet", "F"],
      ["P", "accuse_ash", "F"],
      ["M", "accuse_mara", "H"],
      ["V", "accuse_voss", "H"],
    ];
    for (const [suffix, action, parent] of accusations) {
      nodes.push({
        id: id + suffix,
        parent: id + parent,
        depth: depth + 3,
        type: "ending",
        action,
        outcomeRule:
          action === "accuse_voss"
            ? "checkmate if proof complete, else voss_free"
            : action.slice(7),
      });
    }
  }
  return { root: investigation.root, nodes };
}

/** Parent links give O(h) path reconstruction without repeated prefix copying. */
export function reconstructPath(
  byId: ReadonlyMap<string, TreeNode>,
  nodeId: string,
): string[] {
  const path: string[] = [];
  let node = byId.get(nodeId);
  if (!node) throw new Error("Unknown tree node");
  while (node) {
    path.push(node.id);
    node = node.parent ? byId.get(node.parent) : undefined;
  }
  return path.reverse();
}
