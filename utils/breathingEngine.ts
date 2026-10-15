/**
 * Pure breathing-pattern maths (no React, fully unit-tested).
 *
 * A pattern is a list of phases (inhale / hold / exhale / hold-after-exhale) with
 * durations in seconds. The engine answers: "at time t since start, which phase
 * are we in, how far through it, and which cycle?"
 */
export type PhaseKind = 'in' | 'hold' | 'out' | 'holdOut';

export interface BreathPhase {
  kind: PhaseKind;
  seconds: number;
}

export interface BreathPattern {
  id: string;
  name: string;
  description: string;
  phases: BreathPhase[];
  /** Suggested number of cycles for one session. */
  cycles: number;
  builtIn: boolean;
}

export interface BreathState {
  phaseIndex: number;
  phase: BreathPhase;
  /** 0..1 progress through the current phase. */
  progress: number;
  /** Seconds left in this phase, rounded up (for the on-screen count). */
  remaining: number;
  cycle: number; // 1-based
  done: boolean;
}

export const PHASE_LABEL: Record<PhaseKind, string> = {
  in: 'Breathe in',
  hold: 'Hold gently',
  out: 'Breathe out',
  holdOut: 'Rest',
};

/** Short words for compact rhythm summaries ("in 4 · hold 7 · out 8"). */
export const PHASE_SHORT: Record<PhaseKind, string> = { in: 'in', hold: 'hold', out: 'out', holdOut: 'rest' };

/** Phases with 0 seconds are skipped (lets a builder use 0 for "no hold"). */
export function activePhases(p: BreathPattern): BreathPhase[] {
  return p.phases.filter((ph) => ph.seconds > 0);
}

export function cycleSeconds(p: BreathPattern): number {
  return activePhases(p).reduce((a, ph) => a + ph.seconds, 0);
}

export function sessionSeconds(p: BreathPattern, cycles = p.cycles): number {
  return cycleSeconds(p) * cycles;
}

export function stateAt(p: BreathPattern, t: number, cycles = p.cycles): BreathState {
  const phases = activePhases(p);
  const total = cycleSeconds(p);
  if (!phases.length || total <= 0) throw new Error('pattern has no phases');
  const end = total * cycles;
  if (t >= end) {
    const last = phases[phases.length - 1];
    return { phaseIndex: phases.length - 1, phase: last, progress: 1, remaining: 0, cycle: cycles, done: true };
  }
  const time = Math.max(0, t);
  const cycle = Math.floor(time / total) + 1;
  let within = time - (cycle - 1) * total;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (within < ph.seconds) {
      return { phaseIndex: i, phase: ph, progress: within / ph.seconds, remaining: Math.ceil(ph.seconds - within), cycle, done: false };
    }
    within -= ph.seconds;
  }
  // floating-point edge: treat as the start of the next cycle
  return { phaseIndex: 0, phase: phases[0], progress: 0, remaining: phases[0].seconds, cycle: Math.min(cycle + 1, cycles), done: false };
}

/** Orb scale target for a phase: big when lungs are full, small when empty. */
export function orbTarget(kind: PhaseKind): number {
  return kind === 'in' || kind === 'hold' ? 1 : 0.55;
}

/** Validation used by the custom pattern builder. */
export function validatePattern(p: Pick<BreathPattern, 'phases'>): string | null {
  const inhale = p.phases.find((x) => x.kind === 'in');
  const exhale = p.phases.find((x) => x.kind === 'out');
  if (!inhale || inhale.seconds < 2) return 'Breathing in should last at least 2 seconds.';
  if (!exhale || exhale.seconds < 2) return 'Breathing out should last at least 2 seconds.';
  if (p.phases.some((x) => x.seconds < 0 || x.seconds > 12)) return 'Keep each step between 0 and 12 seconds.';
  return null;
}
