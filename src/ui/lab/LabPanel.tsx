import { BookOpen, CheckCircle2, ChevronDown, Circle, Lightbulb, LogOut, RotateCcw, Siren } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { engineSections } from '../../engine/snapshotSections';
import { buildSnapshot } from '../../labs/framework/snapshot';
import { solutionText } from '../../labs/framework/solution';
import type { Lab } from '../../labs/framework/types';
import { useAppMode } from '../../store/appModeStore';
import { BREAKFIX_POINTS, HINT_COST, labScore, maxLabScore, useLabStore } from '../../store/labStore';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';
import { FlashQuiz } from '../learn/FlashQuiz';

/** Left-hand panel while a lab is open: scenario, plan, live task checks, hints, break-fix, quiz. */
export default function LabPanel({ lab }: { lab: Lab }) {
  const sim = useSimStore((s) => s.sim);
  const version = useSimStore((s) => s.version);
  const topology = useTopologyStore((s) => s.topology);
  const { hints, breakFix, quizScore } = useLabStore();
  const openLesson = useAppMode((s) => s.openLesson);

  // Live checks: recomputed whenever the engine or the topology changes.
  const snap = useMemo(() => buildSnapshot(topology, engineSections(sim)), [sim, version, topology]);
  const results = useMemo(() => lab.tasks.map((t) => ({ task: t, r: t.check(snap) })), [lab, snap]);
  const passed = useMemo(() => new Set(results.filter((x) => x.r.pass).map((x) => x.task.id)), [results]);
  const allDone = passed.size === lab.tasks.length;
  const bf = lab.breakFix && breakFix === 'active' ? lab.breakFix.check(snap) : undefined;
  const score = labScore(lab, passed, hints, breakFix === 'done', quizScore);

  useEffect(() => {
    if (bf?.pass) useLabStore.getState().finishBreakFix();
  }, [bf?.pass]);
  useEffect(() => {
    useLabStore.getState().save(allDone, score);
  }, [allDone, score]);

  const restart = () => {
    if (window.confirm('Restart this lab from its starting topology? Your changes will be lost.')) void useLabStore.getState().start(lab);
  };

  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-r border-slate-800 bg-slate-950" aria-label={`Lab ${lab.id}`}>
      <header className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{lab.id}</span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100" title={lab.title}>
            {lab.title}
          </h2>
          <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-800" title="Restart lab" onClick={restart}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-800"
            title="Leave lab (back to lab list)"
            onClick={() => useLabStore.getState().exit()}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <div className="h-1.5 flex-1 rounded bg-slate-800">
            <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${(passed.size / lab.tasks.length) * 100}%` }} />
          </div>
          <span className="text-slate-400">
            {passed.size}/{lab.tasks.length} tasks · {score}/{maxLabScore(lab)} pts
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        <Fold title="Scenario" open>
          <p className="text-slate-300">{lab.scenario}</p>
        </Fold>
        {lab.concept && (
          <Fold title="Concept">
            <p className="whitespace-pre-line text-slate-300">{lab.concept}</p>
            {lab.lessonId && (
              <button type="button" className="rn-btn mt-2 py-0.5 text-xs" onClick={() => openLesson(lab.lessonId!)}>
                <BookOpen className="h-3.5 w-3.5" /> Read lesson {lab.lessonId}
              </button>
            )}
          </Fold>
        )}
        {lab.plan && (
          <Fold title="Plan" open>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {lab.plan.headers.map((h) => (
                    <th key={h} className="border-b border-slate-700 pb-1 text-left font-medium text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lab.plan.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className="border-b border-slate-800/70 py-0.5 pr-1 align-top text-slate-300">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Fold>
        )}

        <section>
          <h3 className="rn-label mb-1">Tasks (live check)</h3>
          <ol className="space-y-2">
            {results.map(({ task, r }, i) => {
              const shown = hints[task.id] ?? 0;
              const list = lab.hints[i] ?? [];
              return (
                <li key={task.id} className={`rounded border p-2 ${r.pass ? 'border-emerald-800 bg-emerald-950/30' : 'border-slate-800'}`}>
                  <div className="flex gap-2">
                    {r.pass ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-100">
                        {i + 1}. {task.text} <span className="text-xs text-slate-500">({task.points} pts)</span>
                      </p>
                      {!r.pass && <p className="mt-0.5 text-xs text-amber-300">{r.detail}</p>}
                      {list.slice(0, shown).map((h, k) => (
                        <p key={k} className="mt-1 rounded bg-slate-900 px-2 py-1 text-xs text-sky-200">
                          💡 {h}
                        </p>
                      ))}
                      {!r.pass && shown < list.length && (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-sky-400 hover:underline"
                          onClick={() => useLabStore.getState().revealHint(task.id)}
                        >
                          <Lightbulb className="h-3 w-3" /> Hint {shown + 1}/{list.length} (−{HINT_COST} pts)
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {(allDone || breakFix !== 'idle') && lab.breakFix && (
          <section className="rounded-lg border border-red-900 bg-red-950/30 p-2">
            <h3 className="mb-1 flex items-center gap-1 font-semibold text-red-200">
              <Siren className="h-4 w-4" /> Break-fix challenge (+{BREAKFIX_POINTS} pts)
            </h3>
            {breakFix === 'idle' && (
              <>
                <p className="text-xs text-slate-300">Sab tasks ho gaye. Ab ek field fault inject hoga — dhoondho aur theek karo.</p>
                <button type="button" className="rn-btn-danger mt-2" onClick={() => useLabStore.getState().startBreakFix()}>
                  Inject fault
                </button>
              </>
            )}
            {breakFix !== 'idle' && <p className="text-slate-200">📞 {lab.breakFix.complaint}</p>}
            {breakFix === 'active' && bf && (
              <>
                <p className="mt-1 text-xs text-amber-300">{bf.detail}</p>
                <details className="mt-1 text-xs text-sky-200">
                  <summary className="cursor-pointer text-sky-400">Hints</summary>
                  <ul className="ml-4 list-disc">
                    {lab.breakFix.hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            {breakFix === 'done' && <p className="mt-1 font-semibold text-emerald-300">Fixed ✓ — service restored.</p>}
          </section>
        )}

        {allDone && (
          <section>
            <FlashQuiz key={lab.id} questions={lab.quiz} title="Lab quiz (5)" onFinish={(n) => useLabStore.getState().setQuizScore(n)} />
          </section>
        )}

        <Fold title="Field note">
          <p className="whitespace-pre-line text-slate-300">{lab.fieldNote}</p>
        </Fold>
        {allDone && lab.solution && (
          <Fold title="Reference solution">
            <pre className="overflow-x-auto rounded bg-slate-900 p-2 font-mono text-xs text-emerald-200">{solutionText(lab.solution)}</pre>
          </Fold>
        )}
      </div>
    </aside>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded border border-slate-800">
      <summary className="flex cursor-pointer items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-0 -rotate-90" /> {title}
      </summary>
      <div className="px-2 pb-2">{children}</div>
    </details>
  );
}
