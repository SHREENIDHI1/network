/** Built-in + user-made breathing patterns (custom ones saved on-device). */
import { useCallback, useEffect, useState } from 'react';
import { BUILT_IN_PATTERNS } from '@/data/content';
import type { BreathPattern } from '@/utils/breathingEngine';
import { KEYS, loadList, saveJSON } from '@/utils/storage';

export function usePatterns() {
  const [custom, setCustom] = useState<BreathPattern[]>([]);
  useEffect(() => {
    loadList<BreathPattern>(KEYS.patterns).then(setCustom);
  }, []);

  const saveCustom = useCallback(async (p: BreathPattern) => {
    const list = await loadList<BreathPattern>(KEYS.patterns);
    const next = [...list.filter((x) => x.id !== p.id), p];
    await saveJSON(KEYS.patterns, next);
    setCustom(next);
  }, []);

  const deleteCustom = useCallback(async (id: string) => {
    const next = (await loadList<BreathPattern>(KEYS.patterns)).filter((x) => x.id !== id);
    await saveJSON(KEYS.patterns, next);
    setCustom(next);
  }, []);

  return { all: [...BUILT_IN_PATTERNS, ...custom], custom, saveCustom, deleteCustom };
}

export async function findPattern(id: string): Promise<BreathPattern | undefined> {
  return BUILT_IN_PATTERNS.find((p) => p.id === id) ?? (await loadList<BreathPattern>(KEYS.patterns)).find((p) => p.id === id);
}
