import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A14',
  part: 'A',
  title: 'QoS basics',
  summary: 'Congestion mein kaunsa traffic pehle: DSCP marking, trust boundary, LLQ/CBWFQ queues, policing vs shaping, aur railway priority order.',
  estMinutes: 55,
  blocks: [
    {
      kind: 'text',
      heading: 'QoS kyon?',
      body: 'Link par jagah kam aur traffic zyada ho (congestion) to router ki queue bhar jaati hai aur packets girte hain. Bina QoS sab barabar girte hain — CCTV ki video ke saath control phone ki awaaz bhi tootti hai. QoS batata hai: congestion mein pehle kaun, aur kitna guaranteed.',
    },
    {
      kind: 'table',
      caption: 'Railway priority (is course ka plan, CAMTECH ke idea par)',
      headers: ['Rank', 'Traffic', 'DSCP'],
      rows: [
        ['1', 'Signalling / safety data, E1 pseudowires', 'CS5 (40)'],
        ['2', 'Control voice / VoIP', 'EF (46)'],
        ['3', 'UTS / PRS / FOIS', 'AF31 (26)'],
        ['4', 'CCTV video', 'AF41 (34)'],
        ['5', 'Railnet / Internet / Wi-Fi', 'Default (0)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Classification aur marking',
      body: 'IP header ke 6-bit DSCP field mein traffic ki class likhte hain (0–63). Trust boundary: kis device ka marking maanna hai — IP phone ka EF maano, par user PC ka EF jhooth ho sakta hai, isliye access edge par re-mark karo. Cisco MQC: class-map (kya match karna), policy-map (kya karna), service-policy (kis interface par).',
    },
    {
      kind: 'text',
      heading: 'Queuing: LLQ aur CBWFQ',
      body: 'LLQ (priority queue): voice ke liye — hamesha pehle bheja jaata hai, par apni limit tak policed (taaki baaki starve na hon). CBWFQ (bandwidth): har class ko congestion mein guaranteed hissa (jaise CCTV 40%). Bacha hua class-default mein. Bina policy = FIFO, sab ek line mein.',
    },
    {
      kind: 'widget',
      widget: 'queue-sim',
      caption: 'Link capacity ghatao aur FIFO vs LLQ/CBWFQ ka fark dekho (wahi allocator jo simulator use karta hai).',
    },
    {
      kind: 'text',
      heading: 'Policing vs shaping',
      body: 'Policing: limit se zyada traffic turant drop (ya re-mark) — jaise toll gate jo overload truck ko wapas bhej de. Shaping: zyada traffic ko buffer mein rok kar dheere bhejna — jaise signal par train ko roke rakhna. Service provider aksar police karta hai; customer shape karta hai taaki drop na ho.',
    },
    {
      kind: 'analogy',
      body: 'LLQ = Rajdhani ko main line par hamesha pehle path; CBWFQ = har mail/express/goods ko din mein guaranteed slots; FIFO = jo pehle aaya woh pehle, chahe goods ho ya Rajdhani.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator ka QoS "fluid" average-rate analysis hai: har flow kitna pahunchta hai aur kaunsa link bottleneck hai (QoS tab). Jitter, bursts aur exact shaping timing simulate nahi hote (Model Limitations).',
    },
  ],
  flash: [
    {
      prompt: 'Voice ke liye kaunsi queue?',
      options: ['class-default', 'LLQ (priority)', 'FIFO', 'Policing only'],
      correctIndex: 1,
      explanation: 'Low delay ke liye strict priority, limit tak policed.',
    },
    {
      prompt: 'DSCP EF ka decimal value?',
      options: ['0', '26', '34', '46'],
      correctIndex: 3,
      explanation: 'EF = 46 (101110).',
    },
    {
      prompt: 'Policing aur shaping mein fark?',
      options: ['Koi nahi', 'Policing extra drop karta hai, shaping buffer karke dheere bhejta hai', 'Shaping drop karta hai', 'Dono marking'],
      correctIndex: 1,
      explanation: 'Policer drop/re-mark; shaper delay.',
    },
    {
      prompt: 'Trust boundary kahan rakhte hain?',
      options: ['Core router par', 'Access edge par — jahan se untrusted devices aate hain', 'Internet par', 'Kahin nahi'],
      correctIndex: 1,
      explanation: 'Edge par classify/re-mark, core marking par bharosa karta hai.',
    },
    {
      prompt: 'Link congested nahi hai. QoS policy ka asar?',
      options: ['Bahut zyada', 'Lagbhag kuch nahi — queues tabhi kaam aati hain jab congestion ho', 'Sab drop', 'Speed double'],
      correctIndex: 1,
      explanation: 'Queuing congestion management hai; khaali link par sab chala jaata hai.',
    },
  ],
  glossary: [
    { term: 'QoS', en: 'Quality of Service: who gets bandwidth and low delay under congestion.', hi: 'Congestion mein kaun pehle.' },
    { term: 'DSCP', en: '6-bit IP header field marking the traffic class.', hi: 'IP header mein class ka 6-bit mark.' },
    { term: 'LLQ', en: 'Low Latency Queuing: strict-priority queue, policed.', hi: 'Strict priority queue (voice).' },
    { term: 'CBWFQ', en: 'Class-Based Weighted Fair Queuing: bandwidth guarantees per class.', hi: 'Har class ko guaranteed bandwidth.' },
    { term: 'Policing / shaping', en: 'Drop excess vs delay excess traffic.', hi: 'Zyada ko girana vs rok kar bhejna.' },
    { term: 'Trust boundary', en: 'Point from which DSCP markings are trusted.', hi: 'Jahan se marking maani jaati hai.' },
  ],
  practice: { labId: 'L14.1', note: 'Lab L14.1: MTD–JU congested link par voice aur UTS ko CCTV se bachao.' },
};
