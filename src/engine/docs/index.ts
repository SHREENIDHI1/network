import { getTemplate } from '../../model/catalog';
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

export async function loadCategoryDocs(category: DeviceCategory): Promise<DeviceDoc[]> {
  const load = LOADERS[category];
  return load ? load() : [];
}

export async function loadDeviceDoc(kind: DeviceKind): Promise<DeviceDoc | undefined> {
  const docs = await loadCategoryDocs(getTemplate(kind).category);
  return docs.find((d) => d.type === kind);
}

export async function loadAllDeviceDocs(): Promise<DeviceDoc[]> {
  const lists = await Promise.all(Object.values(LOADERS).map((l) => l!()));
  return lists.flat();
}
