import "./style.css";
import "./ui/chess-theme.css";
import "./ui/mobile.css";
import { assetUrl } from "./assets";
import { World, type Target } from "./world";
import { Sound } from "./audio";
import { famousPosition } from "./chess-position";
import { drawChessPosition } from "./ui/chessboard";
import { drawFloorPlan } from "./ui/floor-plan";
import { ModelStage, characterModels } from "./ui/model-stage";
import { navigateMenu } from "./ui/keyboard";
import { TouchControls } from "./ui/touch-controls";
import { PhoneDisplay } from "./ui/phone-display";
import { roomRoute } from "./navigation";
import { evidenceIcon } from "./ui/icons";
import { TreeView } from "./ui/tree";
import { el, text, eye, button, type Child } from "./ui/dom";
import {
  story,
  layout,
  trees,
  startCase,
  choose,
  currentDecision,
  inspect,
  proof,
  resolveEnding,
  getSettings,
  loadSave,
  getGallery,
  history,
  selectedNodes,
  evidenceName,
  type State,
  type Settings,
  type Save,
  type Ending,
  type EvidenceId,
  type Tree,
  type TreeNode,
} from "./engine";

const ui = document.querySelector<HTMLElement>("#ui")!,
  hud = document.querySelector<HTMLElement>("#hud")!,
  prompt = document.querySelector<HTMLElement>("#prompt")!,
  toast = document.querySelector<HTMLElement>("#toast")!;
let toastTimer = 0;
function notify(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3500);
}
const roomName = (id: string) =>
  layout.rooms.find((r) => r.id === id)?.name || id;
const symbols: Record<Ending, string> = {
  scarlet: "♛",
  ash: "♟",
  mara: "♙",
  voss_free: "♝",
  fire: "♜",
  checkmate: "♞",
};

