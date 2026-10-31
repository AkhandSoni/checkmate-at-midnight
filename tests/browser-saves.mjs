/** Serialized by Playwright and executed in the application's browser context. */
export async function checkSaves() {
  const e = await import("/src/engine.ts");
  const original = localStorage.getItem("blackrook-case");
  const gallery = localStorage.getItem("blackrook-gallery");
  const results = { legacyCases: 0, reopened: 0, valid: true };
  try {
    localStorage.setItem("blackrook-case", "{broken");
    results.corrupt = e.loadSave().save === null;
    localStorage.setItem(
      "blackrook-gallery",
      JSON.stringify(["constructor", "checkmate", "checkmate", "fire"]),
    );
    results.gallery = e.getGallery();
    const wrong = {
      accuse_scarlet: "scarlet",
      accuse_ash: "ash",
      accuse_mara: "mara",
    };
    for (let route = 0; route < 64; route++) {
      const path = route.toString(2).padStart(6, "0").split("").map(Number);
      const state = path.reduce(
        (s, bit) => e.choose(e.story, s, bit),
        e.startCase(),
      );
      for (const clues of [
        [],
        ["poison_flask"],
        e.story.clues.map((c) => c.id),
      ]) {
        const found = clues.reduce((s, id) => e.inspect(e.story, s, id), state);
        const facts = new Set(found.evidence);
        const oldProof =
          facts.has("poison_flask") &&
          e.story.proofRule.motiveAny.some((id) => facts.has(id)) &&
          e.story.proofRule.opportunityAny.some((id) => facts.has(id));
        for (const action of e.story.actions) {
          const ending =
            wrong[action] ||
            (oldProof
              ? "checkmate"
              : action === "accuse_voss"
                ? "voss_free"
                : "fire");
          const current = e.resolveEnding(e.story, found, action);
          const oldSave = {
            version: 2,
            state: found,
            position: [3, 2],
            stage: "ending",
            action,
            ending,
            demo: false,
            savedAt: Date.now(),
          };
          localStorage.setItem("blackrook-case", JSON.stringify(oldSave));
          const loaded = e.loadSave();
          const expectedStage = ending === current ? "ending" : "world";
          results.valid &&=
            loaded.save?.stage === expectedStage &&
            loaded.save.state.path.join("") === path.join("") &&
            loaded.save.state.evidence.length === found.evidence.length;
          if (ending !== current) {
            results.reopened++;
            results.valid &&=
              !!loaded.error &&
              loaded.save?.action === undefined &&
              loaded.save?.ending === undefined;
          }
          const newSave = { ...oldSave, proofRevision: 2, ending: current };
          localStorage.setItem("blackrook-case", JSON.stringify(newSave));
          results.valid &&= e.loadSave().save?.ending === current;
          localStorage.setItem(
            "blackrook-case",
            JSON.stringify({
              ...newSave,
              ending: current === "fire" ? "checkmate" : "fire",
            }),
          );
          results.valid &&= e.loadSave().save === null;
          results.legacyCases++;
        }
      }
    }
    results.migration = results.valid && results.reopened > 0;
    results.forged = results.valid;
    return results;
  } finally {
    if (original === null) localStorage.removeItem("blackrook-case");
    else localStorage.setItem("blackrook-case", original);
    if (gallery === null) localStorage.removeItem("blackrook-gallery");
    else localStorage.setItem("blackrook-gallery", gallery);
  }
}
