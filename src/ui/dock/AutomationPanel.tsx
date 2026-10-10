import { useMemo, useState } from 'react';
import {
  compliance,
  pushConfig,
  renderTemplate,
  TEMPLATE_VARS,
  templateVars,
  type ComplianceRow,
  type PushResult,
} from '../../engine/automation/automation';
import { roleOf } from '../../engine/config/netConfig';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';

const DEFAULT_TEMPLATE = `! RailMPLS Lab automation template — one IOS config line per row
logging host 10.80.1.20
snmp-server community RAILNMS-RO ro
snmp-server host 10.80.1.20 version 2c RAILNMS-RO
snmp-server enable traps
ntp server 10.80.1.30`;

const DEFAULT_RULES = `^logging host 10\\.80\\.1\\.20$
^snmp-server community RAILNMS-RO RO$
^ntp server 10\\.80\\.1\\.30$`;

/** Automation tab: render a template per device, push it through the CLI, and check compliance (Ansible-like teaching tool). */
export default function AutomationPanel() {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const topology = useTopologyStore((s) => s.topology);
  const devices = useMemo(() => topology.devices.filter((d) => ['router', 'l3switch', 'switch'].includes(roleOf(d.kind))), [topology]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [preview, setPreview] = useState<Array<{ name: string; lines: string[]; errors: string[] }> | null>(null);
  const [push, setPush] = useState<PushResult[] | null>(null);
  const [comp, setComp] = useState<{ rows: ComplianceRow[]; errors: string[] } | null>(null);
  const chosen = devices.filter((d) => sel.has(d.id));
  const render = () => chosen.map((d) => ({ d, ...renderTemplate(tpl, templateVars(sim, d)) }));

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-auto p-2 text-xs">
      <section className="w-48 shrink-0">
        <h3 className="rn-label mb-1">Inventory</h3>
        <div className="mb-1 flex gap-1">
          <button type="button" className="rounded border border-slate-700 px-1.5" onClick={() => setSel(new Set(devices.map((d) => d.id)))}>
            all
          </button>
          <button type="button" className="rounded border border-slate-700 px-1.5" onClick={() => setSel(new Set())}>
            none
          </button>
        </div>
        <ul className="max-h-48 overflow-y-auto">
          {devices.map((d) => (
            <li key={d.id}>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={sel.has(d.id)}
                  onChange={(e) => {
                    const n = new Set(sel);
                    if (e.target.checked) n.add(d.id);
                    else n.delete(d.id);
                    setSel(n);
                  }}
                />
                {d.name}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="min-w-[20rem] flex-1">
        <h3 className="rn-label mb-1">Template (variables: {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(' ')})</h3>
        <textarea className="rn-input h-28 w-full font-mono" value={tpl} onChange={(e) => setTpl(e.target.value)} spellCheck={false} />
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            className="rn-btn"
            disabled={!chosen.length}
            onClick={() => setPreview(render().map((r) => ({ name: r.d.name, lines: r.lines, errors: r.errors })))}
          >
            Preview
          </button>
          <button
            type="button"
            className="rn-btn"
            disabled={!chosen.length}
            onClick={() => {
              const r = render();
              const bad = r.filter((x) => x.errors.length);
              if (bad.length) {
                setPreview(r.map((x) => ({ name: x.d.name, lines: x.lines, errors: x.errors })));
                return;
              }
              const res = pushConfig(
                useTopologyStore.getState().topology,
                sim,
                r.map((x) => ({ deviceId: x.d.id, lines: x.lines })),
              );
              useTopologyStore.getState().applyTopology(res.topology);
              setPush(res.results);
            }}
          >
            Push
          </button>
        </div>
        {preview && (
          <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-900 p-1 font-mono text-[11px] text-slate-300">
            {preview.map((p) => `! ${p.name}${p.errors.length ? `  ⚠ ${p.errors.join(', ')}` : ''}\n${p.lines.join('\n')}`).join('\n')}
          </pre>
        )}
        {push && (
          <ul className="mt-1">
            {push.map((p) => (
              <li key={p.device} className={p.ok ? 'text-emerald-300' : 'text-red-300'}>
                {p.device}: {p.ok ? 'ok' : p.errors.join('; ')}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-[20rem] flex-1">
        <h3 className="rn-label mb-1">Compliance rules (regex per running-config line; "!" = must not exist)</h3>
        <textarea className="rn-input h-28 w-full font-mono" value={rules} onChange={(e) => setRules(e.target.value)} spellCheck={false} />
        <button
          type="button"
          className="rn-btn mt-1"
          disabled={!chosen.length}
          onClick={() =>
            setComp(
              compliance(
                sim,
                chosen.map((d) => d.id),
                rules.split('\n'),
              ),
            )
          }
        >
          Check compliance
        </button>
        {comp && (
          <table className="mt-1 w-full">
            <tbody>
              {comp.rows.map((r) => (
                <tr key={r.device} className="border-t border-slate-800">
                  <td className="pr-2">{r.device}</td>
                  {r.results.map((x) => (
                    <td key={x.rule} title={x.rule} className={x.pass ? 'text-emerald-300' : 'text-red-400'}>
                      {x.pass ? '✓' : '✗'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {comp?.errors.map((e) => (
          <p key={e} className="text-amber-300">
            {e}
          </p>
        ))}
        <p className="mt-1 text-slate-500">
          Teaching tool (Ansible-like): lines are pushed through the same CLI you type; errors are shown per device.
        </p>
      </section>
    </div>
  );
}
