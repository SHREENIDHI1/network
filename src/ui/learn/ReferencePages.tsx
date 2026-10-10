import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { COMMANDS, preLines } from '../../docs/commandReference';
import { EXPLAINED_COMMANDS } from '../../docs/showExplain';
import { LESSON_LOADERS } from '../../lessons/curriculum';
import type { GlossaryEntry } from '../../lessons/types';

/** Glossary: every term from every available lesson, EN + Hinglish, searchable. */
export function GlossaryPage() {
  const [terms, setTerms] = useState<Array<GlossaryEntry & { lesson: string }> | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    void Promise.all(Object.entries(LESSON_LOADERS).map(([id, load]) => load().then((l) => l.glossary.map((g) => ({ ...g, lesson: id }))))).then(
      (lists) => {
        if (!alive) return;
        const seen = new Map<string, GlossaryEntry & { lesson: string }>();
        for (const g of lists.flat()) if (!seen.has(g.term.toLowerCase())) seen.set(g.term.toLowerCase(), g);
        setTerms([...seen.values()].sort((a, b) => a.term.localeCompare(b.term)));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (terms ?? []).filter((t) => !n || `${t.term} ${t.en} ${t.hi}`.toLowerCase().includes(n));
  }, [terms, q]);
  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="mb-1 text-2xl font-semibold text-slate-50">Glossary</h1>
      <p className="mb-3 text-sm text-slate-400">Har lesson ke terms, English + Hinglish. Naye lessons ke saath yeh list badhti rahegi.</p>
      <SearchBox value={q} onChange={setQ} placeholder="Search terms (e.g. trunk, ARP, LACP)" />
      {!terms ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <dl className="mt-3 divide-y divide-slate-800">
          {shown.map((t) => (
            <div key={t.term} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[11rem_1fr]">
              <dt className="font-semibold text-sky-300">
                {t.term} <span className="ml-1 font-mono text-[10px] text-slate-500">{t.lesson}</span>
              </dt>
              <dd className="text-sm text-slate-300">
                {t.en}
                <span className="block text-slate-500">{t.hi}</span>
              </dd>
            </div>
          ))}
          {!shown.length && <p className="py-3 text-slate-500">No term matches “{q}”.</p>}
        </dl>
      )}
    </div>
  );
}

/** Command Reference: every documented command, how to reach its mode, and an explanation. */
export function CommandsPage() {
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const shown = COMMANDS.filter((c) => !n || `${c.example} ${c.en} ${c.hi} ${c.topic}`.toLowerCase().includes(n));
  const topics = [...new Set(shown.map((c) => c.topic))];
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h1 className="mb-1 text-2xl font-semibold text-slate-50">Command reference</h1>
      <p className="mb-3 text-sm text-slate-400">
        RailMPLS Lab ka IOS-like CLI (subset). Har example simulator mein test kiya gaya hai. Yeh generic syntax hai — NEON ya kisi vendor ka official
        syntax nahi. CLI mein “?” se har mode ke saare commands dikhte hain.
      </p>
      <SearchBox value={q} onChange={setQ} placeholder="Search commands (e.g. trunk, channel, ping)" />
      {topics.map((t) => (
        <section key={t} className="mt-4">
          <h2 className="rn-label mb-1">{t}</h2>
          <table className="w-full text-sm">
            <tbody>
              {shown
                .filter((c) => c.topic === t)
                .map((c) => (
                  <tr key={`${c.device}${c.mode}${c.example}`} className="border-t border-slate-800 align-top">
                    <td className="w-72 py-1.5 pr-3">
                      <code className="font-mono text-emerald-200">{c.example}</code>
                      <div className="text-[11px] text-slate-500" title={preLines(c.mode, c.device).join(' → ')}>
                        {c.mode === 'host' ? 'PC command prompt' : `mode: ${c.mode}`} · {c.device}
                      </div>
                    </td>
                    <td className="py-1.5 text-slate-300">
                      {c.en}
                      <span className="block text-slate-500">{c.hi}</span>
                    </td>
                    <td className="w-12 py-1.5 text-right font-mono text-[11px] text-slate-500">{c.lesson}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mt-6 text-xs text-slate-500">“Ask why” explanations exist for: {EXPLAINED_COMMANDS.join(', ')}.</p>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-slate-500" />
      <input className="rn-input pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Search" />
    </label>
  );
}
