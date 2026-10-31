import { button, el, text } from "./dom";

type FullscreenDocument = Document & { webkitFullscreenElement?: Element };
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

/** Native landscape/fullscreen with a gesture fallback when the browser requires it. */
export class PhoneDisplay {
  private media = matchMedia("(pointer: coarse)");
  private cover = el("section", "rotate-screen");
  private fullscreenButton: HTMLButtonElement;
  private rotateButton: HTMLButtonElement;
  private status = text("Turn your phone sideways to enter Blackrook Manor.");
  private pending = false;
  private autoAllowed = true;
  private wasFullscreen = false;
  private portrait = false;
  private previousFocus: HTMLElement | null = null;
  private wasLandscape = false;

  constructor(private onBlocked: (blocked: boolean) => void) {
    this.cover.setAttribute("role", "dialog");
    this.cover.setAttribute("aria-modal", "true");
    this.cover.setAttribute("aria-labelledby", "rotate-title");
    this.cover.tabIndex = -1;
    const title = el("h2", "", "Turn to landscape");
    title.id = "rotate-title";
    this.rotateButton = button(
      "Enter landscape fullscreen",
      () => void this.enter(),
      "primary",
    );
    this.cover.append(
      el(
        "div",
        "rotate-card",
        el("div", "rotate-phone", "↻"),
        title,
        text("This game is played horizontally."),
        this.status,
        this.rotateButton,
      ),
    );
    this.fullscreenButton = button(
      "⛶  Fullscreen",
      () => void this.enter(),
      "phone-fullscreen-cta",
    );
    this.fullscreenButton.setAttribute("aria-label", "Enter fullscreen");
    document.body.append(this.cover, this.fullscreenButton);
    const update = () => this.refresh();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    screen.orientation?.addEventListener("change", update);
    this.media.addEventListener("change", update);
    for (const name of ["fullscreenchange", "webkitfullscreenchange"])
      document.addEventListener(name, () => {
        if (this.wasFullscreen && !this.immersive) this.autoAllowed = false;
        this.wasFullscreen = this.immersive;
        this.refresh();
      });
    // Touch pointer-up supplies activation; rotation alone usually does not.
    document.addEventListener("pointerup", () => this.tryAutomatic(), true);
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" && !event.repeat) this.tryAutomatic();
      },
      true,
    );
    this.refresh();
  }

  get mobile() {
    return this.media.matches;
  }
  get immersive() {
    return (
      !!(
        document.fullscreenElement ||
        (document as FullscreenDocument).webkitFullscreenElement
      ) ||
      matchMedia("(display-mode: standalone), (display-mode: fullscreen)")
        .matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }
  private get supported() {
    const root = document.documentElement as FullscreenRoot;
    return (
      (typeof root.requestFullscreen === "function" &&
        document.fullscreenEnabled !== false) ||
      typeof root.webkitRequestFullscreen === "function"
    );
  }
  private tryAutomatic() {
    if (
      this.mobile &&
      innerWidth > innerHeight &&
      this.autoAllowed &&
      !this.immersive &&
      !this.pending &&
      this.supported &&
      navigator.userActivation?.isActive
    )
      void this.enter();
  }

  async enter() {
    if (this.pending || !this.mobile) return;
    if (!this.supported && !this.immersive) {
      this.refresh();
      return;
    }
    this.pending = true;
    try {
      if (!this.immersive) {
        const root = document.documentElement as FullscreenRoot;
        if (root.requestFullscreen && document.fullscreenEnabled !== false)
          await root.requestFullscreen({ navigationUI: "hide" });
        else await root.webkitRequestFullscreen?.();
      }
      try {
        await (screen.orientation as LockableOrientation)?.lock?.("landscape");
      } catch {
        /* Manual rotation remains available when orientation locking is unsupported. */
      }
      this.wasFullscreen = this.immersive;
    } catch {
      // Leave a working one-tap control instead of repeatedly requesting permission.
      this.autoAllowed = false;
    } finally {
      this.pending = false;
      this.refresh();
    }
  }

  refresh() {
    const landscape = innerWidth > innerHeight;
    if (landscape && !this.wasLandscape) this.autoAllowed = true;
    this.wasLandscape = landscape;
    const blocked = this.mobile && !landscape;
    document.body.classList.toggle("phone-portrait", blocked);
    this.cover.hidden = !blocked;
    this.rotateButton.hidden = !this.supported || this.immersive;
    this.status.textContent = this.supported
      ? "Turn your phone sideways. Fullscreen starts on your next tap when needed."
      : "Turn your phone sideways. This browser will keep its navigation controls visible.";
    this.fullscreenButton.hidden =
      !this.mobile || blocked || this.immersive || !this.supported;
    if (blocked !== this.portrait) {
      this.portrait = blocked;
      if (blocked)
        this.previousFocus = document.activeElement as HTMLElement | null;
      this.onBlocked(blocked);
      if (blocked)
        (this.rotateButton.hidden ? this.cover : this.rotateButton).focus({
          preventScroll: true,
        });
      else if (this.previousFocus?.isConnected)
        this.previousFocus.focus({ preventScroll: true });
    }
    this.tryAutomatic();
  }
}
