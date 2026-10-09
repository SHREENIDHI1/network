import { FlaskConical } from 'lucide-react';
import { CURRICULUM } from '../../lessons/curriculum';
import { LABS } from '../../labs/registry';
import { useAppMode } from '../../store/appModeStore';

/** LAB mode placeholder until auto-checked labs ship (from P2). */
export default function LabPlaceholder() {
  const setMode = useAppMode((s) => s.setMode);
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-slate-300">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold text-slate-50">
        <FlaskConical className="h-6 w-6 text-sky-400" /> Labs
      </h1>
      <p>
        Auto-checked labs build phase <b>P2</b> se aayenge (abhi {LABS.length} labs registered hain). Har lab ek lesson se juda hoga, ek task dega aur
        simulator ki computed state se check karega — koi fake output nahi.
      </p>
      <p className="mt-3">Tab tak:</p>
      <ul className="ml-5 mt-1 list-disc space-y-1">
        <li>
          <button type="button" className="text-sky-300 underline" onClick={() => setMode('learn')}>
            Learn
          </button>{' '}
          mode mein lessons A0–A3 padho aur flash quiz do.
        </li>
        <li>
          <button type="button" className="text-sky-300 underline" onClick={() => setMode('sandbox')}>
            Sandbox
          </button>{' '}
          mein devices jodo, CLI chalao, ping karo.
        </li>
      </ul>
      <h2 className="mb-1 mt-6 text-sm font-semibold uppercase text-slate-400">Planned labs by phase</h2>
      <ul className="text-sm text-slate-400">
        {[2, 3, 4, 5, 6, 7, 8, 9].map((ph) => (
          <li key={ph}>
            P{ph}:{' '}
            {CURRICULUM.filter((c) => c.phase === ph)
              .map((c) => c.id)
              .join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
