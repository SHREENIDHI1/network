import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B14',
  part: 'B',
  title: 'Segment Routing (optional)',
  summary:
    'SR-MPLS: IGP hi labels baantta hai (prefix SID = SRGB base + index), LDP ki zaroorat nahi. LDP se SR migration, SID plan, aur TI-LFA — har prefix ke liye pehle se ready repair path.',
  estMinutes: 45,
  blocks: [
    {
      kind: 'text',
      heading: 'LDP ke baad kya',
      body: 'Ab tak core mein do protocol the: OSPF (raasta) aur LDP (labels). Segment Routing mein OSPF (ya IS-IS) hi label ki jaankari le jaata hai. Har router apne loopback ko ek "prefix SID index" deta hai, aur OSPF use LSA mein flood karta hai. Ek protocol kam = kam config, kam troubleshooting, aur LDP–IGP sync ki problem khatam.',
    },
    {
      kind: 'keyterms',
      terms: [
        { term: 'SRGB', meaning: 'Segment Routing Global Block — labels ki range jo SR ke liye reserved hai (yahan 16000–23999).' },
        { term: 'Prefix SID', meaning: 'Ek prefix (aksar loopback /32) ka index. Label = SRGB base + index.' },
        { term: 'Node SID', meaning: 'Router ke loopback ka prefix SID — "is router tak le chalo".' },
        { term: 'Adjacency SID', meaning: 'Ek link ka local SID — "is link se nikalo". Simulator mein sirf naam se dikhaya jaata hai.' },
      ],
    },
    { kind: 'widget', widget: 'sr-label', caption: 'SID index se label: poore network mein ek hi number' },
    {
      kind: 'table',
      caption: 'LDP vs SR-MPLS',
      headers: ['', 'LDP', 'SR-MPLS'],
      rows: [
        ['Labels kaun baantta', 'Alag protocol (LDP sessions)', 'IGP (OSPF / IS-IS extensions)'],
        ['Label value', 'Har router ka apna local label', 'Global: base + index (same SRGB par same)'],
        ['Fast reroute', 'LFA / RSVP-TE FRR', 'TI-LFA — har topology mein 100% coverage'],
        ['Traffic engineering', 'RSVP-TE alag se', 'SR-TE policy (segment list) — yahan model nahi'],
      ],
    },
    {
      kind: 'text',
      heading: 'Migration: LDP se SR',
      body: 'Asli network mein dono saath chal sakte hain. IOS-XE mein default rule: jab tak LDP label hai, LDP prefer hota hai ("sr-prefer" se badla ja sakta hai). Simulator bhi LDP ko prefer karta hai. Isliye step: (1) har router par SR + SID, (2) "show mpls forwarding-table" mein 160xx labels check, (3) link by link "no mpls ip", (4) LSP ping se proof.',
    },
    {
      kind: 'text',
      heading: 'TI-LFA',
      body: 'Topology-Independent LFA: router har prefix ke liye sochta hai — "agar mera primary link kate, to IGP converge hone ke baad traffic kahan se jaayega (post-convergence path)?" Phir us path par pahunchne ke liye labels: P-space = jo nodes mujhse bina us link ke pahunche ja sakte hain; Q-space = jo nodes destination tak bina us link ke pahunchte hain. P se Q tak ek node-SID (aur zaroorat ho to ek adj-SID) push karo. Link kat-te hi router turant repair labels laga deta hai.',
    },
    { kind: 'widget', widget: 'ti-lfa', caption: 'Lease ka cost badlo: repair segment list kaise badalti hai' },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: prefix SIDs (connected-prefix-sid-map), SRGB, PHP, LDP preference aur TI-LFA calculation chalta hai. Adjacency SIDs label ke roop mein model nahi; convergence turant hota hai, isliye TI-LFA repair calculate aur dikhaya jaata hai, packets usse nahi jaate. SR-TE policies, mapping server aur SRGB mismatch nahi. NEON ka CLI public nahi — syntax IOS-XE style.',
    },
    {
      kind: 'analogy',
      body: 'Prefix SID = station code (JU, MTD) — kisi bhi junction par wahi code, har jagah samajh aata hai. LDP label = har section ka apna token number. TI-LFA = har block section ke liye pehle se likha diversion order: "agar yeh line block ho, to DNA ho kar jao" — control se poochne ki zaroorat nahi.',
    },
  ],
  flash: [
    {
      prompt: 'SRGB 16000–23999, index 3. Label?',
      options: ['3', '16003', '23996', 'Har router par alag'],
      correctIndex: 1,
      explanation: 'Base + index.',
    },
    {
      prompt: 'SR-MPLS mein labels kaun baantta hai?',
      options: ['LDP', 'IGP (OSPF / IS-IS)', 'BGP', 'RSVP'],
      correctIndex: 1,
      explanation: 'Isliye LDP hata sakte hain.',
    },
    {
      prompt: 'LDP aur SR dono chal rahe hain. Router kaun sa label use karega (default)?',
      options: ['SR', 'LDP', 'Dono', 'Koi nahi'],
      correctIndex: 1,
      explanation: 'Default LDP preferred; migration ke end mein LDP hatao.',
    },
    {
      prompt: 'Do routers ne same SID index diya. Kya hoga?',
      options: ['Load sharing', 'Conflict — SR label nahi milega (yahan dono prefixes reject)', 'Kuch nahi', 'Bada index jeetega'],
      correctIndex: 1,
      explanation: 'SID plan unique hona chahiye.',
    },
    {
      prompt: 'TI-LFA repair path kis path ko follow karta hai?',
      options: ['Sabse lamba', 'Post-convergence path', 'Random', 'RSVP backup'],
      correctIndex: 1,
      explanation: 'Convergence ke baad dobara path nahi badalta.',
    },
  ],
  glossary: [
    { term: 'Segment Routing', en: 'Source routing with labels (segments) distributed by the IGP.', hi: 'IGP se label baantna, LDP ke bina.' },
    { term: 'SRGB', en: 'Segment Routing Global Block: label range for global SIDs.', hi: 'SR labels ki range.' },
    { term: 'Prefix SID', en: 'Global segment for a prefix; label = SRGB base + index.', hi: 'Prefix ka global number.' },
    {
      term: 'TI-LFA',
      en: 'Topology-Independent Loop-Free Alternate: precomputed repair along the post-convergence path.',
      hi: 'Pehle se ready repair path.',
    },
    {
      term: 'P-space / Q-space',
      en: 'Nodes reachable from the source / reaching the destination without the protected link.',
      hi: 'Repair ke do kinare.',
    },
  ],
  practice: { labId: 'LB14.1', note: 'Lab LB14.1: ring ko LDP se SR par migrate karo, SID plan, aur MTD par TI-LFA.' },
};
