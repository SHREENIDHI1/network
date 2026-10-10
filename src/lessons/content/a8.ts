import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A8',
  part: 'A',
  title: 'Switching resilience & security (STP, LACP, port security)',
  summary: 'Loop kyon khatarnak hai, STP/RSTP root election aur port roles, EtherChannel/LACP, aur UTS counter par port security.',
  estMinutes: 60,
  blocks: [
    {
      kind: 'text',
      heading: 'Redundancy chahiye, loop nahi',
      body: 'Ek hi cable par station chalega to cable kati, sab band. Isliye switches ko do raste se jodte hain. Lekin Layer 2 frame mein TTL nahi hota: do raste = loop → broadcast frame hamesha ghoomta rahega (broadcast storm), MAC table baar-baar badlegi, network baith jaayega.',
    },
    { kind: 'diagram', diagram: 'stp-loop', caption: 'Triangle = loop. STP ek port block karta hai; link tootne par woh port khul jaata hai.' },
    {
      kind: 'text',
      heading: 'STP / RSTP kaise kaam karta hai',
      body: '1) Root bridge election: sabse kam Bridge ID (priority + MAC) wala switch root. Default priority 32768 — sab barabar ho to sabse chhota MAC jeetta hai (aksar sabse purana switch!). Isliye core switch ki priority kam karo (jaise 4096). 2) Har non-root switch ka root port = root tak sabse sasta rasta (port cost: 1G = 20000, 10G = 2000 in 802.1D-2004 long costs). 3) Har link par ek designated port. 4) Baaki ports alternate/blocked. RSTP (802.1w) fast convergence deta hai.',
    },
    { kind: 'widget', widget: 'root-election', caption: 'Priorities aur MACs badlo — dekho root kaun banta hai.' },
    {
      kind: 'analogy',
      body: 'STP = interlocking: conflicting routes ek saath set nahi ho sakte. Ek signal (port) laal rakha jaata hai taaki do trains (frames) ek loop mein na ghoomein. Agar main route kharab ho, wahi laal signal hara ho jaata hai.',
    },
    {
      kind: 'text',
      heading: 'EtherChannel / LACP',
      body: 'Do switches ke beech do cable lagao to STP ek ko block kar dega — aadhi capacity bekaar. EtherChannel (IEEE 802.3ad LACP) dono cables ko ek logical link "Port-channel" bana deta hai: STP use ek port maanta hai, dono cables traffic le jaati hain (frames MAC hash se baante jaate hain), ek cable kati to bhi link up. Modes: active (LACP shuru karta hai), passive (sirf jawab deta hai), on (bina LACP, zabardasti). active+active / active+passive = bundle; passive+passive = kuch nahi; on vs LACP = mismatch. Sab member ports ki settings (VLAN, trunk) same honi chahiye.',
    },
    {
      kind: 'table',
      caption: 'show etherchannel summary flags',
      headers: ['Flag', 'Matlab'],
      rows: [
        ['P', 'Bundled in port-channel (sab theek)'],
        ['I', 'Stand-alone — LACP partner nahi mila'],
        ['s', 'Suspended — mismatch (mode/config/speed)'],
        ['D', 'Down'],
        ['SU', 'Port-channel Layer 2, in use (up)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Port security — UTS counter ko bachao',
      body: 'UTS counter ka port sirf us terminal ke liye hai. Koi apna laptop laga de to? Port security: port par maximum MAC (jaise 1). Pehla MAC "secure" ho jaata hai; doosra MAC aaya to violation. Modes: shutdown (port err-disabled — default), restrict (frame drop + counter), protect (sirf drop). Recover: "shutdown" phir "no shutdown".',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator mein STP turant converge hota hai aur sab VLANs ke liye ek instance hai; LACP negotiation compute hota hai (LACPDUs/timers nahi). Asli Catalyst default Rapid PVST+ hai. Details: Model Limitations.',
    },
  ],
  flash: [
    {
      prompt: 'Teen switch, sab priority 32768. Root kaun banega?',
      options: ['Jiska naam pehle aata hai', 'Jiska MAC address sabse chhota hai', 'Jiske paas sabse zyada ports', 'Jo pehle on hua'],
      correctIndex: 1,
      explanation: 'Bridge ID = priority + MAC. Priority barabar → lowest MAC jeetta hai.',
    },
    {
      prompt: 'Core switch ko root banane ka sahi tareeka?',
      options: ['Usko sabse pehle on karo', 'spanning-tree vlan 1 priority 4096 (kam priority)', 'Uska MAC badlo', 'STP band karo'],
      correctIndex: 1,
      explanation: 'Root design se chuno: priority kam karo (4096 ke multiples).',
    },
    {
      prompt: 'LACP passive + passive ka result?',
      options: ['Bundle ban jaata hai', 'Bundle nahi banta — dono stand-alone (I)', 'Port err-disabled', 'Loop'],
      correctIndex: 1,
      explanation: 'Passive sirf jawab deta hai; dono passive ho to koi LACP shuru nahi karta.',
    },
    {
      prompt: 'EtherChannel ka sabse bada fayda?',
      options: [
        'VLAN ki zaroorat khatam',
        'Do cables dono kaam karti hain aur STP use ek link maanta hai',
        'IP address bachte hain',
        'Fibre ki zaroorat nahi',
      ],
      correctIndex: 1,
      explanation: 'Capacity badhti hai, aur ek cable kati to bhi bina STP reconvergence ke link chalta rehta hai.',
    },
    {
      prompt: 'Port security shutdown mode, max 1. Doosra laptop laga. Kya hoga?',
      options: ['Kuch nahi', 'Port err-disabled', 'Laptop ko IP nahi milega bas', 'Switch reboot'],
      correctIndex: 1,
      explanation: 'Shutdown mode violation par port err-disabled karta hai; recover: shutdown → no shutdown.',
    },
  ],
  glossary: [
    { term: 'STP / RSTP', en: 'Spanning Tree (802.1D) / Rapid STP (802.1w): blocks loops in Layer 2.', hi: 'Layer 2 loops rokne wala protocol.' },
    { term: 'Root bridge', en: 'Switch with the lowest bridge ID; centre of the spanning tree.', hi: 'Sabse kam bridge ID wala switch.' },
    { term: 'Root port', en: 'Best port towards the root on a non-root switch.', hi: 'Root tak sabse sasta rasta.' },
    { term: 'EtherChannel', en: 'Several physical links bundled into one logical link.', hi: 'Kai cables ko ek logical link banana.' },
    { term: 'LACP', en: 'Link Aggregation Control Protocol (IEEE 802.3ad).', hi: 'Bundle negotiate karne ka standard protocol.' },
    { term: 'Port security', en: 'Limits which/how many MACs may use an access port.', hi: 'Port par kitne/kaunse MAC allowed.' },
    { term: 'err-disabled', en: 'Port shut down by the switch after a violation.', hi: 'Violation ke baad switch ne port band kiya.' },
  ],
  practice: { labId: 'L8.1', note: 'Lab L8.1: MTD par core ko root banao, LACP bundle banao, aur UTS port par port security.' },
};
