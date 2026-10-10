import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B1',
  part: 'B',
  title: 'Router OS basics on SP routers (NEON profiles)',
  summary:
    'NEON-LER/LSR profiles, interface naming, loopback aur /31 core links, division IP plan, config save/rollback, aur station config template ka idea.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'table',
      caption: 'Kaun sa router kahan (division design rule)',
      headers: ['Profile', 'Kahan', 'Kaam'],
      rows: [
        ['NEON-LSR', 'Junctions: JU, RKB, PPR, MTD, DNA, PLC, LN, SMR + aggregation BME, JSM', 'Label switching, kai directions ke links'],
        ['NEON-LER', 'Har station', 'Station services (VRF, PW), label push/pop'],
        ['uCPE', 'Halts / LC gates (design choice)', 'Chhota edge router'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'NEON ka asli CLI public nahi hai. Simulator NEON profiles par CAMTECH p.35 ke hardware figures + generic SP CLI (IOS-XE style) use karta hai — banner: "CLI syntax is generic, not official NEON syntax". Device detail → Hardware tab mein specs aur source.',
    },
    {
      kind: 'text',
      heading: 'Interface naming',
      body: 'Generic SP CLI mein: Te0/0/0 = slot 0, sub-slot 0, port 0 ka 10G port; Gi0/1/3 = 1G; Hu0/2/0 = 100G. Short form chalta hai: "int te0/0/1". Loopback0 = router ki pehchaan.',
    },
    {
      kind: 'text',
      heading: 'Loopback /32 aur /31 links',
      body: 'Loopback0 /32: router-ID, LDP/BGP sessions ka address, management. Kabhi down nahi hota, isliye fibre cut par bhi doosre raste se reachable.\nCore link /31 (RFC 3021): point-to-point par sirf do address chahiye — /30 mein 2 address barbaad hote. 150+ spans par yeh bachat kaafi hai.',
    },
    {
      kind: 'table',
      caption: 'Jodhpur division IP plan (teaching plan, Learn → Jodhpur page par poori table)',
      headers: ['Kya', 'Format', 'Example'],
      rows: [
        ['Loopback', '10.0.<section>.<position>/32', 'JU 10.0.1.1, BNO 10.0.1.3, DNA 10.0.2.6'],
        ['Span link', '10.255.<section>.<2·index>/31', 'RKB–BNO 10.255.1.2/31'],
        ['J1 express link', '10.254.0.<2k>/31', 'JU–RKB 10.254.0.0/31'],
        ['Station VRF block', '10.<100+VRF>.<station no>.0/24', 'UTS of station 1: 10.100.1.0/24'],
      ],
    },
    {
      kind: 'text',
      heading: 'Save, rollback, template',
      body: 'Running-config (RAM) vs startup-config (NVRAM): "write memory" ke bina reload par sab gayab. Change se pehle "show running-config" ka backup rakho (rollback). Station config template: har LER ka config ek jaisa — sirf station code, loopback aur link addresses badalte hain (P8 mein automation se).',
    },
    {
      kind: 'analogy',
      body: 'Template = standard SWR (Station Working Rules) format: har station ka document same dhaanche mein, sirf station-specific details alag.',
    },
  ],
  flash: [
    {
      prompt: 'Junction par kaunsa profile?',
      options: ['NEON-LER', 'NEON-LSR', 'uCPE', 'L2 switch'],
      correctIndex: 1,
      explanation: 'Junction = LSR (label switching, kai directions).',
    },
    {
      prompt: '/31 ka mask?',
      options: ['255.255.255.252', '255.255.255.254', '255.255.255.255', '255.255.255.0'],
      correctIndex: 1,
      explanation: '/31 = 255.255.255.254.',
    },
    {
      prompt: 'Config save ka command?',
      options: ['save all', 'write memory', 'commit now', 'store'],
      correctIndex: 1,
      explanation: 'write memory / copy running-config startup-config.',
    },
    {
      prompt: 'NEON ka CLI simulator mein kaisa hai?',
      options: ['Official NEON syntax', 'Generic SP CLI (IOS-XE style), official nahi', 'Juniper syntax', 'Koi CLI nahi'],
      correctIndex: 1,
      explanation: 'NEON ka real CLI public nahi — generic syntax, banner ke saath.',
    },
    {
      prompt: 'Plan ke hisaab se DNA ka loopback?',
      options: ['10.0.1.6', '10.0.2.6', '10.255.2.6', '10.0.0.6'],
      correctIndex: 1,
      explanation: 'DNA section S2 mein 6th stop: 10.0.2.6.',
    },
  ],
  glossary: [
    { term: 'Loopback', en: 'Virtual always-up interface used as router identity.', hi: 'Hamesha up rehne wala virtual interface.' },
    { term: '/31 link', en: 'Point-to-point subnet with two usable addresses (RFC 3021).', hi: 'Do address wala p2p subnet.' },
    { term: 'Startup-config', en: 'Saved configuration loaded at boot.', hi: 'Boot par load hone wala saved config.' },
    { term: 'Config template', en: 'Standard per-role config with variables per site.', hi: 'Har role ka standard config.' },
  ],
  practice: { labId: 'LB1.1', note: 'Lab LB1.1: BNO-LER ko commission karo — loopback, /31 links, ping, save.' },
};