class Game {
  readonly world: World;
  readonly sound: Sound;
  private readonly modelStage: ModelStage;
  private readonly touch: TouchControls;
  private readonly phone: PhoneDisplay;
  private phoneBlocked = false;
  private viewerIndex = 0;
  private boardFrame = 0;
  private boardFlipped = false;
  private viewerBack: () => void = () => {};
  settings = getSettings();
  state: State = startCase();
  stage: Save["stage"] = "world";
  action: string | undefined;
  ending: Ending | undefined;
  demo = false;
  pendingResponse = false;
  view = "loading";
  onEscape: () => void = () => {};
  private choices: HTMLButtonElement[] = [];
  private speechBubble: HTMLElement | null = null;
  private speechActor: string | null = null;
  private navigation = "";
  private lastChoiceAt = 0;
  private arrivalIndex = 0;
  private treeUI: TreeView;
  private caseActive = false;
  constructor() {
    this.world = new World(document.querySelector("#world")!, this.settings);
    this.sound = new Sound(this.settings);
    this.touch = new TouchControls(
      (right, down) => this.world.touchMove.set(right, down),
      () => {
        if (this.view === "world") this.interact();
      },
      () => {
        if (this.view === "world") this.pause();
      },
    );
    this.phone = new PhoneDisplay((blocked) => {
      this.phoneBlocked = blocked;
      this.syncPhoneDisplay();
    });
    this.modelStage = new ModelStage((name) =>
      this.world.cloneModelAsset(name),
    );
    this.treeUI = new TreeView(
      (panel, close) => this.modal(panel, "tree", close),
      () => this.view === "tree",
    );
    document.body.classList.toggle(
      "reduced-motion",
      this.settings.reducedMotion,
    );
    this.world.onRoom = (id) => {
      if (this.stage === "world" && this.view === "world") {
        if (this.navigation === id) {
          this.navigation = "";
          notify("Destination reached: " + roomName(id));
        }
        this.save();
        this.sound.play("door_creak", 0.11);
        this.sound.room(id);
        this.hud();
      }
    };
    this.world.onMove = () => this.sound.play("stone_slide", 0.065);
    this.world.onNear = () => this.updatePrompt();
    document.addEventListener("keydown", (e) => this.key(e));
    document.addEventListener("keyup", (e) =>
      this.world.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => {
      this.world.clearKeys();
      this.sound.suspend();
      if (this.view === "world") this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.world.clearKeys();
        this.sound.suspend();
        if (this.view === "world") this.pause();
      }
    });
    document.addEventListener("pointerdown", () => void this.sound.start());
    window.addEventListener("pagehide", () => {
      if (this.view !== "title" && this.view !== "loading") this.save();
    });
    setInterval(() => {
      if (this.view === "world" && this.world.room === "entrance")
        this.sound.play("clock_tick", 0.09);
    }, 1800);
  }
  async init() {
    const p = el("progress");
    p.max = 1;
    p.value = 0;
    p.setAttribute("aria-label", "Loading mansion assets");
    this.modal(
      el(
        "div",
        "loading",
        eye("Blackrook Manor · A case in six rooms"),
        el("h2", "", "Checkmate at Midnight"),
        p,
        text("Preparing the house…", "muted"),
      ),
      "loading",
    );
    try {
      await this.world.load(false, (n) => (p.value = n));
      this.title();
      requestAnimationFrame((t) => this.frame(t));
    } catch (e) {
      ui.replaceChildren(
        el(
          "div",
          "loading",
          el("h2", "", "The house could not be opened"),
          text(
            "A game asset could not be loaded. Check your connection and reload.",
          ),
          text(String(e), "error"),
          button("Reload", () => location.reload()),
        ),
      );
      console.error(e);
    }
  }
  private frame(t: number) {
    this.world.update(t);
    this.modelStage.render(this.settings.reducedMotion);
    this.updatePrompt();
    this.touch.update(this.world.nearest);
    this.updateSpeechTail();
    requestAnimationFrame((n) => this.frame(n));
  }
  private syncPhoneDisplay() {
    this.world.modal = this.phoneBlocked || this.view !== "world";
    ui.inert = this.phoneBlocked;
    hud.inert = this.phoneBlocked || this.view !== "world";
    this.world.clearKeys();
    this.touch.setActive(!this.phoneBlocked && this.view === "world");
  }
  private modal(
    node: HTMLElement,
    view: string,
    escape: () => void = () => {},
  ) {
    this.treeUI?.stop();
    this.modelStage?.hide();
    this.speechBubble = null;
    this.speechActor = null;
    this.world.modal = true;
    this.touch.setActive(false);
    hud.inert = true;
    this.world.clearKeys();
    this.view = view;
    document.body.dataset.gameView = view;
    this.syncPhoneDisplay();
    this.phone.refresh();
    if (["model-viewer", "chessboard", "notebook", "tree"].includes(view))
      toast.classList.remove("show");
    this.onEscape = escape;
    this.choices = [];
    ui.replaceChildren(node);
    prompt.style.display = "none";
    this.sound.duck(view === "dialogue");
    queueMicrotask(() => {
      const focus = [
        ...ui.querySelectorAll<HTMLElement>(
          "button:not(:disabled):not(.dialogue-back):not(.phone-only),input,select",
        ),
      ].find((control) => control.getClientRects().length > 0);
      focus?.focus({ preventScroll: true });
    });
  }
  private panel(
    title: string,
    subtitle: string,
    children: Child[],
    close: () => void,
    paper = false,
    wide = false,
  ) {
    const p = el(
      "section",
      "panel" + (paper ? " paper" : "") + (wide ? " wide" : ""),
    );
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "true");
    p.setAttribute("aria-label", title);
    const c = button("×", close, "close");
    c.setAttribute("aria-label", "Close " + title);
    p.append(
      el(
        "header",
        "panel-head",
        el("div", "", eye(subtitle), el("h2", "", title)),
        c,
      ),
      ...children.filter((x): x is Node | string => x != null),
    );
    return el("div", "scrim", p);
  }
  private save() {
    if (!this.world.ready || !this.caseActive) return;
    const payload: Save & { pendingResponse: boolean } = {
      version: 2,
      proofRevision: 2,
      state: this.state,
      position: [this.world.position.x, this.world.position.z],
      stage: this.stage,
      action: this.action,
      ending: this.ending,
      demo: this.demo,
      savedAt: Date.now(),
      pendingResponse: this.pendingResponse,
      navigation: this.navigation,
      arrivalIndex: this.stage === "arrival" ? this.arrivalIndex : undefined,
    };
    try {
      localStorage.setItem("blackrook-case", JSON.stringify(payload));
    } catch {
      notify(
        "Your browser could not store the case. Keep this tab open to continue.",
      );
    }
  }
  private applySettings() {
    try {
      localStorage.setItem("blackrook-settings", JSON.stringify(this.settings));
    } catch {}
    this.sound.update(this.settings);
    this.world.setSettings(this.settings);
    document.body.classList.toggle(
      "reduced-motion",
      this.settings.reducedMotion,
    );
    this.hud();
  }
  private title() {
    this.caseActive = false;
    this.world.resetCast();
    this.world.focusRoom("study");
    this.world.player.visible = false;
    hud.replaceChildren();
    const saved = loadSave();
    const nav = el("nav", "title-nav");
    nav.setAttribute("aria-label", "Main menu");
    nav.append(button("New investigation  →", () => this.newCase(), "primary"));
    const cont = button("Continue case  →", () => this.continueCase());
    cont.disabled = !saved.save;
    nav.append(
      cont,
      button("The six verdicts", () => this.gallery()),
      button("DSA presentation", () => this.presentation(() => this.title())),
      button("Settings", () => this.showSettings(() => this.title())),
    );
    const inner = el(
      "div",
      "title-inner",
      el("div", "title-emblem", "♞"),
      eye("An investigation at Blackrook Manor"),
      el("h1", "", "Checkmate", el("span", "", "AT MIDNIGHT")),
      text(
        "Every move has a motive.\nEvery question changes the board.",
        "tagline",
      ),
      el("div", "rule"),
      nav,
    );
    if (saved.error) inner.append(text(saved.error, "error"));
    this.modal(
      el(
        "section",
        "title-screen",
        inner,
        el(
          "div",
          "title-foot",
          "A binary-tree mystery · Touch or keyboard · Local saves",
        ),
        el(
          "div",
          "title-caption",
          el("small", "", "THE KING’S STUDY"),
          "One house. Five secrets. One truth.",
        ),
      ),
      "title",
    );
  }
  private newCase() {
    this.caseActive = true;
    this.state = startCase();
    this.stage = "letter";
    this.action = undefined;
    this.ending = undefined;
    this.demo = false;
    this.pendingResponse = false;
    this.navigation = "";
    this.arrivalIndex = 0;
    this.world.resetCast();
    this.world.teleport(...(layout.spawn as [number, number]));
    this.save();
    this.letter();
  }
  private continueCase() {
    const { save, error } = loadSave();
    if (!save) {
      notify(error || "No saved case.");
      return;
    }
    this.caseActive = true;
    this.state = save.state;
    this.stage = save.stage;
    this.action = save.action;
    this.ending = save.ending;
    this.demo = save.demo;
    this.navigation = save.navigation || "";
    this.pendingResponse = !!(save as Save & { pendingResponse?: boolean })
      .pendingResponse;
    this.world.resetCast();
    this.world.teleport(...save.position);
    if (this.stage === "letter") this.letter();
    else if (this.stage === "arrival") this.arrival(save.arrivalIndex || 0);
    else if (this.stage === "ending") this.showEnding(this.ending!);
    else if (this.pendingResponse && this.state.path.length)
      this.responseFromHistory();
    else this.explore();
  }
  private letter() {
    this.stage = "letter";
    this.world.focusRoom("entrance");
    const seal = el("img");
    seal.src = assetUrl("ui/wax_seal.svg");
    seal.alt = "Lady Scarlet’s burgundy wax seal";
    const p = el(
      "article",
      "panel paper letter",
      el(
        "header",
        "letter-top",
        el(
          "div",
          "",
          eye("Delivered before midnight"),
          el("h2", "", "A request for your presence"),
        ),
        seal,
      ),
      el("div", "letter-body", story.letter),
      el("p", "letter-footer", "Blackrook Manor · The gates close at midnight"),
      el(
        "div",
        "actions",
        button("Return to title", () => this.title(), "phone-only"),
        button(
          "Accept the request  →",
          () => {
            this.sound.play("page_turn", 0.4);
            this.stage = "arrival";
            this.save();
            this.arrival(0);
          },
          "primary",
        ),
      ),
    );
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Lady Scarlet’s letter");
    this.modal(el("div", "scrim", p), "letter", () => this.title());
  }
  private arrival(index: number) {
    this.stage = "arrival";
    this.arrivalIndex = index;
    this.save();
    this.world.player.visible = true;
    this.world.actors.get("scarlet")?.position.set(4.8, 0, 3.5);
    this.world.followPlayer();
    this.hud();
    const a = story.arrival[index];
    this.speech(
      a.speaker,
      a.text,
      [
        {
          label:
            index === story.arrival.length - 1
              ? "Enter the investigation"
              : "Continue",
          fn: () => {
            if (index < story.arrival.length - 1) this.arrival(index + 1);
            else {
              this.stage = "world";
              this.world.resetCast();
              this.save();
              this.explore();
              notify("The gates are locked. Begin in the King’s Study.");
            }
          },
        },
      ],
      () => this.pause(() => this.arrival(index)),
      false,
    );
  }
  private explore() {
    if (this.world.endingId) this.world.resetCast();
    this.modelStage.hide();
    this.treeUI.stop();
    this.speechBubble = null;
    this.speechActor = null;
    this.stage = "world";
    this.view = "world";
    document.body.dataset.gameView = "world";
    this.world.modal = false;
    hud.inert = false;
    this.world.player.visible = true;
    this.world.clearKeys();
    this.world.followPlayer();
    this.syncPhoneDisplay();
    this.phone.refresh();
    this.onEscape = () => this.pause();
    this.choices = [];
    ui.replaceChildren();
    this.sound.duck(false);
    this.sound.resume();
    this.sound.room(this.world.room);
    this.hud();
    this.save();
  }
  private hud() {
    if (
      !this.caseActive ||
      this.stage === "ending" ||
      ["title", "loading", "letter"].includes(this.view)
    ) {
      hud.replaceChildren();
      return;
    }
    const d = currentDecision(story, this.state);
    let objective =
      this.state.path.length === 0
        ? "Examine the fallen King"
        : d
          ? "Question " + d.name
          : "Review the case";
    const room = this.state.path.length === 0 ? "study" : d?.room;
    let hint =
      this.state.path.length === 0
        ? matchMedia("(pointer: coarse), (max-width: 700px)").matches
          ? "Approach the fallen King and tap Investigate."
          : "Find the fallen King in the Study and press E."
        : d
          ? "Find your next lead in " + roomName(room || "study") + "."
          : "All five statements are recorded. Keep searching or open case review.";
    const destination = this.navigation || room;
    if (destination && destination !== this.world.room) {
      const route = roomRoute(layout, this.world.room, destination);
      hint = "Route: " + route.map(roomName).join(" → ");
    }
    const tools = el(
      "nav",
      "hud-tools",
      button(
        matchMedia("(pointer: coarse), (max-width: 700px)").matches
          ? "Notebook"
          : "Notebook [J]",
        () => this.notebook(),
        "small",
      ),
      button(
        matchMedia("(pointer: coarse), (max-width: 700px)").matches
          ? "Map"
          : "Floor plan",
        () => this.notebook("map"),
        "small",
      ),
      button("Pause", () => this.pause(), "small"),
    );
    tools.setAttribute("aria-label", "Case controls");
    if (this.state.path.length === 6)
      tools.prepend(button("Case review", () => this.review(), "small"));
    const bits = this.state.path.length
      ? this.state.path.map((b) => (b ? "R" : "L")).join(" · ")
      : "No committed choices";
    const objectiveEl = el(
      "div",
      "objective",
      eye(
        (this.demo ? "Demonstration case · " : "Current lead · ") +
          Math.max(0, this.state.path.length - 1) +
          "/5 statements",
      ),
      el("strong", "", objective),
      el("span", "", hint),
      el(
        "div",
        "case-bits",
        "Node root" + this.state.path.join("") + "   " + bits,
      ),
    );
    hud.replaceChildren(
      el(
        "div",
        "hud-top",
        el(
          "div",
          "location",
          eye("Blackrook Manor"),
          el("h2", "", roomName(this.world.room)),
        ),
        el("div", "spacer"),
        tools,
        el(
          "div",
          "hud-clock",
          "12:00",
          el("small", "", "THE GATES ARE LOCKED"),
        ),
      ),
      objectiveEl,
      el(
        "div",
        "controls",
        el("div", "", el("kbd", "", "W A S D"), " / arrows  Move"),
        el(
          "div",
          "",
          el("kbd", "", "E"),
          " Investigate   ",
          el("kbd", "", "1 / 2"),
          " Choose",
        ),
        el(
          "div",
          "",
          el("kbd", "", "J"),
          " Notebook   ",
          el("kbd", "", "Esc"),
          " Pause   ",
          el("kbd", "", "F"),
          " Fullscreen",
        ),
      ),
    );
  }
  private updatePrompt() {
    if (this.view !== "world" || !this.world.nearest) {
      prompt.style.display = "none";
      return;
    }
    const n = this.world.nearest;
    const p = this.world.screenPosition(n.x, n.y + 0.35, n.z);
    if (
      p.x < 50 ||
      p.x > innerWidth - 50 ||
      p.y < 100 ||
      p.y > innerHeight - 80
    ) {
      prompt.style.display = "none";
      return;
    }
    const current = currentDecision(story, this.state);
    let label = n.label;
    if (n.kind === "clue" && this.state.evidence.includes(n.id))
      label += " · recorded";
    if (n.kind === "suspect" && current?.id === n.id)
      label += " · current lead";
    prompt.replaceChildren(el("kbd", "", "E"), document.createTextNode(label));
    prompt.style.display = "block";
    prompt.style.left = p.x + "px";
    prompt.style.top = p.y + "px";
  }
  /** Follow the actual speaker while the camera settles or the viewport resizes. */
  private updateSpeechTail() {
    if (!this.speechBubble || !this.speechActor || this.view !== "dialogue")
      return;
    const actor =
      this.speechActor === "knight"
        ? this.world.player
        : this.world.actors.get(this.speechActor);
    if (!actor) return;
    const point = this.world.screenPosition(
      actor.position.x,
      1.5,
      actor.position.z,
    );
    const width = Math.min(1100, innerWidth - (innerWidth <= 900 ? 30 : 70));
    const left = (innerWidth - width) / 2;
    this.speechBubble.style.setProperty(
      "--tail",
      Math.max(8, Math.min(92, ((point.x - left) / width) * 100)) + "%",
    );
  }

  private speech(
    speaker: string,
    copy: string,
    options: { label: string; fn: () => void }[],
    escape: () => void,
    binary = true,
    meta = "",
  ) {
    const controls = el("div", binary ? "choices" : "actions");
    const dialogue = el(
      "section",
      "dialogue",
      el(
        "div",
        "speaker",
        el("span", "", speaker),
        button("Back", escape, "dialogue-back"),
      ),
      text(copy),
      controls,
    );
    dialogue.setAttribute("role", "dialog");
    dialogue.setAttribute("aria-label", speaker);
    dialogue.setAttribute("aria-modal", "true");
    const suspect = story.suspects.find(
      (s) => s.name === speaker || s.id === speaker.toLowerCase(),
    );
    const actorId = suspect?.id || "knight";
    const portrait = el("div", "comic-model");
    portrait.setAttribute("aria-hidden", "true");
    const comic = el(
      "aside",
      "comic-portrait",
      portrait,
      el("div", "comic-name", speaker),
    );
    this.modal(
      el("div", "dialogue-wrap with-portrait", comic, dialogue),
      "dialogue",
      escape,
    );
    if (!matchMedia("(max-width: 700px), (pointer: coarse)").matches)
      this.modelStage.show("CHR_" + actorId, portrait, "portrait");
    this.speechBubble = dialogue;
    this.speechActor =
      suspect?.id || (speaker.includes("Knight") ? "knight" : null);
    this.updateSpeechTail();
    this.choices = options.map((o, i) => {
      const b = button("", o.fn, binary ? "" : "continue");
      if (binary) b.append(el("kbd", "", String(i + 1)));
      b.append(document.createTextNode(o.label));
      controls.append(b);
      return b;
    });
    if (meta) dialogue.append(el("div", "meta", meta));
    this.sound.duck(true);
  }
  private interact() {
    const t = this.world.nearestTarget();
    if (!t) {
      notify("Move closer to a person or object, then press E.");
      return;
    }
    this.world.clearKeys();
    if (t.kind === "body") {
      if (this.state.path.length === 0) this.ask();
      else
        this.speech(
          "Detective Knight",
          "The King lies beside his desk. A fallen goblet, a letter opener and a scrap of red cloth surround the unfinished game.",
          [{ label: "Return to the room", fn: () => this.explore() }],
          () => this.explore(),
          false,
        );
      return;
    }
    if (t.kind === "suspect") {
      const d = currentDecision(story, this.state);
      if (d?.id === t.id) this.ask();
      else {
        const already = history(this.state).find((h) => h.speaker === t.label);
        this.speech(
          t.label,
          already ? already.response : "Let us finish your current lead first.",
          [{ label: "Return to the room", fn: () => this.explore() }],
          () => this.explore(),
          false,
          already
            ? "This statement is already in your notebook. No additional narrative choice."
            : "",
        );
      }
      return;
    }
    if (t.kind === "clue") {
      const clue = story.clues.find((c) => c.id === t.id)!;
      const isNew = !this.state.evidence.includes(t.id);
      this.state = inspect(story, this.state, t.id);
      this.save();
      this.sound.play(isNew ? "evidence_found" : "page_turn", 0.3);
      this.speech(
        "Detective Knight",
        clue.text,
        [
          {
            label: isNew ? "Record in notebook" : "Return to the room",
            fn: () => this.explore(),
          },
        ],
        () => this.explore(),
        false,
        `${isNew ? "Evidence recorded" : "Already recorded"} · ${evidenceName(t.id)} · Set size ${new Set(this.state.evidence).size}`,
      );
      return;
    }
    if (t.id === "chessboard") {
      this.boardFrame = 0;
      this.boardFlipped = false;
      this.showChessboard();
      return;
    }
    const descriptions: Record<string, string> = {
      clock:
        "The hands meet at midnight. The clock will outlast this house’s secrets.",
      mule: "A long-eared mule looks down on crossed blades. Apparently the King admired stubbornness in everyone but his family.",
      gates:
        "Flint has locked the gates. Nobody leaves until the household has been questioned.",
      chessboard: "An unfinished game. The King never reached his next move.",
      screen:
        "The folding screen leaves a narrow hiding place behind the desk. The window beside it is shut.",
      shawl:
        "Burgundy fabric hangs over a dining chair moved here after dinner. Look closely at the damaged rail.",
      medicine:
        "Ordinary medicine is stored separately from the concentrated sleeping draught. The register records each dose.",
    };
    this.speech(
      "Detective Knight",
      descriptions[t.id] || "The room holds its silence.",
      [{ label: "Return to the room", fn: () => this.explore() }],
      () => this.explore(),
      false,
    );
  }
  private showChessboard() {
    const frame = famousPosition.frames[this.boardFrame];
    const previous = button("← Previous position", () => {
      this.boardFrame = Math.max(0, this.boardFrame - 1);
      this.showChessboard();
    });
    previous.disabled = this.boardFrame === 0;
    const next = button(
      "Next position →",
      () => {
        this.boardFrame = Math.min(
          famousPosition.frames.length - 1,
          this.boardFrame + 1,
        );
        this.showChessboard();
      },
      "primary",
    );
    next.disabled = this.boardFrame === famousPosition.frames.length - 1;
    const board = el(
      "div",
      "position-diagram",
      drawChessPosition(this.boardFrame, this.boardFlipped),
    );
    const notes = el(
      "div",
      "position-notes",
      eye("A famous position"),
      el("h3", "", famousPosition.title),
      text(famousPosition.event, "position-event"),
      el("h3", "", frame.title),
      text(frame.move, "position-move"),
      text(frame.explanation),
      text(
        "An unfinished game. The King never reached his next move.",
        "position-quote",
      ),
      text(
        "Study the position freely. Your investigation is paused.",
        "setting-note",
      ),
    );
    const panel = this.panel(
      "The unfinished game",
      "King’s Study · A chess interlude",
      [
        el("div", "position-layout", board, notes),
        el(
          "div",
          "actions",
          previous,
          button("Flip board", () => {
            this.boardFlipped = !this.boardFlipped;
            this.showChessboard();
          }),
          next,
          button("Return to the room", () => this.explore()),
        ),
      ],
      () => this.explore(),
      true,
      true,
    );
    this.modal(panel, "chessboard", () => this.explore());
  }

  private ask() {
    const length = this.state.path.length;
    const d = currentDecision(story, this.state);
    if (!d) return;
    const initial = length === 0;
    this.speech(
      initial ? "Detective Knight" : d.name,
      initial
        ? "The King is dead. The letter opener, a fallen goblet and a scrap of red cloth lie beside the unfinished chessboard. " +
            d.prompt
        : d.opening,
      d.choices.map((c: { label: string }, bit: number) => ({
        label: c.label,
        fn: () => {
          if (
            this.state.path.length !== length ||
            this.view !== "dialogue" ||
            performance.now() - this.lastChoiceAt < 200
          )
            return;
          this.lastChoiceAt = performance.now();
          this.state = choose(story, this.state, bit);
          this.pendingResponse = true;
          this.save();
          this.sound.play("choice_confirm", 0.28);
          notify(
            (bit ? "Right" : "Left") +
              " child selected · root" +
              this.state.path.join(""),
          );
          this.responseFromHistory();
        },
      })),
      () => this.explore(),
      true,
      "One question. Two branches. Your statement will be recorded.",
    );
  }
  private responseFromHistory() {
    const h = history(this.state).at(-1)!;
    this.speech(
      h.speaker,
      h.response,
      [
        {
          label: "Continue investigation",
          fn: () => {
            this.pendingResponse = false;
            this.save();
            this.explore();
            if (this.state.path.length === 6) this.review();
          },
        },
      ],
      () => {
        this.pendingResponse = false;
        this.explore();
      },
      false,
      "Recorded: " + h.evidence.map(evidenceName).join(" · "),
    );
  }
  private proofRows() {
    const p = proof(this.state);
    const facts = [
      [
        "poison",
        "Poison",
        "Compare the flask, goblet residue and medicine register.",
      ],
      [
        "motive",
        "Financial motive",
        "Corroborate the study ledger with account fragments or testimony.",
      ],
      [
        "opportunity",
        "Opportunity",
        "Witness testimony, or matching study-delivery and duty-book records.",
      ],
    ] as const;
    const list = el("div", "proof-list");
    for (const [k, title, description] of facts)
      list.append(
        el(
          "div",
          "proof-row",
          el("span", "check", p[k] ? "✓" : "○"),
          el(
            "div",
            "",
            el(
              "b",
              "",
              title + " · " + (p[k] ? "established" : "not established"),
            ),
            text(description),
            ...(p[k]
              ? [
                  el(
                    "small",
                    "",
                    this.state.evidence
                      .filter((id) =>
                        k === "poison"
                          ? story.proofRule.poison.includes(id)
                          : k === "motive"
                            ? [
                                ...story.proofRule.motiveAll,
                                ...story.proofRule.motiveAny,
                              ].includes(id)
                            : [
                                ...story.proofRule.opportunityAny,
                                ...story.proofRule.opportunityAll,
                              ].includes(id),
                      )
                      .map(evidenceName)
                      .join(" / "),
                  ),
                ]
              : []),
          ),
        ),
      );
    return list;
  }
  private notebook(tab = "physical") {
    this.sound.play("page_turn", 0.25);
    const content = el("div", "entries");
    const nav = el("nav", "tabs");
    for (const [id, title] of [
      ["physical", "Evidence"],
      ["testimony", "Statements"],
      ["deductions", "Deductions"],
      ["map", "Floor plan"],
    ]) {
      const bookmark = button(
        title,
        () => this.notebook(id),
        id === tab ? "active" : "",
      );
      if (id === tab) bookmark.setAttribute("aria-current", "page");
      nav.append(bookmark);
    }
    if (tab === "testimony") {
      const statements = history(this.state).slice(1);
      if (!statements.length)
        content.append(
          text(
            "No statements recorded. Follow your current lead and choose one question.",
            "empty",
          ),
        );
      for (const statement of statements)
        content.append(
          el(
            "article",
            "entry",
            el("small", "", statement.speaker),
            el("h3", "", statement.label),
            text(statement.response),
            el(
              "small",
              "",
              "Recorded: " + statement.evidence.map(evidenceName).join(" · "),
            ),
          ),
        );
    }
    if (tab === "physical") {
      const ids = this.state.evidence.filter(
        (id) => story.evidence[id as EvidenceId].category === "physical",
      );
      if (!ids.length)
        content.append(
          text(
            "No physical clues recorded. Approach an object and press E to inspect it.",
            "empty",
          ),
        );
      for (const id of ids) {
        const e = story.evidence[id as EvidenceId];
        const source =
          id === "weapon_origin" && this.state.path[0] !== 0
            ? "Prince Ash · describes the letter opener"
            : roomName(e.source);
        content.append(
          el(
            "article",
            "entry",
            el("small", "", source),
            el("h3", "", evidenceIcon(id), e.title),
            text(e.text),
          ),
        );
      }
    }
    if (tab === "deductions") {
      content.append(
        eye("What the evidence establishes"),
        this.proofRows(),
        text(
          "Motive alone is insufficient. Compare the drink, the draught and its dosage record. Corroborate the accounts with the study ledger. Witnesses or matching delivery records can establish opportunity; you can keep searching after every statement is recorded.",
          "review-note",
        ),
        text(
          "Four developed accusations. Flint’s absence alone does not support a murder charge.",
          "review-note",
        ),
      );
      if (this.state.path.length === 6)
        content.append(
          button("Open case review", () => this.review(), "primary"),
        );
    }
    if (tab === "map") {
      content.classList.add("floor-plan-entries");
      const map = drawFloorPlan({
        image: this.world.captureFloorPlan(),
        currentRoom: this.world.room,
        destination:
          this.navigation || currentDecision(story, this.state)?.room || "",
        position: this.world.position,
        onChooseRoom: (id, name) => {
          this.navigation = id === this.world.room ? "" : id;
          this.explore();
          notify(
            id === this.world.room
              ? "You are already in " + name
              : "Destination marked: " + name,
          );
        },
      });
      content.append(
        text("North ↑ · Select a room to mark a destination.", "map-caption"),
        map,
        text(
          roomRoute(
            layout,
            this.world.room,
            this.navigation ||
              currentDecision(story, this.state)?.room ||
              this.world.room,
          )
            .map(roomName)
            .join(" → "),
          "map-caption",
        ),
        el(
          "p",
          "map-caption map-legend",
          el("span", "map-legend-dot", "●"),
          " Your position · Dashed outline: destination",
        ),
      );
    }
    // The notebook has its own two-page binding. Algorithm panels keep the
    // standard presentation layout and never inherit these book styles.
    nav.setAttribute("aria-label", "Notebook bookmarks");
    nav.classList.add("bookmark-rail");
    const headings: Record<string, string> = {
      physical: "Collected evidence",
      testimony: "Witness statements",
      deductions: "Deductions",
      map: "The mansion",
    };
    const statements = Math.max(0, this.state.path.length - 1);
    const clueCount = this.state.evidence.filter(
      (id) => story.evidence[id as EvidenceId].category !== "testimony",
    ).length;
    const decision = currentDecision(story, this.state);
    const leftPage = el(
      "section",
      "notebook-page notebook-frontispiece",
      eye("Private case notes · Blackrook Manor"),
      el("h2", "", "Detective’s notebook"),
      el("div", "notebook-crest", "♞"),
      el("h3", "", "The midnight investigation"),
      text(
        "Lord Ivory lies dead. The gates are locked. Every statement must be weighed against the evidence.",
      ),
      el(
        "div",
        "notebook-case-counts",
        el("span", "", String(clueCount), el("small", "", "clues recorded")),
        el(
          "span",
          "",
          statements + " / 5",
          el("small", "", "suspects questioned"),
        ),
      ),
      el(
        "div",
        "notebook-current-lead",
        eye(this.demo ? "Demonstration case" : "Next entry"),
        text(
          this.state.path.length === 0
            ? "Begin at the King’s Study. Examine the fallen King."
            : decision
              ? "Question " +
                decision.name +
                " in the " +
                roomName(decision.room) +
                "."
              : "All five statements are recorded. Review the case before committing a verdict.",
        ),
      ),
      text(
        "Motive is not proof. Connect the drink, the accounts and the opportunity.",
        "notebook-maxim",
      ),
      el("div", "notebook-signature", "Detective Knight"),
      el("small", "notebook-page-number", "I · Case notes"),
    );
    const rightPage = el(
      "section",
      "notebook-page notebook-records",
      el(
        "header",
        "notebook-section-head",
        eye("The case file"),
        el("h3", "", headings[tab]),
      ),
      content,
      el("small", "notebook-page-number", "II · " + headings[tab]),
    );
    rightPage.setAttribute("aria-label", headings[tab]);
    const close = button("×", () => this.explore(), "notebook-close");
    close.setAttribute("aria-label", "Close Detective’s notebook");
    const book = el(
      "section",
      "bound-notebook",
      nav,
      el(
        "div",
        "notebook-volume",
        close,
        el("div", "notebook-spread", leftPage, rightPage),
        el(
          "footer",
          "notebook-footer",
          el("small", "", "← ↑ ↓ → Bookmarks · Enter to open · Esc to close"),
          button("Return to investigation", () => this.explore(), "small"),
        ),
      ),
    );
    book.setAttribute("role", "dialog");
    book.setAttribute("aria-modal", "true");
    book.setAttribute("aria-label", "Detective’s notebook");
    this.modal(el("div", "scrim notebook-scrim", book), "notebook", () =>
      this.explore(),
    );
    queueMicrotask(() =>
      nav.querySelector<HTMLButtonElement>("button.active")?.focus(),
    );
  }
  private review() {
    if (this.state.path.length !== 6) {
      notify("Question all five suspects before committing a verdict.");
      return;
    }
    const p = proof(this.state);
    this.modal(
      this.panel(
        "Before the verdict",
        (this.demo ? "Demonstration case · " : "") +
          "All five statements recorded",
        [
          text(
            "You may return to the rooms and inspect anything you missed. Once you commit to a verdict, the investigation ends.",
          ),
          this.proofRows(),
          text(
            p.complete
              ? "The crucial evidence is secured. Destruction of the remaining papers cannot undo your case."
              : "The case still has gaps. An accusation can be made, but naming a suspect will not supply the missing proof.",
            "review-note",
          ),
          text(
            "Flint is a witness with a disciplinary secret. The developed murder accusations concern the family and household.",
            "review-note",
          ),
          el(
            "div",
            "review-actions",
            button(
              "1  Make an accusation",
              () => this.verdict("root"),
              "primary",
            ),
            button("2  Pursue one final lead", () => this.finalLead()),
          ),
          el(
            "div",
            "actions",
            button("Keep investigating", () => this.explore()),
            button("Read notebook", () => this.notebook("deductions")),
          ),
        ],
        () => this.explore(),
        true,
      ),
      "review",
      () => this.explore(),
    );
    this.choices = [
      ...ui.querySelectorAll<HTMLButtonElement>(".review-actions button"),
    ];
  }
  private verdict(step: "root" | "family" | "household") {
    const base = "root" + this.state.path.join("");
    let title = "Where does your accusation fall?",
      left = "The family",
      right = "The household",
      lf = () => this.verdict("family"),
      rf = () => this.verdict("household");
    if (step === "family") {
      title = "Which family member do you accuse?";
      left = "Lady Scarlet";
      right = "Prince Ash";
      lf = () => this.commitEnding("accuse_scarlet");
      rf = () => this.commitEnding("accuse_ash");
    }
    if (step === "household") {
      title = "Which member of the household do you accuse?";
      left = "Mara";
      right = "Chancellor Voss";
      lf = () => this.commitEnding("accuse_mara");
      rf = () => this.commitEnding("accuse_voss");
    }
    this.speech(
      "Detective Knight",
      title,
      [
        { label: left, fn: lf },
        { label: right, fn: rf },
      ],
      () => this.review(),
      true,
      "Verdict decision · " +
        base +
        (step === "root" ? "A" : step === "family" ? "F" : "H") +
        " · Escape returns to review without committing.",
    );
  }
  private finalLead() {
    this.speech(
      "Detective Knight",
      "A final confrontation will end the investigation. Have you secured the evidence you need?",
      [
        {
          label: "Commit to the final lead",
          fn: () => this.commitEnding("final_lead"),
        },
        { label: "Return to case review", fn: () => this.review() },
      ],
      () => this.review(),
      true,
      "Confirmation is interface navigation. Only the committed final-lead edge enters the immutable tree.",
    );
  }
  private commitEnding(action: string) {
    if (this.stage === "ending" || this.state.path.length !== 6) return;
    this.action = action;
    this.ending = resolveEnding(story, this.state, action) as Ending;
    this.stage = "ending";
    this.pendingResponse = false;
    this.save();
    if (!this.demo) {
      const seen = new Set(getGallery());
      seen.add(this.ending);
      try {
        localStorage.setItem("blackrook-gallery", JSON.stringify([...seen]));
      } catch {}
    }
    this.showEnding(this.ending);
  }
  private showEnding(
    id: Ending,
    preview = false,
    back: () => void = () => this.gallery(),
  ) {
    const e = story.endings[id];
    toast.classList.remove("show");
    this.world.stageEnding(id);
    hud.replaceChildren();
    const actions = el("div", "actions");
    if (!preview)
      actions.append(
        button("Review your path", () => this.recap(), "primary"),
        button("New investigation", () => this.newCase()),
      );
    else actions.append(button("Return to gallery", back, "primary"));
    const sceneCounter = el("small", "scene-counter", "Scene 1 / 3");
    const nextScene = button(
      "Next scene →",
      () => {
        this.sound.play("page_turn", 0.16);
        this.world.nextEndingShot();
        sceneCounter.textContent =
          "Scene " + (this.world.endingShot + 1) + " / 3";
        const label = ui.querySelector(".scene-label h3");
        if (label) label.textContent = this.world.endingSceneLabel;
      },
      "small",
    );
    const card = el(
      "article",
      "ending",
      eye(
        (preview
          ? "Gallery scene"
          : this.demo
            ? "Demonstration verdict"
            : "Case closed") +
          " · " +
          symbols[id],
      ),
      el("h2", "", e.title),
      text(e.text, "ending-copy"),
      text(e.epitaph, "epitaph"),
      el("div", "scene-controls", sceneCounter, nextScene),
      actions,
    );
    const root = el("div", "");
    root.append(
      el(
        "div",
        "scene-label",
        el("small", "", "Blackrook Manor"),
        el("h3", "", this.world.endingSceneLabel),
      ),
      card,
    );
    this.modal(root, "ending", () => (preview ? back() : this.recap()));
    this.sound.play(
      id === "checkmate"
        ? "checkmate_sting"
        : id === "fire"
          ? "fire_escape"
          : "wrong_verdict_sting",
      0.5,
    );
  }
  private recap() {
    if (!this.ending) return;
    const entries = el("div", "recap-path");
    for (const h of history(this.state))
      entries.append(
        el(
          "article",
          "recap-item",
          eye((h.bit ? "Right · 1" : "Left · 0") + " / " + h.node),
          el("h3", "", h.label),
          text(h.response),
          el("small", "", h.speaker + " → " + h.child),
        ),
      );
    const p = proof(this.state);
    const why =
      this.ending === "scarlet" ||
      this.ending === "ash" ||
      this.ending === "mara"
        ? "Your accusation selected a wrongful verdict. Motives and possession did not establish who poisoned the drink."
        : p.complete
          ? "The flask, goblet and medicine register connect the draught to the fatal drink. The study ledger corroborates the diverted funds. Witness testimony or matching delivery records establish opportunity. These three categories secured Checkmate before the confrontation."
          : this.ending === "fire"
            ? "You committed to the final lead without securing all three proof categories. Voss destroyed the remaining evidence during the confrontation."
            : "You accused Voss with an incomplete case. Suspicion identified him, but the available evidence did not secure his arrest.";
    const right = el(
      "div",
      "",
      eye("How this path produced the verdict"),
      el("h3", "", story.endings[this.ending].title),
      text(why),
      this.proofRows(),
      el("h3", "", "Evidence Set · " + new Set(this.state.evidence).size),
      text(this.state.evidence.map(evidenceName).join(" · ")),
      el("h3", "", "Committed verdict path"),
      text(selectedNodes(this.state, this.action).slice(6).join(" → ")),
      button(
        "Explore the binary tree",
        () => this.showTree(() => this.recap()),
        "primary",
      ),
    );
    this.modal(
      this.panel(
        "Every question left a trace",
        "Path recap · " + this.state.path.join(""),
        [
          el("div", "recap-columns", entries, right),
          el(
            "div",
            "actions",
            button("Return to ending", () => this.showEnding(this.ending!)),
            button("Ending gallery", () => this.gallery(() => this.recap())),
            button("New investigation", () => this.newCase()),
          ),
        ],
        () => this.showEnding(this.ending!),
        true,
        true,
      ),
      "recap",
      () => this.showEnding(this.ending!),
    );
  }
  private pause(resume: () => void = () => this.explore()) {
    this.sound.duck(true);
    const buttons = el(
      "div",
      "title-nav",
      button("Resume investigation", resume, "primary"),
      ...(this.stage === "world"
        ? [button("Notebook", () => this.notebook())]
        : []),
      button("Settings", () => this.showSettings(() => this.pause(resume))),
      button("DSA presentation", () =>
        this.presentation(() => this.pause(resume)),
      ),
      button("Save & return to title", () => {
        this.save();
        this.title();
      }),
    );
    if (this.settings.presentation)
      buttons.append(
        button("Open traversal visualizer", () =>
          this.showTree(() => this.pause(resume)),
        ),
      );
    this.modal(
      this.panel(
        "The house can wait",
        "Paused · There is no real-time countdown",
        [
          text(
            "Your case is saved after each clue, statement and room transition. Take your time with the evidence.",
          ),
          buttons,
        ],
        resume,
      ),
      "pause",
      resume,
    );
  }
  private showSettings(back: () => void) {
    const items = el("div", "");
    for (const [key, title] of [
      ["music", "Music"],
      ["effects", "Sound effects"],
    ] as const) {
      const input = el("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = ".01";
      input.value = String(this.settings[key]);
      input.id = "setting-" + key;
      const output = el(
        "output",
        "",
        Math.round(this.settings[key] * 100) + "%",
      );
      const label = el("label", "", title);
      label.htmlFor = input.id;
      input.addEventListener("input", () => {
        this.settings[key] = Number(input.value);
        output.textContent = Math.round(this.settings[key] * 100) + "%";
        this.applySettings();
      });
      items.append(el("div", "setting", label, input, output));
    }
    for (const [key, title] of [
      ["mute", "Mute all audio"],
      ["reducedMotion", "Reduced motion"],
      ["shadows", "Soft shadows"],
      ["presentation", "DSA presentation tools"],
    ] as const) {
      const input = el("input");
      input.type = "checkbox";
      input.id = "setting-" + key;
      input.checked = this.settings[key];
      input.addEventListener("change", () => {
        this.settings[key] = input.checked;
        this.applySettings();
      });
      const label = el("label", "", title);
      label.htmlFor = input.id;
      items.append(el("div", "setting", label, input));
    }
    items.append(
      text(
        "Sound starts only after an interaction. Reduced motion removes lean and camera damping. Disable shadows for slower devices. Presentation tools are explicitly labelled and do not change the canonical story.",
        "setting-note",
      ),
    );
    this.modal(
      this.panel(
        "Settings",
        "Picture & sound",
        [
          items,
          el(
            "div",
            "actions",
            button("Fullscreen", () => void this.fullscreen()),
            button("Done", back, "primary"),
          ),
        ],
        back,
      ),
      "settings",
      back,
    );
  }
  private gallery(back: () => void = () => this.title()) {
    // A gallery scene borrows the cast without changing the active case.
    if (this.stage === "ending" && this.ending)
      this.world.stageEnding(this.ending);
    else {
      this.world.resetCast();
      if (this.caseActive) this.world.followPlayer();
      else {
        this.world.player.visible = false;
        this.world.focusRoom("study");
      }
    }
    const seen = getGallery();
    const grid = el("div", "gallery-grid");
    for (const id of Object.keys(story.endings) as Ending[]) {
      const unlocked = seen.includes(id);
      const card = el(
        "article",
        "gallery-item",
        el("span", "medal", unlocked ? symbols[id] : "♙"),
        el(
          "h3",
          "",
          unlocked ? story.endings[id].title : "An undiscovered verdict",
        ),
        el(
          "small",
          "",
          unlocked
            ? "Recorded in your investigations"
            : "Finish a case to reveal this scene",
        ),
      );
      if (unlocked)
        card.append(
          button(
            "View scene",
            () => this.showEnding(id, true, () => this.gallery(back)),
            "small",
          ),
        );
      grid.append(card);
    }
    this.modal(
      this.panel(
        "The six verdicts",
        seen.length + " / 6 discovered · Demonstrations are not achievements",
        [grid, el("div", "actions", button("Return", back))],
        back,
        false,
        true,
      ),
      "gallery",
      back,
    );
  }
  private presentation(back: () => void) {
    const content = el(
      "div",
      "",
      text(
        "Presentation tools expose the narrative tree and allow clearly marked demonstration cases. Presets run the same story engine and proof checks. They replace the current case and do not unlock gallery achievements.",
      ),
      el(
        "div",
        "demo-controls",
        button("Correct-case preset", () => this.preset(true), "primary"),
        button("Incomplete-case preset", () => this.preset(false)),
        button("Fresh case", () => {
          this.settings.presentation = true;
          this.applySettings();
          this.newCase();
        }),
        button("Open DSA visualizer", () => {
          this.settings.presentation = true;
          this.applySettings();
          this.showTree(() => this.presentation(back));
        }),
      ),
    );
    content.append(
      button("Photographic model viewer", () =>
        this.photoMenu(() => this.presentation(back)),
      ),
    );
    if (this.caseActive && this.stage === "world")
      content.append(
        el(
          "div",
          "demo-controls",
          button("Go to current lead", () => {
            this.settings.presentation = true;
            this.applySettings();
            this.demo = true;
            const d = currentDecision(story, this.state);
            const t = this.world.targets.find(
              (t) => t.id === (this.state.path.length === 0 ? "king" : d?.id),
            );
            if (t) this.world.teleport(t.x + 0.9, t.z + 0.8);
            this.explore();
          }),
        ),
      );
    content.append(
      text(
        "Investigation tree: 127 nodes, 63 decisions, 64 contextual review leaves, height 6. Full verdict tree: 639 nodes, 319 decisions, 320 terminal contexts, maximum height 9. Six outcome types are resolved from those terminal contexts and the evidence Set.",
        "setting-note",
      ),
    );
    this.modal(
      this.panel(
        "DSA presentation",
        "Demonstration tools · Contains story spoilers",
        [content],
        back,
        false,
        true,
      ),
      "presentation",
      back,
    );
  }
  private preset(complete: boolean) {
    this.caseActive = true;
    this.settings.presentation = true;
    this.applySettings();
    this.state = startCase();
    for (const bit of complete ? [1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0])
      this.state = choose(story, this.state, bit);
    if (complete) {
      for (const id of [
        "poison_flask",
        "goblet_residue",
        "medicine_register",
        "study_ledger",
        "burned_accounts",
      ])
        this.state = inspect(story, this.state, id);
    }
    this.stage = "world";
    this.action = undefined;
    this.ending = undefined;
    this.pendingResponse = false;
    this.navigation = "";
    this.demo = true;
    this.world.resetCast();
    this.world.teleport(4.5, 13.5);
    this.save();
    this.review();
  }
  private photoMenu(back: () => void) {
    this.openModelViewer(0, back);
  }

  private openModelViewer(index: number, back: () => void) {
    this.viewerIndex =
      (index + characterModels.length) % characterModels.length;
    this.viewerBack = back;
    const model = characterModels[this.viewerIndex];
    const canvasHost = el("div", "model-stage");
    const previous = button("← Previous model", () =>
      this.openModelViewer(this.viewerIndex - 1, back),
    );
    previous.setAttribute("aria-label", "Previous model");
    const next = button(
      "Next model →",
      () => this.openModelViewer(this.viewerIndex + 1, back),
      "primary",
    );
    next.setAttribute("aria-label", "Next model");
    const select = el("select");
    select.setAttribute("aria-label", "Select chess model");
    characterModels.forEach((entry, entryIndex) => {
      const option = el("option", "", entry.name);
      option.value = String(entryIndex);
      select.append(option);
    });
    select.value = String(this.viewerIndex);
    select.onchange = () => this.openModelViewer(Number(select.value), back);
    const viewer = el(
      "section",
      "model-viewer",
      canvasHost,
      el(
        "header",
        "model-viewer-head",
        el(
          "div",
          "",
          eye("Blackrook Manor · The chess company"),
          el("h2", "", "The model gallery"),
        ),
        button("Close [Esc]", back),
      ),
      el(
        "div",
        "model-viewer-caption",
        eye(model.piece),
        el("h2", "", model.name),
        text(
          "Drag to rotate · Wheel to zoom · ← / → browse · Esc to close",
          "model-hint",
        ),
      ),
      el(
        "nav",
        "model-viewer-controls",
        previous,
        select,
        button(
          "Turn left",
          () => this.modelStage.rotate(-Math.PI / 6),
          "small",
        ),
        button(
          "Turn right",
          () => this.modelStage.rotate(Math.PI / 6),
          "small",
        ),
        button("Reset view", () => this.modelStage.resetCamera(), "small"),
        el(
          "span",
          "model-counter",
          this.viewerIndex + 1 + " / " + characterModels.length,
        ),
        next,
      ),
    );
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-label", "Rotatable chess model gallery");
    hud.replaceChildren();
    this.modal(viewer, "model-viewer", back);
    this.modelStage.show(model.asset, canvasHost, "gallery");
  }

  private showTree(back: () => void) {
    if (!this.settings.presentation && this.stage !== "ending") {
      this.presentation(back);
      return;
    }
    this.treeUI.open(this.state, this.action, back);
  }
  private async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify("Fullscreen is unavailable in this browser window.");
    }
  }
  private key(event: KeyboardEvent) {
    if (this.phoneBlocked) return;
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;

    if (
      event.repeat &&
      this.world.modal &&
      ["enter", " ", "escape", "1", "2"].includes(key)
    ) {
      event.preventDefault();
      return;
    }
    if (!event.repeat && key !== "tab") void this.sound.start();

    if (key === "tab" && this.world.modal) {
      const controls = [
        ...ui.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      this.world.clearKeys();
      this.onEscape();
      return;
    }
    if (
      this.view === "model-viewer" &&
      !target?.matches("select") &&
      (key === "arrowleft" || key === "arrowright")
    ) {
      event.preventDefault();
      this.openModelViewer(
        this.viewerIndex + (key === "arrowleft" ? -1 : 1),
        this.viewerBack,
      );
      return;
    }
    if (
      this.view === "chessboard" &&
      (key === "arrowleft" || key === "arrowright")
    ) {
      event.preventDefault();
      this.boardFrame = Math.max(
        0,
        Math.min(
          famousPosition.frames.length - 1,
          this.boardFrame + (key === "arrowleft" ? -1 : 1),
        ),
      );
      this.showChessboard();
      return;
    }
    if (this.world.modal && key.startsWith("arrow")) {
      navigateMenu(ui, event);
      return;
    }
    if (target?.matches("input, select, textarea")) return;
    if (event.repeat) return;
    if (key === "f") {
      void this.fullscreen();
      return;
    }
    if (key === "m") {
      this.settings.mute = !this.settings.mute;
      this.applySettings();
      notify(this.settings.mute ? "Audio muted" : "Audio restored");
      return;
    }
    if ((key === "1" || key === "2") && this.choices.length) {
      this.choices[Number(key) - 1]?.click();
      return;
    }
    if (this.view !== "world") return;
    if (key === "j") {
      this.notebook();
      return;
    }
    if (key === "t") {
      this.showTree(() => this.explore());
      return;
    }
    if (key === "e") {
      this.interact();
      return;
    }
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "shift",
      ].includes(key)
    ) {
      event.preventDefault();
      this.world.keys.add(key);
      void this.sound.start();
    }
  }
  get snapshot() {
    return {
      view: this.view,
      stage: this.stage,
      state: structuredClone(this.state),
      action: this.action,
      ending: this.ending,
      demo: this.demo,
      settings: { ...this.settings },
      proof: proof(this.state),
      navigation: this.navigation,
      traversal: this.treeUI.snapshot,
      stats: this.world.stats(),
      audioActive: this.sound.active,
      audio: this.sound.diagnostics,
      modelView: this.modelStage.snapshot,
      chessStudy: { frame: this.boardFrame, flipped: this.boardFlipped },
    };
  }
}
const game = new Game();
Object.defineProperty(window, "__CHECKMATE__", {
  value: {
    get snapshot() {
      return game.snapshot;
    },
    world: game.world,
  },
});
void game.init();
