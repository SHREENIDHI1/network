import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B10',
  part: 'B',
  title: 'Traffic Engineering & resilience',
  summary:
    'RSVP-TE: OSPF TE extensions, RSVP bandwidth, CSPF, explicit path, autoroute; FRR link/node protection (< 50 ms), PLR, backup tunnel, re-optimisation — aur IGP-only resilience se farq.',
  estMinutes: 55,
  blocks: [
    {
      kind: 'text',
      heading: 'IGP sirf shortest path jaanta hai',
      body: 'OSPF har packet ko sabse kam cost wale raaste se bhejta hai — chahe woh link bhara ho aur doosra raasta khaali. Traffic Engineering head-end (ingress LSR) ko raasta chunne deta hai: kaunsa path, kitni bandwidth, kaunse links avoid. Yeh path ek MPLS LSP ban jaata hai jise RSVP-TE signal karta hai.',
    },
    {
      kind: 'table',
      caption: 'TE ke building blocks (IOS)',
      headers: ['Block', 'Kya karta hai', 'Config'],
      rows: [
        ['TE on router', 'RSVP-TE aur TE database chalu', 'mpls traffic-eng tunnels'],
        ['TE on link', 'Link TE topology mein', 'interface → mpls traffic-eng tunnels + ip rsvp bandwidth [kbps]'],
        ['OSPF TE', 'Link bandwidth / TE metric flood', 'router ospf → mpls traffic-eng router-id Loopback0 + mpls traffic-eng area 0'],
        ['Tunnel', 'Head-end LSP', 'interface Tunnel1 → tunnel mode mpls traffic-eng → tunnel destination <tail loopback>'],
        ['Path', 'Explicit ya dynamic (CSPF)', 'tunnel mpls traffic-eng path-option 1 explicit name X | dynamic'],
        ['Bandwidth', 'Reserve', 'tunnel mpls traffic-eng bandwidth <kbps>'],
        ['Use it', 'Tail ke peeche ka traffic tunnel mein', 'tunnel mpls traffic-eng autoroute announce'],
      ],
    },
    { kind: 'widget', widget: 'cspf', caption: 'CSPF: bandwidth constraint se path badalta hai' },
    {
      kind: 'text',
      heading: 'Explicit path',
      body: '"ip explicit-path name VIA_DNA enable" → "next-address" har hop (strict: agla hi neighbour). "exclude-address" se CSPF ko ek link ya router avoid karne ko kehte hain — backup tunnels mein yahi kaam aata hai. Path-options preference order mein try hote hain: explicit fail ho to dynamic fallback.',
    },
    {
      kind: 'text',
      heading: 'FRR: < 50 ms protection',
      body: 'Link kat jaaye to IGP ko naya raasta nikaalne aur head-end ko LSP dobara banane mein second lag sakte hain. FRR (RFC 4090, facility backup): har protected link ke upstream router (PLR) par pehle se backup tunnel tayyar, jo link chhod kar next hop (link protection) ya next-next hop (node protection) tak jaata hai. Link girte hi PLR primary ke label ke upar backup ka label lagata hai — SDH jaisi < 50 ms switchover. Phir head-end naya primary path signal karta hai (make-before-break) aur traffic backup se hat jaata hai.',
    },
    {
      kind: 'table',
      caption: 'Resilience options',
      headers: ['Tareeka', 'Recovery', 'Note'],
      rows: [
        ['Sirf IGP (OSPF)', 'Seconds (timers + SPF)', 'Simple; safety circuits ke liye dheema'],
        ['RSVP-TE FRR', '< 50 ms target', 'Backup tunnels pehle se; har link ke liye config'],
        ['TI-LFA (Segment Routing, B14)', '< 50 ms target', 'Backup automatic, RSVP nahi'],
        ['SDH MSP/SNCP (purana)', '< 50 ms', 'Isi standard se railway compare karti hai'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: RSVP-TE computed hai (Path/Resv refresh, priorities/pre-emption, affinities nahi). FRR switchover model mein turant hota hai; head-end tab tak backup par rehta hai jab tak "mpls traffic-eng reoptimize" na chalao — taaki aap FRR state dekh sako. Asli head-end kuch seconds mein khud re-signal karta hai. B10 ring ka JU–DNA lease ek teaching assumption hai (J1 core tree hai).',
    },
    {
      kind: 'analogy',
      body: 'TE = goods train ke liye pehle se path block karna (chord line, reservation ke saath). FRR = har section ka pehle se tay diversion — line block hote hi station master turant diversion par bhejta hai, control ka order baad mein.',
    },
  ],
  flash: [
    {
      prompt: 'TE tunnel kaun signal karta hai?',
      options: ['LDP', 'RSVP-TE', 'BGP', 'ARP'],
      correctIndex: 1,
      explanation: 'OSPF TE info flood karta hai; RSVP-TE LSP banata hai.',
    },
    {
      prompt: 'CSPF mein "C" ka matlab?',
      options: ['Cisco', 'Constrained (bandwidth, exclude)', 'Core', 'Cost'],
      correctIndex: 1,
      explanation: 'Constraint pura na karne wale links hata kar SPF.',
    },
    {
      prompt: 'FRR mein traffic backup par kaun daalta hai?',
      options: ['Head-end', 'PLR (failure ke theek pehle wala router)', 'Tail', 'NMS'],
      correctIndex: 1,
      explanation: 'Local repair — isliye tez.',
    },
    {
      prompt: 'Link protection backup kahan khatam hota hai?',
      options: ['Head-end', 'Next hop (NHOP)', 'Next-next hop', 'Kahin bhi'],
      correctIndex: 1,
      explanation: 'Node protection NNHOP tak.',
    },
    {
      prompt: 'Autoroute announce ke bina tunnel up hai par traffic nahi jaata. Kyon?',
      options: ['Tunnel down', 'Routing table tunnel ko use nahi karti', 'RSVP fail', 'MTU'],
      correctIndex: 1,
      explanation: 'Autoroute (ya static route) se hi traffic tunnel mein jaata hai.',
    },
  ],
  glossary: [
    {
      term: 'RSVP-TE',
      en: 'Signalling protocol that reserves bandwidth and distributes labels for TE LSPs (RFC 3209).',
      hi: 'TE LSP banane wala protocol.',
    },
    { term: 'CSPF', en: 'Constrained shortest path first: SPF after pruning links that fail the constraints.', hi: 'Shart ke saath shortest path.' },
    { term: 'Explicit path', en: 'Operator-defined hop list (next-address / exclude-address).', hi: 'Haath se tay kiya raasta.' },
    {
      term: 'Autoroute announce',
      en: 'Head end uses the tunnel as a direct link to the tail in its routing.',
      hi: 'Tunnel ko routing mein use karo.',
    },
    { term: 'FRR / PLR', en: 'Fast reroute; the point of local repair switches traffic to a pre-signalled backup.', hi: 'Turant backup par switch.' },
    { term: 'Make-before-break', en: 'New LSP is signalled before the old one is torn down.', hi: 'Naya path pehle, purana baad mein.' },
  ],
  practice: { labId: 'LB10.1', note: 'Lab LB10.1: busy JU–PPR span ke bagal se TE tunnel. Lab LB10.2: PPR–JU par FRR aur fibre-cut drill.' },
};
