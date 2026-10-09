import { ENABLE_LEGACY_TDM } from '../../config/features';
import { getTemplate } from '../../model/catalog';
import { isDeviceKindAllowed } from '../../model/networkingMode';
import type { DeviceCategory, DeviceKind } from '../../model/types';
import type { DeviceDoc } from './types';

/**
 * Lazy loaders for equipment docs, one chunk per palette category, so the
 * encyclopedia text never lands in the main bundle.
 * Categories are added as their docs are written (Step 2: LAN/IP + links,
 * Step 3: MPLS).
 */

const LOADERS: Partial<Record<DeviceCategory, () => Promise<DeviceDoc[]>>> = {
  legacy: () => import('./legacy').then((m) => m.LEGACY_DOCS),
};

export function hasDocsFor(category: DeviceCategory): boolean {
  return category in LOADERS;
}

/** Docs of one category, without docs for device kinds hidden in the current mode. */
export async function loadCategoryDocs(category: DeviceCategory, legacyEnabled = ENABLE_LEGACY_TDM): Promise<DeviceDoc[]> {
  const load = LOADERS[category];
  if (!load) return [];
  return (await load()).filter((d) => isDeviceKindAllowed(d.type, legacyEnabled));
}

export async function loadDeviceDoc(kind: DeviceKind, legacyEnabled = ENABLE_LEGACY_TDM): Promise<DeviceDoc | undefined> {
  const docs = await loadCategoryDocs(getTemplate(kind).category, legacyEnabled);
  return docs.find((d) => d.type === kind);
}

export async function loadAllDeviceDocs(legacyEnabled = ENABLE_LEGACY_TDM): Promise<DeviceDoc[]> {
  const cats = Object.keys(LOADERS) as DeviceCategory[];
  const lists = await Promise.all(cats.map((c) => loadCategoryDocs(c, legacyEnabled)));
  return lists.flat();
}
