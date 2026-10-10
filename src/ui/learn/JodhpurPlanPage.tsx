import { useMemo, useState } from 'react';
import { checkReport, j2Length, JODHPUR, sectionsOf, station } from '../../topologies/data/jodhpur';
import {
  BOUNDARIES,
  ipPlan,
  LSR_SITES,
  planOverlaps,
  planSpans,
  RR_SITES,
  sectionArea,
  siteRole,
  type IpPlanRow,
} from '../../topologies/jodhpur/plan';

/** Jodhpur division design: sites and roles, spans, OSPF areas and the generated IP plan with an overlap check. */
export function JodhpurPlanPage() {
  const plan = useMemo(() => ipPlan(), []);
  const overlaps = useMemo(() => planOverlaps(plan.rows), [plan]);
  const spans = useMemo(() => planSpans(), []);
  const [tab, setTab] = useState<'sites' | 'spans' | 'ip'>('sites');
  const [q, setQ] = useState('');
  const j2 = j2Length();
  const n = q.trim().toLowerCase();
  const rows: IpPlanRow[] = plan.rows.filter((r) => !n || `${r.what} ${r.prefix} ${r.site ?? ''}`.toLowerCase().includes(n));

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 text-sm">
      <h1 className="mb-1 text-2xl font-semibold text-slate-50">Jodhpur division — design &amp; IP plan</h1>
      <p className="mb-3 text-slate-400">
        Generated from <code>jodhpurDivision.json</code> (the track map). This is a teaching design: OFC is assumed to run along the track, which is
        not the real RailTel / NWR network. {checkReport().length} data item(s) are still marked “check”.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Stations (POPs)" value={JODHPUR.stations.length} />
        <Stat label="LSR sites" value={LSR_SITES.length} />
        <Stat label="Spans" value={spans.length} />
        <Stat label="IP plan overlaps" value={overlaps.length} good={overlaps.length === 0} />
      </div>
      <ul className="mb-3 list-disc pl-5 text-slate-300">
        <li>LSR (NEON-LSR) at {LSR_SITES.join(', ')}; LER (NEON-LER) at stations; uCPE at halts (design choice).</li>
        <li>Route reflector pair: {RR_SITES.join(' + ')} (Phase 5). NMS, firewall and Railnet internet breakout at JU.</li>
        <li>
          Division boundaries:{' '}
          {Object.entries(BOUNDARIES)
            .map(([c, d]) => `${c} → ${d}`)
            .join(', ')}
          .
        </li>
        <li>
          OSPF: area 0 = JU–MTD trunk (S1), MTD–DNA (S2), JU–LN and the short branches; North = area 1, Central = 2, West = 3, East = 4. Every board
          touches area 0 at a junction ABR (MTD, DNA, RKB, LN).
        </li>
        <li>
          Single-homed (no second path inside the division): PPR–BARA, MTD–MEC, BME–MBF, PLC–JSM and every section towards a boundary. Options: dual
          fibre on a diverse route, ring closure over the adjacent division, or radio backup.
        </li>
        <li>
          J2 (JU–MTD–DNA–FL) from map chainage: {j2.total} km (CAMTECH case study ~256.5 km; MTD–DNA {j2.mtdDna} km vs handbook 43.5 km — map value
          used).
        </li>
      </ul>
      <div role="tablist" className="mb-2 flex gap-1 text-xs">
        {(
          [
            ['sites', 'Sites'],
            ['spans', 'Spans'],
            ['ip', 'IP plan'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`rounded px-3 py-1 ${tab === id ? 'bg-sky-800 text-white' : 'bg-slate-800 text-slate-300'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'sites' && (
        <Table
          headers={['Code', 'Station', 'Role', 'Sections', 'Loopback0']}
          rows={JODHPUR.stations.map((s) => [
            s.code,
            `${s.name}${s.confidence === 'check' ? ' (check)' : ''}`,
            siteRole(s.code),
            sectionsOf(s.code)
              .map((x) => x.id)
              .join(', '),
            plan.loopbacks.get(s.code) ?? '—',
          ])}
        />
      )}
      {tab === 'spans' && (
        <Table
          headers={['Section', 'Span', 'km', 'OSPF area (J4)', 'P2P /31']}
          rows={spans.map((s) => {
            const sec = JODHPUR.sections.find((x) => x.id === s.section)!;
            const p = plan.p2p.get(`${s.section}:${s.index}`)!;
            const area = ['S1', 'S2', 'S11A', 'S11B'].includes(s.section) ? 0 : sectionArea(sec);
            return [
              s.section,
              `${station(s.a)?.name ?? s.a} – ${station(s.b)?.name ?? s.b}`,
              `${s.km}${s.estimated ? ' (est.)' : ''}`,
              String(area),
              `${p[0]} – ${p[1]}`,
            ];
          })}
        />
      )}
      {tab === 'ip' && (
        <>
          <input
            className="rn-input mb-2 w-full"
            placeholder="Search (station code, VRF, prefix…)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="mb-2 text-xs text-slate-400">
            Loopbacks 10.0.&lt;section&gt;.&lt;position&gt;/32 · span links 10.255.&lt;section&gt;.x/31 · J1 express links 10.254.0.x/31 · per-station
            VRF blocks 10.&lt;100+VRF&gt;.&lt;station no&gt;.0/24.{' '}
            {overlaps.length ? `Overlaps: ${overlaps.join('; ')}` : 'Checked: no overlapping prefixes.'}
          </p>
          <Table headers={['Kind', 'What', 'Prefix']} rows={rows.slice(0, 400).map((r) => [r.kind, r.what, r.prefix])} />
          {rows.length > 400 && <p className="mt-1 text-xs text-slate-500">Showing 400 of {rows.length} — search to narrow.</p>}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: number; good?: boolean }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-2">
      <div className={`text-xl font-semibold ${good === undefined ? 'text-slate-100' : good ? 'text-emerald-300' : 'text-red-300'}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="border-b border-slate-700 py-1 pr-3 text-left font-medium text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-800/60">
              {r.map((c, j) => (
                <td key={j} className="py-0.5 pr-3 font-mono text-slate-200">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
