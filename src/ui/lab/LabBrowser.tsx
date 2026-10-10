import { useReactFlow } from '@xyflow/react';
import { BookOpen, CheckCircle2, FlaskConical, Lock, Play } from 'lucide-react';
import { CURRICULUM } from '../../lessons/curriculum';
import { labLockReason, visibleLabs } from '../../labs/registry';
import type { Lab } from '../../labs/framework/types';
import { useAppMode } from '../../store/appModeStore';
import { maxLabScore, useLabStore } from '../../store/labStore';
import { useProgress } from '../../store/progressStore';
import { useTopologyStore } from '../../store/topologyStore';

/** LAB mode home: every lab, its lock state, best score and a Start button. */
export default function LabBrowser() {
  const labs = visibleLabs();
  const progress = useProgress((s) => s.progress);
  const loading = useLabStore((s) => s.loading);
  const openLesson = useAppMode((s) => s.openLesson);
  const { fitView } = useReactFlow();

  const start = (lab: Lab) => {
    const t = useTopologyStore.getState().topology;
    if (t.devices.length && !window.confirm(`Start lab ${lab.id}? The canvas will be replaced by the lab topology (save your work first if needed).`))
      return;
    void useLabStore
      .getState()
      .start(lab)
      .then(() => setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80));
  };

  const groupOf = (l: Lab) => `${l.part ?? 'A'}${l.level}`;
  const levels = [...new Set(labs.map(groupOf))];
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-50">
        <FlaskConical className="h-6 w-6 text-sky-400" /> Labs
      </h1>
      <p className="mb-4 text-sm text-slate-400">
        Har lab: railway scenario, tasks with live auto-checks (sirf engine ki asli state se), hints (har hint −2 points), break-fix challenge,
        5-question quiz aur field note. Pehle lesson padho, phir lab karo.
      </p>
      {levels.map((lvl) => {
        const lesson = CURRICULUM.find((c) => c.id === lvl);
        return (
          <section key={lvl} className="mb-5">
            <h2 className="rn-label mb-1.5">
              {lvl}
              {lesson && ` — ${lesson.title}`}
            </h2>
            <ul className="space-y-2">
              {labs
                .filter((l) => groupOf(l) === lvl)
                .map((lab) => {
                  const lock = labLockReason(lab);
                  const p = progress.labs?.[lab.id];
                  return (
                    <li key={lab.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <span className="mt-0.5 w-10 shrink-0 font-mono text-xs text-slate-400">{lab.id}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium text-slate-100">
                          {lab.title}
                          {p?.completed && <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="completed" />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{lab.scenario}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          ~{lab.estMinutes} min · max {maxLabScore(lab)} points
                          {p && ` · best ${p.bestScore}${p.breakFixDone ? ' · break-fix ✓' : ''}${p.quizBest ? ` · quiz ${p.quizBest}/5` : ''}`}
                        </p>
                        {lock && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                            <Lock className="h-3 w-3" /> {lock}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" className="rn-btn-primary" disabled={!!lock || loading} onClick={() => start(lab)}>
                          <Play className="h-3.5 w-3.5" /> {p ? 'Restart' : 'Start'}
                        </button>
                        {lab.lessonId && (
                          <button type="button" className="rn-btn py-0.5 text-xs" onClick={() => openLesson(lab.lessonId!)}>
                            <BookOpen className="h-3.5 w-3.5" /> Lesson {lab.lessonId}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
      <p className="mt-6 text-xs text-slate-500">Part A labs (A4–A15) and IP-MPLS labs B1–B4 are ready; more B-series labs arrive with each phase.</p>
    </div>
  );
}
