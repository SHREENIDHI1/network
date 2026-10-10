import { create } from 'zustand';
import { Sim } from '../engine/sim';
import { useTopologyStore } from './topologyStore';

/**
 * Simulation state for the UI. The Sim engine instance lives here and is kept
 * in sync with the topology store. Two modes, as in Packet Tracer:
 *  - realtime:   commands (ping, traceroute) run to completion immediately
 *  - simulation: events wait in the queue; Step / Play advance them one by one
 */

export type SimMode = 'realtime' | 'simulation';
export type DockTab = 'cli' | 'inspector' | 'events' | 'qos' | 'nms' | 'auto';

interface SimState {
  sim: Sim;
  /** Bumped whenever engine state changes, so components re-render. */
  version: number;
  mode: SimMode;
  playing: boolean;
  /** Events per second while playing. */
  speed: number;
  dockOpen: boolean;
  dockTab: DockTab;
  cliDeviceId?: string;
  selectedFlowId?: number;
  selectedStepSeq?: number;

  setMode: (m: SimMode) => void;
  step: () => void;
  play: () => void;
  pause: () => void;
  setSpeed: (n: number) => void;
  resetSim: () => void;
  cutLink: (id: string) => void;
  restoreLink: (id: string) => void;
  openCli: (deviceId: string) => void;
  openDock: (tab: DockTab) => void;
  toggleDock: () => void;
  selectFlow: (id?: number) => void;
  selectStep: (seq?: number) => void;
}

const sim = new Sim(useTopologyStore.getState().topology);
// Hosts using DHCP obtain their address as soon as the app starts (Realtime mode is the default).
sim.runUntilIdle();
let timer: ReturnType<typeof setInterval> | undefined;

export const useSimStore = create<SimState>((set, get) => ({
  sim,
  version: 0,
  mode: 'realtime',
  playing: false,
  speed: 4,
  dockOpen: false,
  dockTab: 'cli',

  setMode: (mode) => {
    get().pause();
    set({ mode });
    if (mode === 'realtime') get().sim.runUntilIdle();
  },

  step: () => {
    get().sim.step();
  },

  play: () => {
    if (get().playing) return;
    set({ playing: true });
    const tick = () => {
      if (!get().sim.step()) get().pause();
    };
    timer = setInterval(tick, 1000 / get().speed);
  },

  pause: () => {
    clearInterval(timer);
    timer = undefined;
    set({ playing: false });
  },

  setSpeed: (speed) => {
    set({ speed });
    if (get().playing) {
      get().pause();
      get().play();
    }
  },

  resetSim: () => {
    get().pause();
    get().sim.reset();
    if (get().mode === 'realtime') get().sim.runUntilIdle();
    set({ selectedFlowId: undefined, selectedStepSeq: undefined });
  },

  cutLink: (id) => get().sim.cutLink(id),
  restoreLink: (id) => get().sim.restoreLink(id),

  openCli: (deviceId) => set({ cliDeviceId: deviceId, dockOpen: true, dockTab: 'cli' }),
  openDock: (tab) => set({ dockOpen: true, dockTab: tab }),
  toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
  selectFlow: (id) => set({ selectedFlowId: id, selectedStepSeq: undefined }),
  selectStep: (seq) => set({ selectedStepSeq: seq }),
}));

// Engine → UI: re-render on every engine change.
sim.onChange(() => useSimStore.setState((s) => ({ version: s.version + 1 })));

// Topology → engine: apply every topology/config edit.
useTopologyStore.subscribe((state, prev) => {
  if (state.topology === prev.topology) return;
  if (state.topology !== sim.topology) sim.setTopology(state.topology);
  // Realtime: let protocol events triggered by the change (e.g. DHCP DORA) run now.
  if (useSimStore.getState().mode === 'realtime') sim.runUntilIdle();
});
