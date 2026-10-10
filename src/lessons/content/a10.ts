import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A10',
  part: 'A',
  title: 'Dynamic routing: RIP, OSPF, IS-IS',
  summary: 'Distance-vector vs link-state, RIP (sirf demo), OSPF areas aur cost, fibre cut par reroute, aur IS-IS ki basics.',
  estMinutes: 70,
  blocks: [
    {
      kind: 'text',
      heading: 'Dynamic routing kyon?',
      body: 'Jodhpur division mein 150+ stations hain. Har router par haath se static routes likhna aur har fibre cut par badalna namumkin hai. Dynamic routing protocols routers ko aapas mein routes batane dete hain; link toota to naya rasta apne aap.',
    },
    {
      kind: 'table',
      caption: 'Do parivaar',
      headers: ['', 'Distance-vector (RIP)', 'Link-state (OSPF, IS-IS)'],
      rows: [
        ['Kya batate hain', 'Sirf "is network tak itne hops" padosi ko', 'Apne links ki poori jaankari sabko (LSA/LSP)'],
        ['Har router ke paas', 'Padosi ki baat par bharosa', 'Poore network ka nakshaa (database)'],
        ['Rasta kaise', 'Bellman-Ford', 'Dijkstra SPF'],
        ['Convergence', 'Dheemi, loops ka khatra', 'Tez, loop-free'],
        ['Railway use', 'Nahi (sirf padhai)', 'OSPF/IS-IS — MPLS core ke liye'],
      ],
    },
    {
      kind: 'analogy',
      body: 'Distance-vector = har station sirf padosi se poochhta hai "BKN kitni door?" aur unki baat maan leta hai. Link-state = har station ke paas poori division ka track map hai; khud hisaab lagata hai sabse chhota rasta.',
    },
    {
      kind: 'text',
      heading: 'RIP (demo only)',
      body: 'RIP metric = hop count, max 15 (16 = unreachable). Purane RIP har 30 second poori table bhejta tha. Bade, alag-alag speed wale links mein galat rasta chun leta hai (2 hops of 1 Mbps vs 3 hops of 10 Gbps). Simulator RIPv2 sirf comparison ke liye chalata hai ("version 2" zaroori).',
    },
    {
      kind: 'text',
      heading: 'OSPF',
      body: 'Har router ka Router ID (loopback ka IP sabse accha). Interfaces par hello (default 10 s, dead 40 s) se neighbours bante hain; area, subnet, hello/dead, MTU match hone chahiye. Cost = reference bandwidth / interface bandwidth; default reference 100 Mbps — isliye 1G aur 10G dono ka cost 1 aata hai! Fix: "auto-cost reference-bandwidth 100000" sab routers par. Ethernet par DR/BDR chuna jaata hai.',
    },
    {
      kind: 'text',
      heading: 'OSPF areas — control board ke hisaab se',
      body: 'Bade network ko areas mein baantte hain taaki har router ka database chhota rahe. Area 0 = backbone; baaki sab areas area 0 se jude hone chahiye (ABR router se). Jodhpur design idea: JU core area 0, aur North / Central / West / East control boards alag areas — har board ke stations ek area. Inter-area routes "O IA" dikhte hain.',
    },
    { kind: 'widget', widget: 'spf', caption: 'JU–BNO–JWL–AAS ring: costs badlo ya ek link 0 (fibre cut) karo — SPF naya rasta nikaalta hai.' },
    {
      kind: 'text',
      heading: 'IS-IS basics',
      body: 'IS-IS bhi link-state hai, SP/MPLS cores mein bahut popular. Yeh IP ke upar nahi, seedha Layer 2 par chalta hai. Har router ka NET hota hai: 49.0001.0000.0000.0001.00 = area 49.0001 + system ID 0000.0000.0001 + 00. Level-1 = area ke andar, Level-2 = areas ke beech (backbone). L1/L2 router dono karta hai aur L1-only routers ko default route deta hai (ATT bit). Default metric har interface 10, AD 115.',
    },
    {
      kind: 'table',
      caption: 'OSPF vs IS-IS (quick)',
      headers: ['', 'OSPF', 'IS-IS'],
      rows: [
        ['Runs on', 'IP (protocol 89)', 'Layer 2 (CLNS)'],
        ['Backbone', 'Area 0', 'Level-2'],
        ['Area border', 'ABR router (interface per area)', 'Router poora ek area mein; L1/L2 router'],
        ['Default metric', 'Bandwidth-based cost', '10 per interface'],
        ['AD (Cisco)', '110', '115'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator converged state turant compute karta hai (hello timers, DBD/LSU/LSP packets nahi). Neighbour na banne ke kaaran "show ip ospf neighbor" / "show isis neighbors" ke note mein dikhte hain.',
    },
  ],
  flash: [
    {
      prompt: 'OSPF default reference bandwidth 100 Mbps hai. 1G aur 10G link ka cost?',
      options: ['10 aur 1', 'Dono 1', '100 aur 10', '1000 aur 10000'],
      correctIndex: 1,
      explanation: '100/1000 aur 100/10000 dono 1 se kam → minimum 1. Isliye reference bandwidth badhao.',
    },
    {
      prompt: 'OSPF neighbour nahi ban raha; ek taraf area 0, doosri taraf area 1. Kya hoga?',
      options: ['Ban jaayega', 'Nahi banega — area mismatch', 'DR election fail', 'Sirf 2WAY'],
      correctIndex: 1,
      explanation: 'Ek link ke dono ends same area mein hone chahiye.',
    },
    {
      prompt: 'RIP mein 16 hop ka matlab?',
      options: ['Bahut accha rasta', 'Unreachable (infinity)', 'Default route', 'Loop-free'],
      correctIndex: 1,
      explanation: 'RIP max 15 hops; 16 = infinity.',
    },
    {
      prompt: 'IS-IS NET 49.0002.0000.0000.0007.00 mein area kya hai?',
      options: ['0000.0000.0007', '49.0002', '00', '49'],
      correctIndex: 1,
      explanation: 'Last byte NSEL (00), uske pehle 6-byte system ID, baaki area.',
    },
    {
      prompt: 'Ring mein ek fibre kat gaya. Link-state protocol kya karega?',
      options: [
        'Kuch nahi, admin static route daale',
        'LSA/LSP flood karke SPF dobara chalayega aur doosra rasta use karega',
        'Network band',
        'Sirf RIP bachayega',
      ],
      correctIndex: 1,
      explanation: 'Topology change → database update → SPF → naya shortest path.',
    },
  ],
  glossary: [
    { term: 'Distance-vector', en: 'Routers share distances with neighbours only (RIP).', hi: 'Sirf padosi ko doori batana (RIP).' },
    { term: 'Link-state', en: 'Every router builds a full map and runs SPF (OSPF, IS-IS).', hi: 'Poora nakshaa + SPF (OSPF, IS-IS).' },
    { term: 'Router ID', en: '32-bit OSPF identity, usually a loopback address.', hi: 'OSPF pehchaan, aksar loopback IP.' },
    { term: 'Area 0', en: 'OSPF backbone; all areas attach to it.', hi: 'OSPF backbone; sab areas isse jude.' },
    { term: 'ABR', en: 'Area Border Router: interfaces in area 0 and another area.', hi: 'Area 0 aur doosre area ke beech router.' },
    { term: 'NET', en: 'IS-IS Network Entity Title: area + system ID + 00.', hi: 'IS-IS address: area + system ID + 00.' },
    { term: 'Level-1 / Level-2', en: 'IS-IS intra-area / backbone routing.', hi: 'IS-IS area ke andar / areas ke beech.' },
  ],
  practice: { labId: 'L10.1', note: 'Lab L10.1: JU–BNO–JWL–AAS OSPF ring + fibre cut reroute. Lab L10.2: IS-IS triangle.' },
};
