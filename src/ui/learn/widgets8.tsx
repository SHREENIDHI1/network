import { useState } from 'react';
import { alarmLayers, renderForSamples, type Failure } from '../../lessons/widgetMath8';

/** P8 widgets: alarm layering for a failure, template rendering for three devices. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

const FAILURES: Array<[Failure, string]> = [
  ['none', 'No fault'],
  ['fibre-cut', 'Fibre cut PPR–JU'],
  ['card', 'Card failure on PPR'],
  ['power', 'Power failure at PPR'],
  ['ldp', '"mpls ip" missing on PPR'],
];

export function AlarmLayersWidget() {
  const [f, setF] = useState<Failure>('card');
  const a = alarmLayers(f);
  return (
    <Box>
      <div className="flex flex-wrap gap-1 text-xs">
        {FAILURES.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setF(k)}
            className={`rounded border px-2 py-1 ${f === k ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-300'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">JU – PPR – MTD, Data Logger VPWS JU ↔ MTD through PPR.</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {a.map((x) => (
          <li key={x.text} className={x.layer === 'root' ? 'text-red-300' : 'text-amber-200'}>
            <span className="mr-1 font-semibold uppercase">{x.layer === 'root' ? 'root cause' : 'impact'}</span>
            {x.text}
          </li>
        ))}
        {!a.length && <li className="text-emerald-300">Dashboard green.</li>}
      </ul>
      <p className="mt-1 text-xs text-slate-500">Same layering as the NMS tab: fix the root cause, the impact alarms clear.</p>
    </Box>
  );
}

export function TemplateWidget() {
  const [tpl, setTpl] = useState(
    'hostname {{hostname}}\nlogging host 10.80.1.20\nntp source Loopback0\nsnmp-server location {{station}} station\nmpls ldp router-id Loopback0 force',
  );
  const r = renderForSamples(tpl);
  return (
    <Box>
      <textarea className="rn-input h-24 w-full font-mono text-xs" value={tpl} onChange={(e) => setTpl(e.target.value)} spellCheck={false} />
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {r.map((d) => (
          <pre key={d.hostname} className="overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-300">
            {`! ${d.hostname}\n${d.lines.join('\n')}${d.errors.length ? `\n⚠ ${d.errors.join(', ')}` : ''}`}
          </pre>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Variables: {'{{hostname}} {{station}} {{loopback}} {{router_id}}'}. The Automation tab (bottom dock) pushes the result to real devices.
      </p>
    </Box>
  );
}
