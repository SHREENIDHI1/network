import { useReactFlow } from '@xyflow/react';
import { BookOpen, CheckCircle2, FlaskConical, Wrench } from 'lucide-react';
import { CURRICULUM, isAvailable } from '../../lessons/curriculum';
import { dashboardSummary } from '../../lessons/dashboard';
import { LABS, visibleLabs } from '../../labs/registry';
import { useAppMode } from '../../store/appModeStore';
import { maxLabScore, useLabStore } from '../../store/labStore';
import { useProgress } from '../../store/progressStore';
import { useTopologyStore } from '../../store/topologyStore';

/** Learn → Dashboard: lessons, quizzes, labs, points and what to do next (P10). */
export function DashboardPage({ onOpenLesson }: { onOpenLesson: (id: string) => void }) {
  const progress = useProgress((s) => s.progress);
  const { fitView } = useReactFlow();
  const s = dashboardSummary(
    progress,
    CURRICULUM.map((c) => ({ id: c.id, part: c.part, title: c.title, available: isAvailable(c.id) })),
    visibleLabs(LABS).map((l) => ({ id: l.id, title: l.title, lessonId: l.lessonId, maxScore: maxLabScore(l) })),
  );
  const openLab = async (id: string) => {
    const lab = LABS.find((l) => l.id === id);
    if (!lab) return;
    const t = useTopologyStore.getState().topology;
    if (t.devices.length && !window.confirm(`Start lab ${id}? The canvas will be replaced by the lab topology (save your work first if needed).`))
      return;
    await useLabStore.getState().start(lab);
    useAppMode.getState().setMode('lab');
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 120);
  };
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const Tile = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="rn-label">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-100 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
  const Bar = ({ label, done, total }: { label: string; done: number; total: number }) => (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1 h-2 rounded bg-slate-800">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct(done, total)}%` }} />
      </div>
    </div>
  );

  return (
    <article className="mx-auto max-w-5xl px-6 py-6">
      <h1 className="text-2xl font-semibold text-slate-100">Your progress</h1>
      <p className="mt-1 text-sm text-slate-400">Saved in this browser. Use the export button (top left) to keep a copy or move it to another PC.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Lessons" value={`${s.lessons.done}/${s.lessons.total}`} sub={`${pct(s.lessons.done, s.lessons.total)}% of the curriculum`} />
        <Tile
          label="Lesson quizzes"
          value={s.quiz.attempted ? `${s.quiz.average.toFixed(1)}/5` : '—'}
          sub={`${s.quiz.attempted} lesson quiz(zes) taken`}
        />
        <Tile label="Labs" value={`${s.labs.completed}/${s.labs.total}`} sub={`${s.labs.breakFixDone} fault drill(s) closed`} />
        <Tile label="Lab points" value={`${s.labs.points}`} sub={`of ${s.labs.maxPoints} possible (${pct(s.labs.points, s.labs.maxPoints)}%)`} />
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <Bar label="Part A — Foundations" done={s.lessons.byPart.A.done} total={s.lessons.byPart.A.total} />
        <Bar label="Part B — IP-MPLS" done={s.lessons.byPart.B.done} total={s.lessons.byPart.B.total} />
      </div>

      <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
        <p className="rn-label">Next step</p>
        {s.next ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-slate-100">
              {s.next.kind === 'lesson' ? 'Read lesson' : 'Do lab'} <span className="font-mono">{s.next.id}</span> — {s.next.title}
            </p>
            <button
              type="button"
              className="rn-btn-primary"
              onClick={() => (s.next!.kind === 'lesson' ? onOpenLesson(s.next!.id) : void openLab(s.next!.id))}
            >
              {s.next.kind === 'lesson' ? <BookOpen className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />} Start
            </button>
          </div>
        ) : (
          <p className="mt-1 text-emerald-300">Everything is done — replay the grand capstone with another seed for a new exam.</p>
        )}
        <p className="mt-2 text-xs text-slate-400">Order: each lesson first, then the labs that practise it.</p>
      </div>

      <h2 className="mt-6 text-lg font-semibold text-slate-100">Labs</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 font-medium">Lab</th>
            <th className="py-1 font-medium">Title</th>
            <th className="py-1 text-right font-medium">Best / max</th>
            <th className="py-1 text-right font-medium">Quiz</th>
            <th className="py-1 text-center font-medium">Fault drill</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-800/70">
              <td className="py-1 font-mono text-xs text-slate-400">{r.id}</td>
              <td className="py-1 text-slate-200">
                {r.completed && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />}
                {r.title}
              </td>
              <td className="py-1 text-right tabular-nums text-slate-300">
                {r.attempts ? `${r.bestScore} / ${r.maxScore}` : <span className="text-slate-600">— / {r.maxScore}</span>}
              </td>
              <td className="py-1 text-right tabular-nums text-slate-300">{r.attempts ? `${r.quizBest}/5` : '—'}</td>
              <td className="py-1 text-center">
                {r.breakFixDone ? <Wrench className="inline h-3.5 w-3.5 text-emerald-400" /> : <span className="text-slate-600">—</span>}
              </td>
              <td className="py-1 text-right">
                <button type="button" className="rounded px-2 py-0.5 text-xs text-sky-300 hover:bg-slate-800" onClick={() => void openLab(r.id)}>
                  {r.attempts ? 'Retry' : 'Start'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500">
        Scores are RailMPLS Lab training records only — not official Indian Railways, RDSO or IRISET certificates.
      </p>
    </article>
  );
}
