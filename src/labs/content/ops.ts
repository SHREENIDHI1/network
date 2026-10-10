import { configure } from '../../engine/testing/fixtures';
import { updateDevice } from '../../model/topologyOps';
import { ASN, lo } from '../../topologies/bgpLabs';
import { hostname } from '../../topologies/jodhpur/plan';
import { JP, NMS_IP, OPS_LSRS, POLL } from '../../topologies/opsLabs';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * Operations & NMS, Automation and Inter-division hand-off labs for lessons
 * B11–B13 (build phase P8). Checks read engine state only.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const PPR = hostname('PPR');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const FL = hostname('FL');
const NMS_MODS: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'l2vpn', 'faults', 'nms'];

const baseline = [
  `logging host ${NMS_IP}`,
  `snmp-server community ${POLL} ro`,
  `snmp-server host ${NMS_IP} version 2c ${POLL}`,
  'snmp-server enable traps',
];
const BASELINE_RULES = [
  '^logging host 10\\.80\\.1\\.20$',
  `^snmp-server community ${POLL} RO$`,
  `^snmp-server host 10\\.80\\.1\\.20 version 2c ${POLL}$`,
  '^snmp-server enable traps$',
];

// ---------------------------------------------------------------------------
// LB11.1 NMS drill (B11)
// ---------------------------------------------------------------------------

