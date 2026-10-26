import type { TreeNode } from "../engine";

/** Human names on the drawing; stable technical IDs remain in the inspector. */
export function nodeLabel(node: TreeNode): {
  title: string;
  icon: string;
  subtitle: string;
} {
  if (node.id === "root")
    return {
      title: "The crime scene",
      icon: "♞",
      subtitle: "Wound or goblet?",
    };
  const people: Record<string, [string, string, string]> = {
    "Lady Scarlet": ["Lady Scarlet", "♛", "Drawing Room"],
    "Prince Ash": ["Prince Ash", "♟", "Dining Room"],
    Mara: ["Mara", "♙", "Servants’ Room"],
    "Captain Flint": ["Captain Flint", "♜", "Entrance Hall"],
    "Chancellor Voss": ["Chancellor Voss", "♝", "Library"],
  };
  if (node.speaker && people[node.speaker]) {
    const [title, icon, subtitle] = people[node.speaker];
    return { title, icon, subtitle };
  }
  if (node.type === "case_review" || node.prompt === "Is the case ready?") {
    return { title: "Case review", icon: "♔", subtitle: "Weigh the evidence" };
  }
  const actionLabels: Record<
    string,
    { title: string; icon: string; subtitle: string }
  > = {
    accuse_scarlet: {
      title: "Scarlet verdict",
      icon: "♛",
      subtitle: "Committed accusation",
    },
    accuse_ash: {
      title: "Ash verdict",
      icon: "♟",
      subtitle: "Committed accusation",
    },
    accuse_mara: {
      title: "Mara verdict",
      icon: "♙",
      subtitle: "Committed accusation",
    },
    accuse_voss: {
      title: "Voss verdict",
      icon: "♝",
      subtitle: "Proof decides the outcome",
    },
    final_lead: {
      title: "Final lead",
      icon: "♞",
      subtitle: "Proof decides the outcome",
    },
  };
  if (node.action) return actionLabels[node.action];
  if (node.choices?.[0] === "Family")
    return {
      title: "The accusation",
      icon: "♚",
      subtitle: "Family or household?",
    };
  if (node.choices?.[0] === "Scarlet")
    return { title: "The family", icon: "♛", subtitle: "Scarlet or Ash?" };
  if (node.choices?.[0] === "Mara")
    return { title: "The household", icon: "♜", subtitle: "Mara or Voss?" };
  return {
    title: "Case review",
    icon: "♔",
    subtitle: "Evidence and testimony",
  };
}
