import type { Settings } from "./engine";
import { assetUrl } from "./assets";
const files = [
  "title_music_loop",
  "manor_ambient_loop",
  "clock_tick",
  "page_turn",
  "stone_slide",
  "door_creak",
  "choice_confirm",
  "evidence_found",
  "checkmate_sting",
  "wrong_verdict_sting",
  "fire_escape",
];
export class Sound {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private started = false;
  private ducked = false;
  private ambience: GainNode | null = null;
  private loop: GainNode | null = null;
  constructor(public settings: Settings) {}
  async start() {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    this.started = true;
    this.ctx = new AudioContext();
    this.music = this.ctx.createGain();
    this.effects = this.ctx.createGain();
    this.music.connect(this.ctx.destination);
    this.effects.connect(this.ctx.destination);
    this.update(this.settings);
    await this.ctx.resume();
    await Promise.all(
      files.map(async (f) => {
        try {
          const response = await fetch(assetUrl("audio/" + f + ".wav"));
          if (!response.ok) throw Error();
          this.buffers.set(
            f,
            await this.ctx!.decodeAudioData(await response.arrayBuffer()),
          );
        } catch {
          console.warn("Sound unavailable:", f);
        }
      }),
    );
    this.loop = this.makeLoop("title_music_loop", 0.23, this.music!);
    this.ambience = this.makeLoop("manor_ambient_loop", 0.07, this.music!);
  }
  private makeLoop(id: string, volume: number, parent: GainNode) {
    const gain = this.ctx!.createGain();
    gain.gain.value = 0;
    gain.connect(parent);
    const source = this.ctx!.createBufferSource();
    source.buffer = this.buffers.get(id) || null;
    source.loop = true;
    source.connect(gain);
    source.start();
    gain.gain.linearRampToValueAtTime(volume, this.ctx!.currentTime + 1.4);
    return gain;
  }
  update(s: Settings) {
    this.settings = s;
    if (!this.ctx || !this.music || !this.effects) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(
      s.mute ? 0 : s.music * (this.ducked ? 0.4 : 1),
      t,
      0.13,
    );
    this.effects.gain.setTargetAtTime(s.mute ? 0 : s.effects, t, 0.08);
  }
  duck(value: boolean) {
    this.ducked = value;
    this.update(this.settings);
  }
  room(id: string) {
    if (!this.ctx || !this.loop || !this.ambience) return;
    const t = this.ctx.currentTime;
    this.loop.gain.setTargetAtTime(id === "library" ? 0.13 : 0.2, t, 1);
    this.ambience.gain.setTargetAtTime(
      id === "library" || id === "drawing" ? 0.11 : 0.055,
      t,
      1,
    );
  }
  play(id: string, gain = 0.45) {
    if (!this.ctx || !this.effects || !this.buffers.has(id)) return;
    const source = this.ctx.createBufferSource(),
      g = this.ctx.createGain();
    source.buffer = this.buffers.get(id)!;
    source.playbackRate.value = id === "stone_slide" ? 0.85 : 1;
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.015);
    g.gain.setTargetAtTime(
      0.001,
      this.ctx.currentTime + Math.max(0.025, source.buffer.duration - 0.09),
      0.035,
    );
    source.connect(g);
    g.connect(this.effects);
    source.start();
    source.onended = () => {
      source.disconnect();
      g.disconnect();
    };
  }
  suspend() {
    this.ctx?.suspend();
  }
  resume() {
    if (this.started) this.ctx?.resume();
  }
  get diagnostics() {
    return {
      state: this.ctx?.state || "not started",
      decodedSounds: this.buffers.size,
      musicGain: this.music?.gain.value ?? 0,
      effectsGain: this.effects?.gain.value ?? 0,
    };
  }
  get active() {
    return this.started && this.ctx?.state === "running";
  }
}
