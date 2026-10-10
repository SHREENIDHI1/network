import type { DiagramId } from '../../lessons/types';

/** Simple original SVG teaching diagrams (no copied artwork). */
export function Diagram({ id }: { id: DiagramId }) {
  if (id === 'circuit-vs-packet') return <CircuitVsPacket />;
  if (id === 'osi-stack') return <OsiStack />;
  if (id === 'ethernet-frame') return <EthernetFrame />;
  if (id === 'vlan-trunk') return <VlanTrunk />;
  if (id === 'stp-loop') return <StpLoop />;
  if (id === 'router-on-a-stick') return <RouterOnAStick />;
  if (id === 'dhcp-dora') return <Dora />;
  if (id === 'nat-pat') return <NatPat />;
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

function EthernetFrame() {
  const parts: Array<[string, string, number, string]> = [
    ['Preamble+SFD', '8', 70, '#334155'],
    ['Destination MAC', '6', 100, '#0369a1'],
    ['Source MAC', '6', 100, '#0e7490'],
    ['Type', '2', 50, '#4338ca'],
    ['Payload (IP packet)', '46–1500', 150, '#065f46'],
    ['FCS', '4', 50, '#9f1239'],
  ];
  let x = 10;
  return (
    <svg viewBox="0 0 560 110" className="w-full max-w-xl" role="img" aria-label="Ethernet II frame format">
      {parts.map(([n, b, w, c]) => {
        const g = (
          <g key={n}>
            <rect x={x} y={20} width={w - 2} height={44} rx={3} fill={c} />
            <T x={x + w / 2 - 1} y={40} a="middle" s={10} c="#f1f5f9">
              {n}
            </T>
            <T x={x + w / 2 - 1} y={56} a="middle" s={10} c="#cbd5e1">{`${b} B`}</T>
          </g>
        );
        x += w;
        return g;
      })}
      <T x={10} y={88} c="#94a3b8" s={11}>
        Switch reads Destination MAC to forward and Source MAC to learn. FCS (CRC) catches damaged frames.
      </T>
    </svg>
  );
}

function VlanTrunk() {
  return (
    <svg viewBox="0 0 560 190" className="w-full max-w-xl" role="img" aria-label="Access ports and an 802.1Q trunk">
      {[30, 410].map((x, i) => (
        <g key={x}>
          <rect x={x} y={70} width={120} height={46} rx={6} fill="#1e293b" stroke="#38bdf8" />
          <T x={x + 60} y={98} a="middle">
            {i === 0 ? 'MTD-SW1' : 'MTD-SW2'}
          </T>
        </g>
      ))}
      <line x1={150} y1={93} x2={410} y2={93} stroke="#f59e0b" strokeWidth={6} />
      <T x={280} y={84} a="middle" c="#fbbf24" s={11}>
        Trunk Gi0/24 — frames carry an 802.1Q tag
      </T>
      <T x={280} y={112} a="middle" c="#94a3b8" s={10}>
        [VLAN 10] [VLAN 20] [VLAN 40] … native 99 untagged
      </T>
      {[
        [40, 'UTS1 · VLAN 10', '#38bdf8'],
        [100, 'PRS1 · VLAN 20', '#a78bfa'],
      ].map(([x, t, c]) => (
        <g key={String(t)}>
          <line x1={Number(x) + 20} y1={116} x2={Number(x)} y2={160} stroke={String(c)} strokeWidth={2} />
          <T x={Number(x) - 30} y={176} s={10} c={String(c)}>
            {String(t)}
          </T>
        </g>
      ))}
      {[
        [430, 'UTS2 · VLAN 10', '#38bdf8'],
        [500, 'CAM1 · VLAN 40', '#34d399'],
      ].map(([x, t, c]) => (
        <g key={String(t)}>
          <line x1={Number(x)} y1={116} x2={Number(x)} y2={160} stroke={String(c)} strokeWidth={2} />
          <T x={Number(x) - 40} y={176} s={10} c={String(c)}>
            {String(t)}
          </T>
        </g>
      ))}
      <T x={10} y={20} c="#94a3b8" s={11}>
        Access ports (thin lines): one VLAN, no tag. Trunk (thick): many VLANs, tagged.
      </T>
    </svg>
  );
}

function StpLoop() {
  const pos = { core: [280, 40], cnt: [120, 160], plat: [440, 160] } as const;
  const node = (k: keyof typeof pos, label: string, root = false) => (
    <g key={k}>
      <rect
        x={pos[k][0] - 60}
        y={pos[k][1] - 20}
        width={120}
        height={40}
        rx={6}
        fill="#1e293b"
        stroke={root ? '#34d399' : '#38bdf8'}
        strokeWidth={root ? 2 : 1}
      />
      <T x={pos[k][0]} y={pos[k][1] + 4} a="middle">
        {label}
      </T>
    </g>
  );
  return (
    <svg viewBox="0 0 560 210" className="w-full max-w-xl" role="img" aria-label="Spanning tree blocks one link of a triangle">
      <line x1={280} y1={60} x2={120} y2={140} stroke="#38bdf8" strokeWidth={3} />
      <line x1={280} y1={60} x2={440} y2={140} stroke="#38bdf8" strokeWidth={3} />
      <line x1={180} y1={160} x2={380} y2={160} stroke="#f87171" strokeWidth={3} strokeDasharray="8 6" />
      <T x={280} y={152} a="middle" c="#fca5a5" s={11}>
        blocked (alternate port)
      </T>
      {node('core', 'CORE (root)', true)}
      {node('cnt', 'COUNTER')}
      {node('plat', 'PLATFORM')}
      <T x={10} y={204} c="#94a3b8" s={11}>
        A triangle is a loop. STP keeps every switch reachable from the root and blocks one port so frames cannot circle.
      </T>
    </svg>
  );
}

function RouterOnAStick() {
  return (
    <svg viewBox="0 0 560 210" className="w-full max-w-xl" role="img" aria-label="Router on a stick">
      <rect x={220} y={10} width={120} height={40} rx={6} fill="#1e293b" stroke="#a78bfa" />
      <T x={280} y={34} a="middle">
        MTD-R1
      </T>
      <T x={350} y={24} s={10} c="#c4b5fd">
        Gi0/0.10 10.52.10.1 (VLAN 10)
      </T>
      <T x={350} y={38} s={10} c="#c4b5fd">
        Gi0/0.20 10.52.20.1 (VLAN 20)
      </T>
      <line x1={280} y1={50} x2={280} y2={100} stroke="#f59e0b" strokeWidth={6} />
      <T x={290} y={80} s={10} c="#fbbf24">
        one trunk, both VLANs tagged
      </T>
      <rect x={220} y={100} width={120} height={40} rx={6} fill="#1e293b" stroke="#38bdf8" />
      <T x={280} y={124} a="middle">
        MTD-SW1
      </T>
      <line x1={240} y1={140} x2={140} y2={180} stroke="#38bdf8" strokeWidth={2} />
      <line x1={320} y1={140} x2={420} y2={180} stroke="#a78bfa" strokeWidth={2} />
      <T x={70} y={198} s={11} c="#38bdf8">
        UTS1 VLAN 10, gw .10.1
      </T>
      <T x={360} y={198} s={11} c="#a78bfa">
        PRS1 VLAN 20, gw .20.1
      </T>
    </svg>
  );
}

function Dora() {
  const steps: Array<[string, string, boolean]> = [
    ['DISCOVER', 'broadcast: koi DHCP server hai?', true],
    ['OFFER', 'server: 10.52.10.50 le lo', false],
    ['REQUEST', 'broadcast: mujhe 10.52.10.50 chahiye', true],
    ['ACK', 'server: pakka, 1 din ke liye (gw, DNS bhi)', false],
  ];
  return (
    <svg viewBox="0 0 560 230" className="w-full max-w-xl" role="img" aria-label="DHCP DORA">
      <T x={60} y={20} a="middle">
        Client (UTS)
      </T>
      <T x={480} y={20} a="middle">
        DHCP server
      </T>
      <line x1={60} y1={30} x2={60} y2={220} stroke="#475569" />
      <line x1={480} y1={30} x2={480} y2={220} stroke="#475569" />
      {steps.map(([n, t, toServer], i) => {
        const y = 60 + i * 45;
        return (
          <g key={n}>
            <line x1={toServer ? 60 : 480} y1={y} x2={toServer ? 470 : 70} y2={y} stroke="#38bdf8" strokeWidth={2} markerEnd="url(#arr)" />
            <T x={270} y={y - 6} a="middle" c="#fbbf24">
              {n}
            </T>
            <T x={270} y={y + 14} a="middle" s={10} c="#94a3b8">
              {t}
            </T>
          </g>
        );
      })}
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#38bdf8" />
        </marker>
      </defs>
    </svg>
  );
}

function NatPat() {
  const rows = [
    ['10.52.50.11:1025', '203.0.113.2:1025'],
    ['10.52.50.12:1025', '203.0.113.2:1026'],
    ['10.52.50.13:2048', '203.0.113.2:2048'],
  ];
  return (
    <svg viewBox="0 0 560 170" className="w-full max-w-xl" role="img" aria-label="NAT overload">
      <T x={10} y={18} c="#94a3b8">
        Inside (private, Railnet PCs)
      </T>
      <T x={380} y={18} c="#94a3b8">
        Outside (one public IP)
      </T>
      <rect x={200} y={40} width={150} height={100} rx={6} fill="#1e293b" stroke="#f59e0b" />
      <T x={275} y={60} a="middle" c="#fbbf24">
        JU-FW (PAT)
      </T>
      {rows.map(([a, b], i) => (
        <g key={a}>
          <T x={10} y={80 + i * 22} s={11} c="#7dd3fc">
            {a}
          </T>
          <line x1={140} y1={76 + i * 22} x2={205} y2={76 + i * 22} stroke="#38bdf8" />
          <line x1={345} y1={76 + i * 22} x2={380} y2={76 + i * 22} stroke="#34d399" />
          <T x={385} y={80 + i * 22} s={11} c="#6ee7b7">
            {b}
          </T>
        </g>
      ))}
      <T x={10} y={162} c="#64748b" s={10}>
        Many inside hosts share one outside address; the port number keeps the sessions apart.
      </T>
    </svg>
  );
}
