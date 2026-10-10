import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B9',
  part: 'B',
  title: 'MPLS QoS',
  summary:
    'Label ka 3-bit EXP/TC, DSCP se EXP mapping, PE par imposition marking, core par "match mpls experimental", railway priority order, aur DiffServ tunnelling modes (uniform / pipe / short-pipe).',
  estMinutes: 45,
  blocks: [
    {
      kind: 'text',
      heading: 'Core router IP header nahi dekhta',
      body: 'A14 mein QoS DSCP se tha — router IP header padh kar class chunta tha. MPLS core mein P router sirf label dekhta hai. Label ke 32 bits mein 3 bit TC (pehle "EXP") hote hain — 8 values. PE label lagate waqt (imposition) default mein DSCP ke upar ke 3 bit (IP precedence) copy karta hai. Core ki policy in 3 bits par chalti hai: "match mpls experimental topmost".',
    },
    { kind: 'widget', widget: 'dscp-exp', caption: 'DSCP → EXP: upar ke 3 bit' },
    {
      kind: 'table',
      caption: 'Railway plan (teaching): DSCP → EXP → core treatment',
      headers: ['Application', 'DSCP', 'EXP (default)', 'EXP (plan)', 'Core queue'],
      rows: [
        ['Signalling / safety (RTU, axle counter data)', 'CS5 40', '5', '6 (PE re-marks)', 'Priority (LLQ)'],
        ['Control voice / VoIP', 'EF 46', '5', '5', 'Priority (LLQ)'],
        ['UTS / PRS / FOIS', 'AF31 26', '3', '3', 'Bandwidth guarantee'],
        ['CCTV', 'AF41 34', '4', '4', 'Bandwidth guarantee (badi)'],
        ['Railnet / Wi-Fi', '0', '0', '0', 'class-default (jo bache)'],
      ],
    },
    {
      kind: 'text',
      heading: 'PE par marking, core par queuing',
      body: 'PE (ingress) par input policy: "class SIGNALLING → set mpls experimental imposition 6". Core interface par output policy: class-maps "match mpls experimental topmost 5 6" (priority), "… 3" (UTS bandwidth), "… 4" (CCTV bandwidth). Galti jo aksar hoti hai: access router ki policy (match dscp) core par copy karna — labelled packet par match dscp kabhi hit nahi hota, sab class-default mein.',
    },
    {
      kind: 'table',
      caption: 'DiffServ tunnelling modes (RFC 3270)',
      headers: ['Mode', 'Imposition', 'Egress', 'Kab'],
      rows: [
        ['Uniform', 'EXP = DSCP precedence', 'Core ka badla EXP wapas DSCP mein', 'Ek hi provider, ek QoS plan'],
        ['Pipe', 'EXP provider set karta hai', 'Egress queue EXP se; customer DSCP untouched', 'Customer ka DSCP chhedna nahi'],
        ['Short-pipe', 'EXP provider set karta hai', 'Egress queue customer DSCP se', 'Customer ki policy egress par'],
      ],
    },
    {
      kind: 'text',
      heading: 'PHP aur QoS',
      body: 'Penultimate hop popping (B3) ke baad aakhri link par packet label-less hota hai — wahan classification phir DSCP se. VPN traffic mein VPN label bacha rehta hai, isliye EXP aakhri hop tak chalta hai. "mpls ldp explicit-null" se aakhri hop par bhi label (label 0) rehta hai — EXP preserve.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: QoS tab steady-state calculation hai (LLQ, bandwidth guarantees, FIFO) — burst, queue depth, WRED nahi. EXP imposition mein IP precedence copy aur "set mpls experimental imposition/topmost" modelled; tunnelling modes sirf theory.',
    },
    {
      kind: 'analogy',
      body: 'EXP = parcel par laga colour sticker. Booking office (PE) sticker lagata hai; beech ke junctions (P) sirf sticker dekh kar line mein lagaate hain — parcel kholte nahi.',
    },
  ],
  flash: [
    {
      prompt: 'MPLS label mein TC/EXP kitne bit ka?',
      options: ['1', '3', '6', '8'],
      correctIndex: 1,
      explanation: '8 values (0–7).',
    },
    {
      prompt: 'DSCP AF41 (34) ka default EXP?',
      options: ['3', '4', '5', '1'],
      correctIndex: 1,
      explanation: '34 = 100010 → upar ke 3 bit 100 = 4.',
    },
    {
      prompt: 'P router par "match dscp ef" class labelled voice ko…',
      options: ['Match karti hai', 'Match nahi karti — class-default', 'Drop karti hai', 'EXP badalti hai'],
      correctIndex: 1,
      explanation: 'Core mein "match mpls experimental topmost".',
    },
    {
      prompt: 'Signalling aur voice dono EXP 5 ho jaate hain. Hal?',
      options: ['Kuch nahi', 'PE par signalling ko "set mpls experimental imposition 6"', 'DSCP 63', 'TE'],
      correctIndex: 1,
      explanation: 'Core phir unhe alag pehchaan sakta hai.',
    },
    {
      prompt: 'Pipe mode mein customer ka DSCP…',
      options: ['Provider badal deta hai', 'Untouched rehta hai', 'Zero ho jaata hai', 'EXP ban jaata hai'],
      correctIndex: 1,
      explanation: 'Provider sirf label ke EXP se kaam karta hai.',
    },
  ],
  glossary: [
    { term: 'TC / EXP', en: '3-bit traffic class field of an MPLS label (formerly "experimental").', hi: 'Label ka 3-bit QoS field.' },
    { term: 'Imposition', en: 'Pushing labels at the ingress PE; EXP is set here.', hi: 'PE par label lagana.' },
    { term: 'match mpls experimental topmost', en: 'Class-map criterion on the EXP of the top label.', hi: 'Upar wale label ka EXP match.' },
    { term: 'Uniform / pipe / short-pipe', en: 'DiffServ tunnelling modes for how EXP and DSCP relate (RFC 3270).', hi: 'EXP aur DSCP ka rishta.' },
    { term: 'LLQ', en: 'Low-latency queue: strict priority, policed to its rate.', hi: 'Sabse pehle wali queue.' },
  ],
  practice: { labId: 'LB9.1', note: 'Lab LB9.1: MTD–PPR 1G span par signalling ko EXP 6 aur core queues.' },
};
