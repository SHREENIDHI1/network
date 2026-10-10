import { BookOpen, CheckCircle2, Download, Lock, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CURRICULUM, LESSON_LOADERS, isAvailable } from '../../lessons/curriculum';
import { exportProgress, importProgress, recordQuiz, type Progress } from '../../lessons/progress';
import { useAppMode } from '../../store/appModeStore';
import { useProgress } from '../../store/progressStore';
import type { Lesson, LessonBlock } from '../../lessons/types';
import { useTopologyStore } from '../../store/topologyStore';
import { Diagram } from './diagrams';
import { FlashQuiz } from './FlashQuiz';
import { Widget } from './widgets';

/** LEARN mode: curriculum list + lesson reader + 5-question flash quiz. */
export default function LearnView() {
  const progress = useProgress((s) => s.progress);
  const requested = useAppMode((s) => s.lessonId);
  const [current, setCurrent] = useState(() => (requested && isAvailable(requested) ? requested : 'A0'));
  useEffect(() => {
    if (requested && isAvailable(requested)) setCurrent(requested);
  }, [requested]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useTopologyStore((s) => s.notify);

  useEffect(() => {
    let alive = true;
    setLesson(null);
    setError(null);
    LESSON_LOADERS[current]?.()
      .then((l) => alive && setLesson(l))
      .catch(() => alive && setError('Lesson could not be loaded.'));
    return () => {
      alive = false;
    };
  }, [current]);

  const update = (p: Progress) => {
    useProgress.getState().replace(p);
    if (!useProgress.getState().persisted) notify('info', 'Browser storage is blocked — progress is kept only until you close this tab. Use Export to keep it.');
  };

  const done = CURRICULUM.filter((c) => progress.lessons[c.id]?.completed).length;

  const onExport = () => {
    const blob = new Blob([exportProgress(progress)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'railmpls-lab-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const p = f.size < 1_000_000 ? importProgress(await f.text()) : null;
    if (!p) notify('error', 'Not a RailMPLS Lab progress file.');
    else {
      update(p);
      notify('info', 'Progress imported.');
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950" aria-label="Curriculum">
        <div className="border-b border-slate-800 p-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Progress: {done}/{CURRICULUM.length} lessons
            </span>
            <span className="flex gap-1">
              <button type="button" className="rounded p-1 hover:bg-slate-800" title="Export progress" onClick={onExport}>
                <Download className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-1 hover:bg-slate-800" title="Import progress" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void onImport(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded bg-slate-800">
            <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${(done / CURRICULUM.length) * 100}%` }} />
          </div>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
          {(['A', 'B'] as const).map((part) => (
            <li key={part}>
              <h3 className="rn-label mb-1 mt-2 px-1">{part === 'A' ? 'Part A — Foundations' : 'Part B — IP-MPLS'}</h3>
              <ol>
                {CURRICULUM.filter((c) => c.part === part).map((c) => {
                  const avail = isAvailable(c.id);
                  const p = progress.lessons[c.id];
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!avail}
                        onClick={() => setCurrent(c.id)}
                        title={avail ? undefined : `Arrives in build phase P${c.phase}`}
                        className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left ${
                          current === c.id
                            ? 'bg-sky-900/60 text-white'
                            : avail
                              ? 'text-slate-200 hover:bg-slate-800'
                              : 'cursor-not-allowed text-slate-600'
                        }`}
                      >
                        <span className="w-8 shrink-0 font-mono text-xs leading-5 text-slate-400">{c.id}</span>
                        <span className="flex-1 leading-5">{c.title}</span>
                        {p?.completed ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-label="completed" />
                        ) : !avail ? (
                          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="not yet available" />
                        ) : p ? (
                          <span className="text-[10px] text-slate-400">{p.bestScore}/5</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {error && <p className="p-6 text-red-400">{error}</p>}
        {!lesson && !error && <p className="p-6 text-slate-500">Loading…</p>}
        {lesson && (
          <LessonReader
            key={lesson.id}
            lesson={lesson}
            onQuiz={(score) => update(recordQuiz(progress, lesson.id, score))}
            best={progress.lessons[lesson.id]?.bestScore}
          />
        )}
      </main>
    </div>
  );
}

function LessonReader({ lesson, onQuiz, best }: { lesson: Lesson; onQuiz: (score: number) => void; best?: number }) {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-6 py-6 leading-relaxed">
      <header>
        <p className="text-xs uppercase tracking-wide text-sky-400">
          Lesson {lesson.id} · ~{lesson.estMinutes} min
        </p>
        <h1 className="text-2xl font-semibold text-slate-50">{lesson.title}</h1>
        <p className="mt-1 text-slate-400">{lesson.summary}</p>
      </header>
      {lesson.blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
      <section className="rounded-lg border border-slate-800 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-4 w-4 text-sky-400" /> Glossary
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          {lesson.glossary.map((g) => (
            <div key={g.term} className="contents">
              <dt className="font-semibold text-slate-200">{g.term}</dt>
              <dd className="text-slate-300">
                {g.en} <span className="text-slate-500">— {g.hi}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <FlashQuiz questions={lesson.flash} onFinish={onQuiz} best={best} />
      <section className="rounded-lg border border-slate-800 p-4 text-sm">
        <h2 className="mb-1 text-lg font-semibold">Practice</h2>
        <p className="text-slate-300">{lesson.practice.note}</p>
      </section>
    </article>
  );
}

function Block({ b }: { b: LessonBlock }) {
  switch (b.kind) {
    case 'text':
      return (
        <section>
          {b.heading && <h2 className="mb-1 text-lg font-semibold text-slate-100">{b.heading}</h2>}
          <p className="text-slate-300">{b.body}</p>
        </section>
      );
    case 'analogy':
      return (
        <aside className="rounded-lg border-l-4 border-amber-500 bg-amber-950/30 px-4 py-2 text-slate-200">
          <span className="mr-1 text-xs font-semibold uppercase text-amber-400">Railway analogy</span> {b.body}
        </aside>
      );
    case 'keyterms':
      return (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-slate-900 p-3 text-sm sm:grid-cols-[11rem_1fr]">
          {b.terms.map((t) => (
            <div key={t.term} className="contents">
              <dt className="font-semibold text-sky-300">{t.term}</dt>
              <dd className="text-slate-300">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {b.caption && <caption className="mb-1 text-left text-xs text-slate-400">{b.caption}</caption>}
            <thead>
              <tr>
                {b.headers.map((h) => (
                  <th key={h} className="border border-slate-700 bg-slate-800 px-2 py-1 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-slate-800 px-2 py-1 text-slate-300">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'widget':
      return (
        <figure>
          <Widget id={b.widget} />
          <figcaption className="mt-1 text-xs text-slate-400">{b.caption}</figcaption>
        </figure>
      );
    case 'diagram':
      return (
        <figure className="rounded-lg bg-slate-900 p-3">
          <Diagram id={b.diagram} />
          <figcaption className="mt-1 text-xs text-slate-400">{b.caption}</figcaption>
        </figure>
      );
    case 'note': {
      const style = {
        info: 'border-sky-700 bg-sky-950/40',
        source: 'border-slate-600 bg-slate-900',
        safety: 'border-red-700 bg-red-950/40',
      }[b.tone];
      const label = { info: 'Note', source: 'Source note', safety: 'Safety' }[b.tone];
      return (
        <aside className={`rounded-lg border px-4 py-2 text-sm text-slate-200 ${style}`}>
          <b className="mr-1">{label}:</b>
          {b.body}
        </aside>
      );
    }
  }
}
