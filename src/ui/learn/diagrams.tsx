import type { DiagramId } from '../../lessons/types';

/** Simple original SVG teaching diagrams (no copied artwork). */
export function Diagram({ id }: { id: DiagramId }) {
  if (id === 'circuit-vs-packet') return <CircuitVsPacket />;
  if (id === 'osi-stack') return <OsiStack />;
  return <FibreVsCopper />;
}

const T = ({
  x,
  y,
  children,
  c = '#cbd5e1',
  s = 12,
  a = 'start',
}: {
  x: number;
  y: number;
  children: string;
  c?: string;
  s?: number;
  a?: 'start' | 'middle' | 'end';
}) => (
  <text x={x} y={y} fill={c} fontSize={s} textAnchor={a} fontFamily="ui-sans-serif, system-ui">
    {children}
  </text>
);

function CircuitVsPacket() {
  const users = ['#38bdf8', '#f59e0b', '#a78bfa'];
  return (
    <svg viewBox="0 0 560 220" className="w-full max-w-xl" role="img" aria-label="Circuit vs packet switching">
      <T x={10} y={18} c="#94a3b8">
        Circuit switching: each user owns a fixed slot, even when silent
      </T>
      {users.map((c, i) => (
        <g key={c}>
          <rect x={10} y={28 + i * 18} width={520} height={14} rx={3} fill="#1e293b" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
            const active = (k + i) % 3 !== 0;
            return (
              <rect
                key={k}
                x={12 + k * 65}
                y={30 + i * 18}
                width={60}
                height={10}
                rx={2}
                fill={active ? c : 'none'}
                stroke={c}
                strokeDasharray={active ? undefined : '3 3'}
              />
            );
          })}
        </g>
      ))}
      <T x={10} y={110} c="#64748b" s={11}>
        Dashed = reserved but idle (wasted)
      </T>
      <T x={10} y={140} c="#94a3b8">
        Packet switching: packets share one link, gaps are filled
      </T>
      <rect x={10} y={150} width={520} height={24} rx={3} fill="#1e293b" />
      {Array.from({ length: 16 }, (_, k) => (
        <rect key={k} x={13 + k * 32.4} y={154} width={29} height={16} rx={2} fill={users[(k * 7) % 3]} />
      ))}
      <T x={10} y={200} c="#64748b" s={11}>
        Same link capacity carries more useful traffic
      </T>
    </svg>
  );
}

function OsiStack() {
  const osi = ['7 Application', '6 Presentation', '5 Session', '4 Transport', '3 Network', '2 Data link', '1 Physical'];
  const tcpip: Array<[string, number, number]> = [
    ['Application', 0, 3],
    ['Transport', 3, 1],
    ['Internet', 4, 1],
    ['Link', 5, 2],
  ];
  const h = 26;
  return (
    <svg viewBox="0 0 520 210" className="w-full max-w-lg" role="img" aria-label="OSI and TCP/IP layers">
      <T x={10} y={14} c="#94a3b8">
        OSI
      </T>
      <T x={300} y={14} c="#94a3b8">
        TCP/IP
      </T>
      {osi.map((n, i) => (
        <g key={n}>
          <rect x={10} y={20 + i * h} width={200} height={h - 3} rx={3} fill="#1e293b" stroke="#334155" />
          <T x={20} y={36 + i * h}>
            {n}
          </T>
        </g>
      ))}
      {tcpip.map(([n, start, span]) => (
        <g key={n}>
          <rect x={300} y={20 + start * h} width={200} height={span * h - 3} rx={3} fill="#0c4a6e" stroke="#0369a1" />
          <T x={400} y={20 + start * h + (span * h) / 2 + 4} a="middle">
            {n}
          </T>
        </g>
      ))}
      <line x1={215} y1={20 + 5 * h - 1.5} x2={295} y2={20 + 5 * h - 1.5} stroke="#f59e0b" strokeWidth={3} />
      <T x={255} y={20 + 5 * h - 6} c="#f59e0b" s={11} a="middle">
        MPLS (2.5)
      </T>
    </svg>
  );
}

function FibreVsCopper() {
  return (
    <svg viewBox="0 0 560 170" className="w-full max-w-xl" role="img" aria-label="Copper vs fibre">
      <T x={10} y={18} c="#94a3b8">
        Copper (Cat6): electrical signal on twisted pairs, 100 m per Ethernet segment
      </T>
      <path d="M10 50 Q 40 30 70 50 T 130 50 T 190 50 T 250 50" stroke="#f59e0b" strokeWidth={3} fill="none" />
      <path d="M10 50 Q 40 70 70 50 T 130 50 T 190 50 T 250 50" stroke="#fb923c" strokeWidth={3} fill="none" />
      <T x={260} y={55} c="#fca5a5" s={11}>
        OHE / lightning can induce noise
      </T>
      <T x={10} y={100} c="#94a3b8">
        Single-mode fibre: light in a ~9 µm core, tens of km per span
      </T>
      <rect x={10} y={115} width={520} height={30} rx={15} fill="#1e293b" stroke="#334155" />
      <rect x={10} y={127} width={520} height={6} fill="#0ea5e9" opacity={0.35} />
      <path d="M20 130 L 520 130" stroke="#38bdf8" strokeWidth={2} strokeDasharray="10 6" />
      <T x={270} y={162} c="#64748b" s={11} a="middle">
        cladding · core · cladding — immune to electrical interference
      </T>
    </svg>
  );
}
