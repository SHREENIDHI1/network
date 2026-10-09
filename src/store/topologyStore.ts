import { create } from 'zustand';
import { parseTopology, serializeTopology } from '../io/serialize';
import { hasHiddenLegacy, isDeviceKindAllowed, LEGACY_HIDDEN_MESSAGE } from '../model/networkingMode';
import * as ops from '../model/topologyOps';
import type { DeviceKind, Topology, XY } from '../model/types';

export type Selection = { type: 'device'; id: string } | { type: 'link'; id: string } | null;

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

interface TopologyState {
  topology: Topology;
  selection: Selection;
  /** Two devices the user just joined on the canvas; opens the link dialog. */
  pendingConnection: { aDeviceId: string; bDeviceId: string } | null;
  notices: Notice[];

  newTopology: (name?: string) => void;
  loadTopology: (t: Topology) => void;
  loadFromText: (text: string) => boolean;
  exportText: () => string;
  renameTopology: (name: string, description?: string) => void;

  addDevice: (kind: DeviceKind, position: XY) => void;
  updateDevice: (id: string, patch: ops.DevicePatch) => void;
  moveDevice: (id: string, position: XY) => void;
  removeDevice: (id: string) => void;

  requestConnection: (aDeviceId: string, bDeviceId: string) => void;
  cancelConnection: () => void;
  addLink: (input: ops.NewLinkInput) => boolean;
  updateLink: (id: string, patch: ops.LinkPatch) => boolean;
  removeLink: (id: string) => void;

  select: (s: Selection) => void;
  notify: (kind: Notice['kind'], text: string) => void;
  dismissNotice: (id: number) => void;
}

const AUTOSAVE_KEY = 'railnet-sim:autosave';
let noticeSeq = 0;

function loadAutosave(): Topology | null {
  try {
    const text = globalThis.localStorage?.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const res = parseTopology(text);
    return res.ok ? res.topology : null;
  } catch {
    return null;
  }
}

function saveAutosave(t: Topology): void {
  try {
    globalThis.localStorage?.setItem(AUTOSAVE_KEY, serializeTopology(t));
  } catch {
    // Storage unavailable (private mode, quota); autosave is best-effort.
  }
}

export const useTopologyStore = create<TopologyState>((set, get) => ({
  topology: loadAutosave() ?? ops.emptyTopology(),
  selection: null,
  pendingConnection: null,
  notices: [],

  newTopology: (name) => set({ topology: ops.emptyTopology(name), selection: null, pendingConnection: null }),

  loadTopology: (t) => set({ topology: t, selection: null, pendingConnection: null }),

  loadFromText: (text) => {
    const res = parseTopology(text);
    if (!res.ok) {
      get().notify('error', `Could not load file:\n${res.errors.slice(0, 6).join('\n')}`);
      return false;
    }
    get().loadTopology(res.topology);
    get().notify('info', `Loaded "${res.topology.meta.name}" (${res.topology.devices.length} devices, ${res.topology.links.length} links).`);
    if (hasHiddenLegacy(res.topology)) get().notify('info', LEGACY_HIDDEN_MESSAGE);
    return true;
  },

  exportText: () => serializeTopology(get().topology),

  renameTopology: (name, description) =>
    set((s) => ({ topology: { ...s.topology, meta: { name, description: description ?? s.topology.meta.description } } })),

  addDevice: (kind, position) => {
    if (!isDeviceKindAllowed(kind)) {
      get().notify('error', 'This device type is hidden in networking-only mode.');
      return;
    }
    const { topology, device } = ops.addDevice(get().topology, kind, position);
    set({ topology, selection: { type: 'device', id: device.id } });
  },

  updateDevice: (id, patch) => set((s) => ({ topology: ops.updateDevice(s.topology, id, patch) })),

  moveDevice: (id, position) => set((s) => ({ topology: ops.updateDevice(s.topology, id, { position }) })),

  removeDevice: (id) =>
    set((s) => ({
      topology: ops.removeDevice(s.topology, id),
      selection: s.selection?.id === id ? null : s.selection,
    })),

  requestConnection: (aDeviceId, bDeviceId) => {
    if (aDeviceId === bDeviceId) return;
    set({ pendingConnection: { aDeviceId, bDeviceId } });
  },

  cancelConnection: () => set({ pendingConnection: null }),

  addLink: (input) => {
    const res = ops.addLink(get().topology, input);
    if (!res.ok) {
      get().notify('error', res.reason);
      return false;
    }
    set({ topology: res.topology, pendingConnection: null, selection: { type: 'link', id: res.link.id } });
    return true;
  },

  updateLink: (id, patch) => {
    const { topology, check } = ops.updateLink(get().topology, id, patch);
    if (!check.ok) {
      get().notify('error', check.reason);
      return false;
    }
    set({ topology });
    return true;
  },

  removeLink: (id) =>
    set((s) => ({
      topology: ops.removeLink(s.topology, id),
      selection: s.selection?.id === id ? null : s.selection,
    })),

  select: (selection) => set({ selection }),

  notify: (kind, text) => {
    const id = ++noticeSeq;
    set((s) => ({ notices: [...s.notices, { id, kind, text }] }));
    setTimeout(() => get().dismissNotice(id), kind === 'error' ? 7000 : 4000);
  },

  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));

// Autosave on every topology change (debounced).
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
useTopologyStore.subscribe((state, prev) => {
  if (state.topology === prev.topology) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveAutosave(state.topology), 400);
});
