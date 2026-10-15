/**
 * The sound mixer: several looping layers at once, each with its own volume,
 * smooth fades in/out, and a sleep timer that fades everything over the last
 * minute. One module-level instance is shared by every screen, so sound keeps
 * playing while you move around the app (and in the background).
 *
 * Fades are done in JS: every 50 ms each layer's gain moves toward its target.
 * Audible volume = user volume × layer gain × master gain (sleep-timer fade).
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AUDIO_FILES } from '@/data/content';

export const MAX_LAYERS = 6;
const TICK_MS = 50;
const FADE_IN_S = 2.0;
const FADE_OUT_S = 1.5;
const TIMER_FADE_S = 60;

interface Layer {
  id: string;
  player: AudioPlayer;
  volume: number; // what the user set, 0..1
  gain: number; // current fade multiplier, 0..1
  target: number; // where the gain is heading
  rate: number; // gain change per second
  removing: boolean;
}

export interface MixerState {
  layers: { id: string; volume: number }[];
  /** Epoch ms when the sleep timer ends, or null. */
  timerEndsAt: number | null;
}

type Listener = (s: MixerState) => void;

class Mixer {
  private layers = new Map<string, Layer>();
  private listeners = new Set<Listener>();
  private master = 1;
  private timerEndsAt: number | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private modeSet = false;

  private async ensureMode() {
    if (this.modeSet) return;
    this.modeSet = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' });
    } catch {
      // web or unsupported platform: fine, playback still works in the foreground
    }
  }

  // ------------------------------------------------------------ public API
  state(): MixerState {
    return {
      layers: [...this.layers.values()].filter((l) => !l.removing).map((l) => ({ id: l.id, volume: l.volume })),
      timerEndsAt: this.timerEndsAt,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => {
      this.listeners.delete(fn);
    };
  }

  isPlaying(id: string): boolean {
    const l = this.layers.get(id);
    return !!l && !l.removing;
  }

  activeCount(): number {
    return this.state().layers.length;
  }

  /** Starts a layer with a gentle fade-in. Returns false when the mixer is full. */
  async add(id: string, volume = 0.6): Promise<boolean> {
    const existing = this.layers.get(id);
    if (existing) {
      // re-adding a layer that is fading out: bring it back
      existing.removing = false;
      this.fade(existing, 1, FADE_IN_S);
      this.emit();
      return true;
    }
    if (this.activeCount() >= MAX_LAYERS) return false;
    const src = AUDIO_FILES[id];
    if (src === undefined) return false;
    await this.ensureMode();
    const player = createAudioPlayer(src);
    player.loop = true;
    player.volume = 0;
    player.play();
    const layer: Layer = { id, player, volume, gain: 0, target: 1, rate: 1 / FADE_IN_S, removing: false };
    this.layers.set(id, layer);
    this.startTicking();
    this.emit();
    return true;
  }

  /** Fades a layer out, then releases it. */
  remove(id: string) {
    const l = this.layers.get(id);
    if (!l || l.removing) return;
    l.removing = true;
    this.fade(l, 0, FADE_OUT_S);
    this.emit();
  }

  toggle(id: string, volume?: number) {
    if (this.isPlaying(id)) this.remove(id);
    else void this.add(id, volume);
  }

  setVolume(id: string, volume: number) {
    const l = this.layers.get(id);
    if (!l) return;
    l.volume = Math.max(0, Math.min(1, volume));
    this.apply(l);
    this.emit();
  }

  /** Replaces whatever is playing with a saved mix. */
  async loadMix(layers: { soundId: string; volume: number }[]) {
    for (const id of [...this.layers.keys()]) if (!layers.some((x) => x.soundId === id)) this.remove(id);
    for (const x of layers.slice(0, MAX_LAYERS)) {
      if (this.isPlaying(x.soundId)) this.setVolume(x.soundId, x.volume);
      else await this.add(x.soundId, x.volume);
    }
  }

  stopAll() {
    for (const id of [...this.layers.keys()]) this.remove(id);
    this.cancelTimer();
  }

  /** Sleep timer: everything fades over the final minute, then stops. */
  setTimer(minutes: number) {
    this.timerEndsAt = Date.now() + minutes * 60_000;
    this.master = 1;
    this.startTicking();
    this.emit();
  }

  cancelTimer() {
    this.timerEndsAt = null;
    this.master = 1;
    for (const l of this.layers.values()) this.apply(l);
    this.emit();
  }

  // ------------------------------------------------------------ internals
  private fade(l: Layer, target: number, seconds: number) {
    l.target = target;
    l.rate = Math.abs(target - l.gain) / Math.max(0.05, seconds);
    this.startTicking();
  }

  private apply(l: Layer) {
    try {
      l.player.volume = Math.max(0, Math.min(1, l.volume * l.gain * this.master));
    } catch {
      // the player may already be released
    }
  }

  private startTicking() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    const dt = TICK_MS / 1000;
    let moving = false;

    if (this.timerEndsAt !== null) {
      const left = (this.timerEndsAt - Date.now()) / 1000;
      if (left <= 0) {
        this.timerEndsAt = null;
        this.master = 1;
        for (const id of [...this.layers.keys()]) this.release(id);
        this.emit();
        return this.stopTickingIfIdle();
      }
      const m = Math.min(1, left / TIMER_FADE_S);
      if (Math.abs(m - this.master) > 0.001) this.master = m;
      moving = true;
    }

    for (const l of [...this.layers.values()]) {
      if (l.gain !== l.target) {
        moving = true;
        const step = l.rate * dt;
        l.gain = l.gain < l.target ? Math.min(l.target, l.gain + step) : Math.max(l.target, l.gain - step);
      }
      this.apply(l);
      if (l.removing && l.gain <= 0) this.release(l.id);
    }
    if (!moving) this.stopTickingIfIdle();
  }

  private stopTickingIfIdle() {
    const fading = [...this.layers.values()].some((l) => l.gain !== l.target);
    if (!fading && this.timerEndsAt === null && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private release(id: string) {
    const l = this.layers.get(id);
    if (!l) return;
    try {
      l.player.pause();
      l.player.remove();
    } catch {
      /* already released */
    }
    this.layers.delete(id);
    this.emit();
  }

  private emit() {
    const s = this.state();
    for (const fn of this.listeners) fn(s);
  }
}

export const mixer = new Mixer();
