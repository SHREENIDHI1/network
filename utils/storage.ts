/**
 * Tiny typed wrapper around AsyncStorage.
 *
 * Everything the app stores lives on this device. Keys are namespaced with
 * "sthira:" so "Erase all my data" can remove exactly our keys and nothing else.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  settings: 'sthira:settings',
  patterns: 'sthira:custom-patterns',
  mixes: 'sthira:saved-mixes',
  sessions: 'sthira:session-log',
} as const;

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({ ...fallbackShape(fallback), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback; // corrupted or unavailable storage must never crash the app
  }
}

// Arrays are replaced wholesale; objects are merged so new settings get defaults.
function fallbackShape<T>(fallback: T): object {
  return Array.isArray(fallback) || typeof fallback !== 'object' || fallback === null ? {} : fallback;
}

export async function loadList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working in memory.
  }
}

/** Removes every Sthira key from this device. */
export async function eraseAll(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith('sthira:')));
}
