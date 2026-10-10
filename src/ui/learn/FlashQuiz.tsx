import { useState } from 'react';
import type { FlashQuestion } from '../../lessons/types';

/** 5-question quiz with instant feedback (lessons and labs). */
export function FlashQuiz({ questions, onFinish, best, title = 'Flash quiz (5)' }: { questions: FlashQuestion[]; onFinish: (score: number) => void; best?: number; title?: string }) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const score = answers.filter((a, i) => a === questions[i].correctIndex).length;
  return (
    <section className="rounded-lg border border-sky-900 p-4">
      <h2 className="mb-2 text-lg font-semibold">
        {title} {best !== undefined && <span className="text-sm font-normal text-slate-400">· best {best}/5</span>}
      </h2>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={i}>
            <p className="font-medium text-slate-100">
              {i + 1}. {q.prompt}
            </p>
            <div className="mt-1 grid gap-1">
              {q.options.map((o, j) => {
                const chosen = answers[i] === j;
                const right = submitted && j === q.correctIndex;
                const wrong = submitted && chosen && j !== q.correctIndex;
                return (
                  <label
                    key={j}
                    className={`flex cursor-pointer items-start gap-2 rounded border px-2 py-1 text-sm ${
                      right
                        ? 'border-emerald-600 bg-emerald-950/50'
                        : wrong
                          ? 'border-red-700 bg-red-950/50'
                          : chosen
                            ? 'border-sky-600'
                            : 'border-slate-800 hover:bg-slate-900'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q${i}`}
                      className="mt-1"
                      checked={chosen}
                      disabled={submitted}
                      onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
            {submitted && <p className="mt-1 text-xs text-slate-400">{q.explanation}</p>}
            {'kind' in q && q.kind === 'practical' && !submitted && <p className="mt-1 text-xs text-sky-300">Practical: check this in the simulator before answering.</p>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            className="rn-btn-primary"
            disabled={answers.some((a) => a === null)}
            onClick={() => {
              setSubmitted(true);
              onFinish(score);
            }}
          >
            Check answers
          </button>
        ) : (
          <>
            <span className={score >= 4 ? 'text-emerald-300' : 'text-yellow-300'}>
              Score {score}/5 {score >= 4 ? '— lesson complete ✓' : '— 4/5 chahiye complete karne ke liye'}
            </span>
            <button
              type="button"
              className="rn-btn"
              onClick={() => {
                setAnswers(questions.map(() => null));
                setSubmitted(false);
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