const b11: Lab = {
  id: 'LB11.1',
  part: 'B',
  level: 11,
  order: 1,
  lessonId: 'B11',
  title: 'NMS drill: manage every LSR and clear the Data Logger outage',
  scenario:
    'Raat ki shift. JU NOC ke NMS par MTD Data Logger ka safety circuit (VPWS) DOWN dikha raha hai. Do LSRs (PPR, DNA) NMS par "not managed" hain — unka haal dikhta hi nahi. Kaam: (1) PPR aur DNA ko NMS ke under laao (SNMP community, trap host, syslog), (2) NMS ke root-cause list se asli fault dhoondh kar theek karo, (3) dashboard saaf ho — koi critical/major alarm nahi.',
  concept:
    'NMS sirf wahi dekhta hai jo use dikhaya jaaye: router par SNMP community (NMS ki polling community) aur NMS se router tak raasta. Traps aur syslog router khud NMS ko bhejta hai.\n' +
    'Alarm do tarah ke: ROOT CAUSE (power, card, link, OSPF, LDP — neeche ki layers) aur IMPACT (PW, BGP, TE, service — upar ki layers). Ek root cause se kai impact alarms aate hain; operator pehle root cause theek karta hai.\n' +
    'Railway analogy: NMS = section control board. Jis station ka phone hi nahi juda (not managed) uska haal control ko nahi dikhta; ek point failure (root) se kai trains late (impact).',
  objectives: ['Every LSR managed by the NMS', 'Root cause found from the NMS and fixed', 'All railway services UP, no critical/major alarms'],
  topologyId: 'lab-b11-nms',
  requiredModules: NMS_MODS,
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['NMS server', `JU-NMS ${NMS_IP}, SNMP polling community ${POLL}`],
      ['Already managed', 'JU-LSR, MTD-LSR'],
      ['Baseline per router', baseline.join(' · ')],
      ['Services watched', 'UTS MTD → JU DC, CCTV DNA → JU NVR, Data Logger MTD ↔ JU (VPWS, safety)'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Every LSR (JU, PPR, MTD, DNA) is managed by the NMS.', check: C.all(...OPS_LSRS.map((d) => C.nmsManaged(d))), points: 20 },
    { id: 't2', text: 'All railway services on the NMS are UP.', check: C.allServicesUp(), points: 25 },
    { id: 't3', text: 'The NMS shows no critical or major alarm.', check: C.nmsNoAlarms(), points: 15 },
  ],
  hints: [
    [`On PPR-LSR and DNA-LSR: ${baseline.join(' → ')}`, 'NMS tab (bottom dock): the device list shows managed / unreachable / not managed.'],
    [
      'NMS tab → "Probable root causes": read the LDP-DOWN alarm. Which router at the other end of that link has no MPLS?',
      'On PPR-LSR: interface te0/0/0 → mpls ip. "show mpls ldp neighbor" on JU-LSR should then list PPR.',
    ],
    ['Impact alarms (PW-DOWN, SERVICE-DOWN) clear by themselves once the root cause is fixed.'],
  ],
  breakFix: {
    complaint: 'NOC JU: "MTD aur DNA ke saare services ek saath DOWN. PPR par alarm LEDs jal rahe hain — field staff ne line card ka report diya."',
    apply: (t) => updateDevice(t, t.devices.find((d) => d.name === PPR)!.id, { fault: { cards: ['Te0/0/'] } }),
    check: C.all(C.allServicesUp(), C.nmsNoAlarms()),
    hints: [
      'NMS tab: CARD-FAIL on PPR-LSR is the root cause; the LINK-DOWN, unreachable nodes and service alarms follow from it.',
      'Select PPR-LSR → Fault injection → Repair card Te0/0/x.',
    ],
    fix: { repair: [PPR] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'What does the NMS need to manage a router?',
      options: ['Only its name', 'An SNMP community matching the NMS polling community, and a path from the NMS', 'A console cable', 'BGP'],
      correctIndex: 1,
      explanation: 'Without SNMP access or reachability the device is "not managed" or "unreachable".',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'A card failure on a P router raises LINK-DOWN, PW-DOWN and SERVICE-DOWN alarms. What do you fix first?',
      options: ['The service', 'The pseudowire', 'The root cause: the card', 'Clear all alarms'],
      correctIndex: 2,
      explanation: 'Impact alarms clear when the root cause is fixed.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'SNMP traps vs polling?',
      options: [
        'Same thing',
        'Traps: the router reports events itself; polling: the NMS asks periodically',
        'Traps are encrypted',
        'Polling uses syslog',
      ],
      correctIndex: 1,
      explanation: 'Both are used: traps for speed, polling for state and counters.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why is a PW-DOWN alarm not a root cause by itself?',
      options: [
        'It is never important',
        'A pseudowire rides on LSPs and links — its failure is usually caused by a lower layer',
        'PWs never fail',
        'It is a warning',
      ],
      correctIndex: 1,
      explanation: 'Look below it: LDP, IGP, links, cards, power.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, how many devices does the NMS tab show as managed?',
      options: ['2', '3', '4', '7'],
      correctIndex: 2,
      explanation: 'JU, PPR, MTD and DNA — hosts are not SNMP-managed here.',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: the NMS view is computed from simulator state (no SNMP polling cycle, MIB walk or trap storm); correlation is rule-based by layer. Real NMSs use topology-aware correlation and timers.\nInterview questions: "Root cause vs symptom alarm?", "SNMP trap vs poll?", "Router not managed — kya check karoge?"',
  solution: {
    cli: {
      [PPR]: [...CONF, ...baseline, 'interface te0/0/0', 'mpls ip', 'end'],
      [DNA]: [...CONF, ...baseline, 'end'],
    },
  },
};

// ---------------------------------------------------------------------------
// LB12.1 Automation: management baseline (B12)
// ---------------------------------------------------------------------------

const b12: Lab = {
  id: 'LB12.1',
  part: 'B',
  level: 12,
  order: 1,
  lessonId: 'B12',
  title: 'Automation: push the management baseline and fix drift',
  scenario:
    'Division ka naya NMS JU par lag gaya hai, par chaaron LSRs par management config nahi hai aur DNA par purana "public" SNMP community ab bhi khula hai. 150+ POPs par haath se config karna galtiyon ka ghar hai. Kaam: Automation tab mein ek template banao (syslog, SNMP, traps, NTP), chaaron par push karo, compliance check karo, aur DNA ka insecure community hatao.',
  concept:
    'Automation ka matlab: ek baar likho (template + variables), sab par same tarike se lagao, aur baad mein check karo ki koi badla to nahi (compliance / drift).\n' +
    'Template mein per-device variables: {{hostname}}, {{loopback}}, {{station}}. Compliance rule = "running-config mein yeh line honi chahiye" (ya "!" = nahi honi chahiye).\n' +
    'Asli duniya mein: Ansible/Nornir (SSH par CLI), NETCONF/RESTCONF + YANG models, golden config. Yahan RailMPLS Lab ka chhota teaching tool hai jo wahi CLI chalata hai jo aap type karte.\n' +
    'Railway analogy: template = standard station working rule (SWR) ka format — har station par same dhaancha, sirf station ka naam/code alag.',
  objectives: ['Template with the management baseline', 'Pushed to all four LSRs; NMS manages them', 'Insecure community removed; compliance green'],
  topologyId: 'lab-b12-auto',
  requiredModules: NMS_MODS,
  plan: {
    headers: ['Baseline line', 'Why'],
    rows: [
      [`logging host ${NMS_IP}`, 'Syslog to the NMS'],
      [`snmp-server community ${POLL} ro`, 'NMS polling (read-only)'],
      [`snmp-server host ${NMS_IP} version 2c ${POLL}`, 'Traps to the NMS'],
      ['snmp-server enable traps', 'Send traps'],
      [`ntp server ${lo('JU')} (not on JU itself)`, 'Same time everywhere (JU-LSR is the NTP master)'],
      ['no snmp-server community public', 'Remove the insecure default on DNA'],
    ],
  },
  tasks: [
    { id: 't1', text: 'All four LSRs carry the logging / SNMP / trap baseline.', check: C.configHasLines(OPS_LSRS, BASELINE_RULES), points: 25 },
    {
      id: 't2',
      text: `PPR, MTD and DNA use JU-LSR (${lo('JU')}) as NTP server.`,
      check: C.configHasLines([PPR, MTD, DNA], ['^ntp server 10\\.0\\.1\\.1$']),
      points: 15,
    },
    { id: 't3', text: 'The NMS manages all four LSRs.', check: C.all(...OPS_LSRS.map((d) => C.nmsManaged(d))), points: 15 },
    {
      id: 't4',
      text: 'No router has the "public" SNMP community.',
      check: C.configLacksLines(OPS_LSRS, ['^snmp-server community public']),
      points: 10,
    },
  ],
  hints: [
    [
      'Dock → Automation: select all four LSRs, put the baseline lines in the template, Preview, then Push.',
      'The default template and rules in the tab are close — compare them with the plan.',
    ],
    [`Push "ntp server ${lo('JU')}" to PPR, MTD and DNA only (JU is "ntp master 3").`],
    ['NMS tab: all four should be "managed".'],
    ['On DNA-LSR (or as a pushed line): no snmp-server community public. A compliance rule "!^snmp-server community public" checks it.'],
  ],
  breakFix: {
    complaint: 'Audit JU: "Monthly compliance report mein MTD-LSR fail hai — kisi ne troubleshooting ke baad syslog config hata diya."',
    apply: (t) =>
      configure(t, MTD, (c) => {
        c.mgmt.loggingHosts = c.mgmt.loggingHosts.filter((h) => h !== NMS_IP);
      }),
    check: C.configHasLines(OPS_LSRS, BASELINE_RULES),
    hints: ['Automation → Check compliance: which device and rule are red?', `Push the template again (or on MTD-LSR: logging host ${NMS_IP}).`],
    fix: { cli: { [MTD]: [...CONF, `logging host ${NMS_IP}`, 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'What is configuration drift?',
      options: ['Clock drift', 'A device whose running config no longer matches the agreed baseline', 'Fibre attenuation', 'BGP flaps'],
      correctIndex: 1,
      explanation: 'Compliance checks find it; automation fixes it consistently.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why use {{hostname}} / {{loopback}} variables in a template?',
      options: [
        'To make it longer',
        'One template serves every device; per-device values fill in automatically',
        'They are required by SNMP',
        'For encryption',
      ],
      correctIndex: 1,
      explanation: 'Same structure, different values.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Which is a model-driven way to configure routers?',
      options: ['Telnet scripts only', 'NETCONF / RESTCONF with YANG models', 'Excel', 'Syslog'],
      correctIndex: 1,
      explanation: 'Structured data instead of screen-scraping CLI.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why remove "snmp-server community public rw"?',
      options: ['It is too long', 'A well-known read-write community lets anyone change the router', 'It slows OSPF', 'NTP needs it gone'],
      correctIndex: 1,
      explanation: 'Use a strong, read-only community (or SNMPv3) limited to the NMS.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'In the Automation tab, what does {{loopback}} render to on MTD-LSR?',
      options: ['10.0.1.1', '10.0.1.13', '10.0.2.6', 'MTD'],
      correctIndex: 1,
      explanation: 'MTD-LSR Loopback0 in the division IP plan.',
    },
  ],
  estMinutes: 40,
  fieldNote:
    'Real gear: the Automation tab is a teaching tool (Ansible-like): templates are rendered with simple {{variables}} and pushed through the simulator CLI; there is no inventory file, idempotency engine, rollback or NETCONF. Compliance is regex over the running-config.\nInterview questions: "Golden config kya hai?", "Ansible vs NETCONF?", "Drift kaise pakdoge?"',
  solution: {
    cli: {
      [JU]: [...CONF, ...baseline, 'end'],
      [PPR]: [...CONF, ...baseline, `ntp server ${lo('JU')}`, 'end'],
      [MTD]: [...CONF, ...baseline, `ntp server ${lo('JU')}`, 'end'],
      [DNA]: [...CONF, ...baseline, `ntp server ${lo('JU')}`, 'no snmp-server community public', 'end'],
    },
  },
};

// ---------------------------------------------------------------------------
// LB13.1 Inter-AS Option A at Phulera (B13)
// ---------------------------------------------------------------------------

const subif = (n: number, vrf: string, net: string) => [
  `interface gi0/1/0.${n}`,
  `encapsulation dot1Q ${n}`,
  `vrf forwarding ${vrf}`,
  `ip address ${net}.1 255.255.255.252`,
];
const vrfNbr = (vrf: string, net: string) => [
  `address-family ipv4 vrf ${vrf}`,
  `neighbor ${net}.2 remote-as ${JP.asn}`,
  `neighbor ${net}.2 activate`,
  'exit-address-family',
];

const b13: Lab = {
  id: 'LB13.1',
  part: 'B',
  level: 13,
  order: 1,
  lessonId: 'B13',
  title: 'Inter-division hand-off at Phulera: Option A (back-to-back VRFs)',
  scenario:
    'Jaipur division (AS 65002) aur Jodhpur division (AS 65000) dono ke apne MPLS VPN networks hain. JU ke UTS server ko Jaipur ke UTS server tak pahunchna hai, aur FOIS ko FOIS tak — par UTS aur FOIS kabhi na milein. Phulera (FL) par hand-off: har VRF ke liye ek VLAN (sub-interface) aur us VRF mein eBGP — "Option A". Jaipur side (JP-ASBR) ready hai. Kaam: FL-LER par sub-interfaces aur per-VRF eBGP.',
  concept:
    'Do alag AS ke VPN networks jodne ke teen tareeke (RFC 4364 §10):\n' +
    'Option A: ASBRs ek-doosre ko CE maante hain — har VRF ke liye alag sub-interface aur eBGP. Sabse simple aur secure (har VRF alag), par VRFs badhne par config badhta hai.\n' +
    'Option B: ASBRs ke beech ek hi eBGP VPNv4 session, labelled — VRFs ASBR par nahi chahiye. Option C: route reflectors ke beech multihop VPNv4, ASBR sirf loopbacks + labels deta hai.\n' +
    'Division boundary par Option A aksar pehla kadam hota hai: dono taraf ka control alag rehta hai.\n' +
    'Railway analogy: division boundary par har train ka crew/guard badalta hai (Option A) — har line ka apna handover.',
  objectives: [
    'Sub-interface per VRF on FL-LER (dot1Q 101 UTS, 102 FOIS)',
    'eBGP per VRF to JP-ASBR',
    'UTS reaches Jaipur UTS; UTS and FOIS stay apart',
  ],
  topologyId: 'lab-b13-handoff',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'bgp'],
  plan: {
    headers: ['VRF', 'FL-LER Gi0/1/0.x', 'JP-ASBR', 'Jaipur server'],
    rows: [
      ['UTS', `.101 dot1Q 101 ${JP.uLink}.1/30`, `${JP.uLink}.2 (AS ${JP.asn})`, `JP-UTS-SRV ${JP.uts}.10`],
      ['FOIS', `.102 dot1Q 102 ${JP.fLink}.1/30`, `${JP.fLink}.2 (AS ${JP.asn})`, `JP-FOIS-SRV ${JP.fois}.10`],
    ],
  },
  tasks: [
    { id: 't1', text: 'eBGP in VRF UTS between FL-LER and JP-ASBR is up.', check: C.bgpSessionUp(FL, 'JP-ASBR', { vrf: 'UTS' }), points: 20 },
    { id: 't2', text: 'eBGP in VRF FOIS between FL-LER and JP-ASBR is up.', check: C.bgpSessionUp(FL, 'JP-ASBR', { vrf: 'FOIS' }), points: 15 },
    {
      id: 't3',
      text: `JU-UTS-SRV reaches the Jaipur UTS server (ping ${JP.uts}.10).`,
      check: C.pingSucceeds('JU-UTS-SRV', `${JP.uts}.10`),
      points: 20,
    },
    {
      id: 't4',
      text: `Isolation: JU's FOIS VRF has the Jaipur FOIS LAN, but JU-UTS-SRV cannot reach the Jaipur FOIS server (ping ${JP.fois}.10 fails).`,
      check: C.all(C.vrfHasRoute(JU, 'FOIS', `${JP.fois}.0/24`), C.pingFails('JU-UTS-SRV', `${JP.fois}.10`)),
      points: 10,
    },
  ],
  hints: [
    [`On FL-LER: ${subif(101, 'UTS', JP.uLink).join(' → ')}`, `router bgp ${ASN} → ${vrfNbr('UTS', JP.uLink).slice(0, 3).join(' → ')}`],
    [`Same for FOIS: gi0/1/0.102, dot1Q 102, ${JP.fLink}.1/30, neighbor ${JP.fLink}.2 in address-family ipv4 vrf FOIS.`],
    ['From JU-UTS-SRV: ping ' + `${JP.uts}.10`, '"show ip route vrf UTS" on JU-LSR shows the Jaipur LAN learned through FL.'],
    [`From JU-UTS-SRV: ping ${JP.fois}.10 — it must fail.`],
  ],
  breakFix: {
    complaint: 'Jaipur NOC: "UTS hand-off session Phulera par down hai. Aapki taraf kal VLAN re-numbering hui thi kya?"',
    apply: (t) =>
      configure(t, FL, (c) => {
        const i = c.interfaces['Gi0/1/0.101'];
        if (i) i.encapsulation = { vlan: 110, native: false };
      }),
    check: C.all(C.bgpSessionUp(FL, 'JP-ASBR', { vrf: 'UTS' }), C.pingSucceeds('JU-UTS-SRV', `${JP.uts}.10`)),
    hints: [
      '"show bgp vpnv4 unicast all summary" on FL-LER: the UTS neighbour is not up. Compare the sub-interface VLAN with the plan.',
      'interface gi0/1/0.101 → encapsulation dot1Q 101',
    ],
    fix: { cli: { [FL]: [...CONF, 'interface gi0/1/0.101', 'encapsulation dot1Q 101', 'end'] }, pings: [['JU-UTS-SRV', `${JP.uts}.10`]] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'In Option A, how does each ASBR see the other?',
      options: ['As a P router', 'As a CE router, one VRF per sub-interface', 'As a route reflector', 'Not at all'],
      correctIndex: 1,
      explanation: 'Back-to-back VRFs: plain IP per VRF between the ASBRs.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Main drawback of Option A?',
      options: ['No isolation', 'Config grows with every VRF (sub-interface + eBGP each)', 'Needs MPLS between ASBRs', 'Cannot carry IP'],
      correctIndex: 1,
      explanation: 'Option B/C scale better but share more control between the ASes.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Which option exchanges VPNv4 routes directly between the ASBRs on one session?',
      options: ['Option A', 'Option B', 'Option C', 'None'],
      correctIndex: 1,
      explanation: 'Option C exchanges VPNv4 between route reflectors (multihop).',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why one VLAN per VRF on the hand-off link?',
      options: ['Speed', 'Each VRF needs its own interface so the routes and packets stay separate', 'STP', 'For QoS only'],
      correctIndex: 1,
      explanation: 'The sub-interface puts the traffic into the right VRF on both sides.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the lab, run "show ip route vrf UTS" on JU-LSR. How is ${JP.uts}.0/24 learned?`,
      options: [`B ${JP.uts}.0/24 [200/0] via ${lo('FL')}`, `B ${JP.uts}.0/24 [20/0] via ${JP.uLink}.2`, `S ${JP.uts}.0/24`, 'Not present'],
      correctIndex: 0,
      explanation: 'FL learns it by eBGP and exports it into VPNv4; JU imports it from FL (iBGP, next hop FL loopback).',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: only Option A is simulated (VRF sub-interfaces + PE–CE eBGP). Options B and C need labelled VPNv4 between ASes and are taught in the lesson only. JP-ASBR is a teaching stand-in, not the real Jaipur division design.\nInterview questions: "Inter-AS Option A/B/C?", "Option A kab chunoge?", "Hand-off par isolation kaise?"',
  solution: {
    cli: {
      [FL]: [
        ...CONF,
        ...subif(101, 'UTS', JP.uLink),
        ...subif(102, 'FOIS', JP.fLink),
        'exit',
        `router bgp ${ASN}`,
        ...vrfNbr('UTS', JP.uLink),
        ...vrfNbr('FOIS', JP.fLink),
        'end',
      ],
    },
    pings: [
      ['JU-UTS-SRV', `${JP.uts}.10`],
      ['JU-UTS-SRV', `${JP.uts}.10`],
      ['JU-UTS-SRV', `${JP.fois}.10`],
    ],
  },
};

export const OPS_LABS: Lab[] = [b11, b12, b13];
