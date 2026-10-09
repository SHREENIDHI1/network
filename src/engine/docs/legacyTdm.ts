import { SAFETY_48V, SAFETY_ESD, SAFETY_LASER, SRC_CAMTECH, SRC_IR_TELECOM_MANUAL } from './common';
import type { DeviceDoc } from './types';

/**
 * Equipment docs: legacy TDM transmission (PD-Mux, SDH ADMs, CWDM, exchange).
 * Numbers marked "Standard" come from ITU-T/IEEE; everything else is a
 * typical teaching value.
 */

// ---------------------------------------------------------------------------
// PD-Mux
// ---------------------------------------------------------------------------

export const pdmuxDoc: DeviceDoc = {
  type: 'pdmux',
  fullName: 'Primary Digital Drop-Insert Multiplexer (PD-Mux)',
  oneLiner: {
    en: 'Packs 30 voice/data channels into one 2.048 Mbit/s E1 and drops or inserts them station by station.',
    hi: '30 voice/data channels ko ek 2.048 Mbit/s E1 mein pack karta hai aur har station par drop/insert karta hai.',
  },
  overview: {
    en: [
      'A PD-Mux converts analogue voice (and low-speed data) into 64 kbit/s digital channels and multiplexes them onto one E1 (2.048 Mbit/s).',
      'An E1 frame has 32 timeslots: TS0 carries frame alignment, TS16 carries channel-associated signalling (CAS), and the remaining 30 carry user channels.',
      'Plug-in cards (FXS, FXO, E&M, 2W/4W VF, data) decide what kind of circuit each channel serves.',
      '“Drop-insert” means each station takes out (drops) only its own channels and adds (inserts) its own, while the rest pass through to the next station.',
      'An “omnibus” channel is bridged at every station so all way-stations share one control circuit.',
      'Analogy: the E1 is a 32-coach train — coach 0 is the guard/engine (sync), coach 16 is the signalling van, and each station loads or unloads only its own coaches.',
    ].join('\n'),
    hi: [
      'PD-Mux analogue awaaz (aur kam speed data) ko 64 kbit/s digital channels mein badalta hai aur unhe ek E1 (2.048 Mbit/s) par multiplex karta hai.',
      'E1 frame mein 32 timeslots hote hain: TS0 frame sync ke liye, TS16 signalling (CAS) ke liye, baaki 30 user channels ke liye.',
      'Plug-in cards (FXS, FXO, E&M, 2W/4W VF, data) tay karte hain ki kaunsa channel kis circuit ke liye hai.',
      '“Drop-insert” ka matlab: har station sirf apne channels utaarta (drop) aur chadhata (insert) hai, baaki aage pass ho jaate hain.',
      '“Omnibus” channel har station par bridge hota hai, taaki saare way-stations ek hi control circuit share karein.',
      'Misaal: E1 ek 32 coach ki train hai — coach 0 guard/engine (sync), coach 16 signalling van, aur har station sirf apne coach load/unload karta hai.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Carries Section Control, Deputy Control, TPC (traction power control), TLC, Emergency control, block instrument and BPAC VF channels, auto-phone extensions from the exchange, LC gate phones and low-speed data (data logger modems) between stations over the OFC/SDH backbone.',
    hi: 'Section Control, Deputy Control, TPC, TLC, Emergency control, block instrument aur BPAC ke VF channels, exchange ke auto-phone extensions, LC gate phones aur kam speed data (data logger modem) ko stations ke beech OFC/SDH backbone par le jaata hai.',
  },
  whereInstalled: ['Station telecom/ASM equipment room', 'Junction and divisional control office (controller end)'],
  layer: ['physical', 'TDM (PDH/SDH)'],
  cardsAndModules: [
    'Power supply card (−48 V DC input, typical)',
    'Controller / CPU card (configuration, alarms, LCT/NMS port)',
    'E1 aggregate interface card (G.703, usually 2 ports: East/West for drop-insert)',
    'FXS card — feeds battery and ring to telephones (subscriber side)',
    'FXO card — connects to an exchange subscriber line (looks like a phone to the exchange)',
    'E&M card — trunk signalling between exchanges / control equipment',
    '2W / 4W VF card — transparent voice-frequency circuits (control omnibus, block, BPAC modems)',
    'Data cards — e.g. V.24/RS-232, V.35, G.703 64 kbit/s co-directional, Ethernet-over-E1 (fit varies by model)',
  ],
  ports: [
    { name: 'E1-1 / E1-2', medium: 'Copper balanced pair (or coax)', connector: '120 Ω (RJ48/krone) or 75 Ω BNC', rate: '2.048 Mbit/s (HDB3)', purpose: 'Aggregate towards SDH ADM tributary; East/West for drop-insert' },
    { name: 'FXS-n', medium: 'Quad cable / telephone pair', connector: 'Krone / terminal block', rate: '1 × 64 kbit/s timeslot', purpose: 'Telephone (control phone, auto-phone extension)' },
    { name: 'FXO-n', medium: 'Telephone pair', connector: 'Krone / terminal block', rate: '1 × 64 kbit/s timeslot', purpose: 'From an exchange subscriber line (extend exchange line to remote station)' },
    { name: '2W-n / 4W-n', medium: 'Quad cable', connector: 'Krone / terminal block', rate: '1 × 64 kbit/s timeslot', purpose: 'VF circuits: omnibus control, block instrument, BPAC modem' },
    { name: 'EM-n', medium: '4W + E/M leads', connector: 'Krone / terminal block', rate: '1 × 64 kbit/s timeslot', purpose: 'Trunk signalling to exchange / control equipment' },
    { name: 'MGMT', medium: 'Cat6 / serial', connector: 'RJ45 / DB9', rate: '10/100 Mbit/s (typical)', purpose: 'LCT laptop or NMS' },
  ],
  typicalSpecs: [
    { param: 'Aggregate rate', value: '2.048 Mbit/s ± 50 ppm', note: 'Standard (ITU-T G.703)' },
    { param: 'Timeslots per frame', value: '32 × 64 kbit/s (TS0–TS31)', note: 'Standard (ITU-T G.704)' },
    { param: 'User channels', value: '30 (TS1–TS15, TS17–TS31)', note: 'Standard (with CAS in TS16)' },
    { param: 'Frame / multiframe', value: '125 µs frame; 16-frame CAS multiframe (2 ms)', note: 'Standard (G.704)' },
    { param: 'Line code', value: 'HDB3', note: 'Standard (G.703)' },
    { param: 'Voice coding', value: 'PCM A-law, 64 kbit/s', note: 'Standard (ITU-T G.711)' },
    { param: 'E1 impedance', value: '120 Ω balanced or 75 Ω unbalanced', note: 'Standard (G.703)' },
    { param: 'VF levels', value: 'e.g. −16 dBr Tx / +7 dBr Rx (4W)', note: 'Typical — set as per circuit plan' },
    { param: 'Power', value: '−48 V DC, under 50 W', note: 'Typical' },
  ],
  connectsTo: [
    { device: 'adm-stm1', link: 'e1-copper', note: 'E1 aggregate into an SDH tributary port (rides a VC-12)' },
    { device: 'control-phone', link: 'quad', note: 'FXS or 2W port to way-station control phone' },
    { device: 'block-instrument', link: 'quad', note: '2W VF channel (via a suitable block interface)' },
    { device: 'bpac', link: 'quad', note: '4W VF channel to BPAC modem' },
    { device: 'exchange', link: 'quad', note: 'FXO port to exchange subscriber line (auto-phone extension)' },
    { device: 'exchange', link: 'e1-copper', note: 'Alternatively an E1 between exchange and mux' },
    { device: 'hybrid-agg', link: 'e1-copper', note: 'After migration the E1 can ride a CESoPSN/SAToP pseudowire' },
  ],
  protocolsStandards: [
    'ITU-T G.703 (physical/electrical E1 interface)',
    'ITU-T G.704 (E1 frame structure, TS0, TS16, CRC-4)',
    'ITU-T G.732 (primary PCM multiplex at 2048 kbit/s)',
    'ITU-T G.711 (PCM voice coding)',
    'ITU-T G.823 (jitter and wander for 2048 kbit/s)',
    'ITU-T G.826 (error performance)',
  ],
  configBasics: [
    'Connect the LCT laptop to the MGMT port and open the vendor’s craft/EMS software (menus vary by vendor).',
    'Set the node identity (station name/code) and verify the installed cards are recognised.',
    'Configure each E1 aggregate: framing (with CRC-4 if the network uses it), CAS on TS16, line code HDB3, clock source (normally recovered from the line, i.e. loop timing from SDH).',
    'Create the channel plan: assign each card port to a timeslot (TS1–TS15, TS17–TS31). Never use TS0 or TS16 for user traffic when CAS is on.',
    'For drop-insert, set channels as “drop” (terminate locally) or “through” (pass East↔West). Omnibus channels are “bridged” so the station hears and joins the conference.',
    'Set VF levels (Tx/Rx dBr) and signalling type (FXS/FXO/E&M) per circuit plan.',
    'Save configuration, then test each circuit end-to-end with the far station (ring, speech, level) and record the results.',
  ],
  ledsAndAlarms: [
    { indicator: 'PWR', meaning: 'Power OK (green) / feed failed (off/red)', action: 'Check −48 V DC feed, fuse, power card.' },
    { indicator: 'E1 LOS', meaning: 'No incoming E1 signal on the aggregate', action: 'Check E1 cable/DDF, SDH tributary port, loopbacks.' },
    { indicator: 'LOF (loss of frame alignment)', meaning: 'Signal present but TS0 frame alignment not found', action: 'Check framing settings (CRC-4 on/off) both ends; check for a wrong cross-connect.' },
    { indicator: 'LOMF', meaning: 'Loss of CAS multiframe alignment in TS16', action: 'Check CAS setting both ends.' },
    { indicator: 'AIS', meaning: 'All-ones signal received: an upstream failure (e.g. SDH LOS/TU-AIS) replaced the E1 with AIS', action: 'Not a local fault — look upstream on the SDH network.' },
    { indicator: 'RAI / RDI', meaning: 'Far end reports it is not receiving our signal correctly', action: 'Check our transmit direction towards the far end.' },
    { indicator: 'BER 1E-3 / 1E-6', meaning: 'Excessive or degraded bit errors', action: 'Check cabling, earthing, slips/synchronisation, SDH errors.' },
    { indicator: 'SLIP', meaning: 'Frame slips — clock mismatch', action: 'Use line (loop) timing from the network; check SDH sync.' },
    { indicator: 'CARD FAIL', meaning: 'Card fault or not configured', action: 'Reseat/replace card with ESD precautions, reload config.' },
  ],
  maintenance: [
    { frequency: 'daily', check: 'Look at alarm LEDs / NMS alarm list; confirm control circuit is working with the controller.' },
    { frequency: 'weekly', check: 'Test-call each VF circuit (control, emergency, auto-phone extension).' },
    { frequency: 'monthly', check: 'Measure VF levels on key channels; check earthing and −48 V DC.' },
    { frequency: 'quarterly', check: 'Back up configuration; check cards and fans; clean dust filters.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'All channels at the station are dead.', hi: 'Station ke saare channels dead hain.' },
      likelyCause: 'E1 aggregate lost (LOS/AIS) — cable, SDH tributary or upstream fibre fault.',
      howToCheck: 'Check E1 LOS/AIS LEDs; if AIS, look at SDH alarms; loop back at the DDF.',
      fix: 'Restore E1/SDH path; replace E1 cable or card.',
    },
    {
      symptom: { en: 'Controller can hear the station but the station cannot hear the controller.', hi: 'Controller ko station sunai deta hai, par station ko controller nahi.' },
      likelyCause: 'One-way VF path: wrong Rx level, faulty 4W card receive side, or a one-way cross-connect.',
      howToCheck: 'Measure Rx level on the channel; check timeslot mapping both directions.',
      fix: 'Correct level/mapping; replace card.',
    },
    {
      symptom: { en: 'Phone does not ring, but speech works when picked up.', hi: 'Phone ki ghanti nahi bajti, par uthane par baat ho jaati hai.' },
      likelyCause: 'FXS ring generator fault or CAS/signalling mismatch.',
      howToCheck: 'Check FXS card alarms and CAS (TS16) settings at both ends.',
      fix: 'Replace FXS card or correct signalling type.',
    },
    {
      symptom: { en: 'Block line dead, control phone working fine.', hi: 'Block line dead hai, control phone theek chal raha hai.' },
      likelyCause: 'E1 is fine; fault is in the block channel — 2W/VF card, timeslot mapping, or quad pair to the block instrument.',
      howToCheck: 'Check that channel’s timeslot both ends; test the quad pair; check VF card.',
      fix: 'Correct mapping or replace card/pair — under proper disconnection procedure.',
    },
    {
      symptom: { en: 'Crackling noise and periodic clicks on all channels.', hi: 'Saare channels par khar-khar aur beech-beech mein click.' },
      likelyCause: 'Frame slips (clock mismatch) or high BER.',
      howToCheck: 'Check SLIP and BER counters; verify clock source is line/loop timed.',
      fix: 'Set correct timing; fix SDH sync or cabling.',
    },
  ],
  safetyNotes: [
    SAFETY_48V,
    SAFETY_ESD,
    {
      en: 'Some channels carry safety-critical circuits (block, BPAC). Never reassign, loop or disconnect a channel without the proper disconnection notice and coordination with the Station Master.',
      hi: 'Kuch channels safety-critical circuits (block, BPAC) le jaate hain. Bina disconnection notice aur SM se coordination ke kisi channel ko reassign, loop ya disconnect mat karo.',
    },
  ],
  migrationNote: {
    en: 'Option 1: PD-Mux is retained at first. Its E1 keeps riding SDH; later the same E1 is carried over IP-MPLS as a TDM pseudowire (SAToP for a whole E1, CESoPSN for selected timeslots) from an LER or hybrid aggregation box. Eventually VF cards in a hybrid box can replace it.',
    hi: 'Option 1: shuru mein PD-Mux rehta hai. Uska E1 SDH par hi chalta hai; baad mein wahi E1 IP-MPLS par TDM pseudowire (poora E1 ho to SAToP, kuch timeslots ho to CESoPSN) se LER ya hybrid box ke through jaata hai. Aakhir mein hybrid box ke VF cards isse replace kar sakte hain.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'In a CAS E1, which timeslots are NOT available for user channels?',
      options: ['TS1 and TS31', 'TS0 and TS16', 'TS15 and TS17', 'Only TS0'],
      correctIndex: 1,
      explanation: 'TS0 carries frame alignment and TS16 carries channel-associated signalling, leaving 30 user channels.',
    },
    {
      prompt: 'Which card would you use to connect a way-station telephone that needs battery and ringing from the mux?',
      options: ['FXO', 'E&M', 'FXS', 'E1 interface'],
      correctIndex: 2,
      explanation: 'FXS supplies loop battery and ringing current, like an exchange line does for a phone.',
    },
    {
      prompt: 'The PD-Mux shows AIS on its E1. What is the most likely meaning?',
      options: ['The PD-Mux E1 card has failed', 'An upstream SDH failure replaced the E1 with all-ones', 'The VF levels are wrong', 'TS16 is misconfigured'],
      correctIndex: 1,
      explanation: 'AIS is inserted downstream of a failure to suppress alarms; the real fault is upstream.',
    },
  ],
  glossary: [
    { term: 'E1', meaning: '2.048 Mbit/s digital stream with 32 × 64 kbit/s timeslots (ITU-T G.704).' },
    { term: 'TS0', meaning: 'Timeslot 0: frame alignment signal and spare/CRC bits.' },
    { term: 'TS16', meaning: 'Timeslot 16: channel-associated signalling (CAS) for the 30 voice channels.' },
    { term: 'CAS', meaning: 'Channel-associated signalling: on/off-hook and ringing bits carried in TS16.' },
    { term: 'FXS', meaning: 'Foreign Exchange Station: port that feeds a telephone (battery, ring).' },
    { term: 'FXO', meaning: 'Foreign Exchange Office: port that connects to an exchange line like a phone.' },
    { term: 'E&M', meaning: 'Ear & Mouth: trunk signalling interface between exchanges/equipment.' },
    { term: 'Omnibus', meaning: 'A VF channel bridged at every station so all stations share one circuit (e.g. section control).' },
    { term: 'Drop-insert', meaning: 'Taking selected channels out at a station and adding local ones, passing the rest through.' },
    { term: 'HDB3', meaning: 'Line code used on E1 copper to keep enough transitions for clock recovery.' },
    { term: 'AIS', meaning: 'Alarm Indication Signal: all-ones sent downstream of a failure.' },
  ],
  sources: [SRC_CAMTECH, 'ITU-T G.703', 'ITU-T G.704', 'ITU-T G.732', 'ITU-T G.711', SRC_IR_TELECOM_MANUAL],
};

// ---------------------------------------------------------------------------
// SDH ADMs (STM-1 / STM-4 / STM-16) — shared content, level-specific numbers
// ---------------------------------------------------------------------------

type AdmLevel = 1 | 4 | 16;

const ADM_RATE: Record<AdmLevel, string> = { 1: '155.52', 4: '622.08', 16: '2488.32' };
const ADM_E1: Record<AdmLevel, number> = { 1: 63, 4: 252, 16: 1008 };

function admDoc(level: AdmLevel): DeviceDoc {
  const n = `STM-${level}`;
  const rate = ADM_RATE[level];
  const e1 = ADM_E1[level];
  const kind = level === 1 ? 'adm-stm1' : level === 4 ? 'adm-stm4' : 'adm-stm16';
  const where =
    level === 1
      ? ['Every station on the section (OFC hut / telecom room)']
      : level === 4
        ? ['Junction stations and divisional HQ', 'Major stations aggregating several STM-1 rings']
        : ['Divisional / zonal HQ core', 'Backbone between major junctions'];
  const roleEn =
    level === 1
      ? 'The workhorse on Indian Railways sections: an STM-1 ADM at every station on 2-core OFC, carrying PD-Mux E1s (control, block, BPAC, auto-phones), Railnet/UTS/PRS/FOIS data and SCADA links station to station.'
      : `Aggregates traffic from several STM-1 rings at junctions or the divisional HQ and links them over higher-capacity ${n} rings.`;
  const roleHi =
    level === 1
      ? 'Indian Railways sections ka workhorse: har station par 2-core OFC par STM-1 ADM, jo PD-Mux ke E1 (control, block, BPAC, auto-phone), Railnet/UTS/PRS/FOIS data aur SCADA links ko station-to-station le jaata hai.'
      : `Junction ya divisional HQ par kai STM-1 rings ka traffic ikattha karke use bade ${n} ring par aage bhejta hai.`;

  return {
    type: kind,
    fullName: `${n} SDH Add-Drop Multiplexer (ADM)`,
    oneLiner: {
      en: `SDH node at ${rate} Mbit/s that adds, drops or passes through up to ${e1} E1s on an optical ring.`,
      hi: `${rate} Mbit/s ka SDH node jo optical ring par ${e1} tak E1 add, drop ya pass-through karta hai.`,
    },
    overview: {
      en: [
        `An ${n} ADM is a Synchronous Digital Hierarchy node with two optical “aggregate” ports (East and West) running at ${rate} Mbit/s.`,
        'Tributary cards accept E1s, Ethernet or lower-rate STM signals; each E1 is mapped into a VC-12 container.',
        'A cross-connect decides which VC-12 is dropped at this station, which is added, and which simply passes through.',
        'Because everything is locked to one network clock, a single E1 can be picked out of the line signal without demultiplexing the whole stream.',
        'Rings with MSP or SNCP protection switch traffic to the other direction in under 50 ms when a fibre is cut.',
        'Analogy: the ring is a circular railway line; VC-12s are reserved coaches; the cross-connect is the station yard deciding which coach is detached, attached or runs through.',
      ].join('\n'),
      hi: [
        `${n} ADM ek SDH node hai jismein do optical “aggregate” ports (East aur West) ${rate} Mbit/s par chalte hain.`,
        'Tributary cards E1, Ethernet ya chhote STM signal lete hain; har E1 ek VC-12 container mein map hota hai.',
        'Cross-connect tay karta hai ki kaunsa VC-12 is station par drop hoga, kaunsa add hoga, aur kaunsa seedha pass-through.',
        'Poora network ek hi clock par locked hai, isliye poore stream ko khole bina ek E1 nikala ja sakta hai.',
        'MSP ya SNCP protection wale ring mein fibre cut hone par traffic 50 ms se kam mein doosri direction mein switch ho jaata hai.',
        'Misaal: ring ek circular railway line hai; VC-12 reserved coaches hain; cross-connect station yard hai jo tay karta hai kaunsa coach kaatna, jodna ya aage bhejna hai.',
      ].join('\n'),
    },
    railwayRole: { en: roleEn, hi: roleHi },
    whereInstalled: where,
    layer: ['physical', 'TDM (PDH/SDH)'],
    cardsAndModules: [
      'Power supply cards (−48 V DC, usually duplicated)',
      'Controller / NMS card (DCC termination, EMS/LCT access)',
      'Cross-connect + timing card (SETS), often duplicated',
      `Aggregate (line) optical cards: ${n} East / West`,
      'Tributary cards: E1 (21 or 63 ports per card, typical), E3/DS3 (optional), STM-1 optical/electrical tributaries',
      'Ethernet over SDH card (GFP-F mapping, VCAT, LCAS)',
      'Fan tray, order-wire/overhead card (optional)',
    ],
    ports: [
      { name: `${n}-E / ${n}-W`, medium: 'Single-mode fibre (G.652)', connector: 'LC or SC (typical)', rate: `${rate} Mbit/s`, purpose: 'Aggregate ring ports to neighbouring stations' },
      { name: 'E1-n', medium: 'Copper pair / coax', connector: '120 Ω (krone/DDF) or 75 Ω BNC', rate: '2.048 Mbit/s', purpose: 'Tributaries from PD-Mux, exchange, routers' },
      ...(level > 1 ? [{ name: 'STM1-Tn', medium: 'Single-mode fibre', connector: 'LC (typical)', rate: '155.52 Mbit/s', purpose: 'STM-1 tributary from a station ring' }] : []),
      ...(level === 16 ? [{ name: 'STM4-Tn', medium: 'Single-mode fibre', connector: 'LC (typical)', rate: '622.08 Mbit/s', purpose: 'STM-4 tributary' }] : []),
      { name: 'FE-n / GE-n', medium: 'Cat6 or fibre', connector: 'RJ45 / SFP', rate: '10/100/1000 Mbit/s', purpose: 'Ethernet over SDH (EoS) for LAN extension' },
      { name: 'LCT / NMS', medium: 'Cat6 / serial', connector: 'RJ45 / DB9', rate: '10/100 Mbit/s', purpose: 'Craft terminal and EMS' },
      { name: 'Sync in/out', medium: 'Coax / pair', connector: 'BNC / 120 Ω', rate: '2.048 MHz or 2.048 Mbit/s', purpose: 'External clock (BITS/SSU) T3 in, T4 out' },
    ],
    typicalSpecs: [
      { param: 'Line rate', value: `${rate} Mbit/s`, note: 'Standard (ITU-T G.707)' },
      { param: 'E1 capacity', value: `${e1} × E1 (${level} × 63)`, note: 'Standard mapping via VC-12' },
      { param: 'Mapping', value: 'E1 → C-12 → VC-12 → TU-12 → TUG-2 → TUG-3 → VC-4 → AU-4 → AUG → STM-N', note: 'Standard (G.707)' },
      { param: 'Frame', value: `125 µs; 9 rows × ${270 * level} columns`, note: 'Standard (G.707)' },
      { param: 'Protection switch time', value: '≤ 50 ms', note: 'Standard target (G.841)' },
      { param: 'Optical interfaces', value: level === 1 ? 'S-1.1 / L-1.1 / L-1.2' : level === 4 ? 'S-4.1 / L-4.1 / L-4.2' : 'S-16.1 / L-16.1 / L-16.2', note: 'Standard classes (ITU-T G.957)' },
      { param: 'Clock accuracy (free-run)', value: '± 4.6 ppm (SEC)', note: 'Standard (ITU-T G.813)' },
      { param: 'Power', value: '−48 V DC, 100–300 W', note: 'Typical, depends on cards' },
    ],
    connectsTo: [
      { device: kind, link: 'ofc', note: `Aggregate East/West to neighbouring ${n} nodes (same rate both ends)` },
      { device: 'pdmux', link: 'e1-copper', note: 'E1 tributary from the station PD-Mux' },
      { device: 'exchange', link: 'e1-copper', note: 'E1/PRI trunks between exchanges' },
      { device: 'router', link: 'e1-copper', note: 'E1 WAN for Railnet/UTS (legacy)' },
      { device: 'l2-switch', link: 'cat6', note: 'Ethernet over SDH port for station LAN extension' },
      { device: 'cwdm-mux', link: 'cwdm-lambda', note: 'Option 1 migration: coloured optic into a CWDM channel' },
      ...(level > 1 ? [{ device: 'adm-stm1', link: 'ofc' as const, note: 'STM-1 tributary to a station ring' }] : []),
    ],
    protocolsStandards: [
      'ITU-T G.707 (SDH frame and mapping)',
      'ITU-T G.783 (SDH equipment functional blocks, alarms)',
      'ITU-T G.841 (protection: MSP, MS-SPRing, SNCP)',
      'ITU-T G.957 (optical interfaces)',
      'ITU-T G.813 (SDH equipment clock, SEC)',
      'ITU-T G.7041 (GFP), G.7042 (LCAS)',
      'ITU-T G.703 (E1 tributary interface)',
    ],
    configBasics: [
      'Connect the LCT to the craft port (or log in from the EMS); set node name, NE address and DCC so the EMS can reach it over the fibre.',
      'Verify cards in each slot match the provisioned configuration.',
      'Configure aggregate optical ports (East/West): enable laser, set J0 trace if used, check Rx power is within the optic range.',
      'Configure timing (SETS): choose priority list — e.g. T1 from East line, T1 from West line, then T3 external; enable SSM.',
      'Create cross-connects per VC-12 (K-L-M position): drop (line ↔ E1 tributary), add, or pass-through (East ↔ West).',
      'Configure protection: SNCP on each VC-12 path (working + protection route) or MSP 1+1 on line ports, with hold-off/wait-to-restore times.',
      'Enable tributary E1 ports and set framing monitoring as required; save and back up the configuration.',
      'Verify end to end: no alarms, then test each E1 with a BER tester or by checking the PD-Mux at the far end.',
    ],
    ledsAndAlarms: [
      { indicator: 'LOS', meaning: 'Loss of signal on an optical port — no light (fibre cut, Tx off, dirty connector)', action: 'Measure Rx power; check fibre, patch cords, far-end laser.' },
      { indicator: 'LOF', meaning: 'Light present but A1/A2 frame alignment lost', action: 'Check rate/optic mismatch, high errors, wrong fibre.' },
      { indicator: 'MS-AIS', meaning: 'Multiplex-section AIS received (K2 bits) — upstream regenerator section failed', action: 'Fault is upstream; follow the alarm chain.' },
      { indicator: 'MS-RDI', meaning: 'Far end reports it has LOS/LOF/MS-AIS on what we send', action: 'Check our transmit fibre and laser towards that neighbour.' },
      { indicator: 'AU-AIS / AU-LOP', meaning: 'VC-4 path failed upstream / pointer lost', action: 'Check upstream line alarms and cross-connects.' },
      { indicator: 'HP-RDI', meaning: 'Far-end VC-4 path termination has a defect', action: 'Check the transmit direction of the VC-4 path.' },
      { indicator: 'TU-AIS', meaning: 'VC-12 path failed upstream (or unequipped cross-connect)', action: 'Check the VC-12 cross-connect along the path; check protection status.' },
      { indicator: 'LP-RDI', meaning: 'Far end reports a defect on the VC-12 path', action: 'Check the transmit direction of that E1’s path.' },
      { indicator: 'B1/B2/B3/BIP-2 EXC/DEG', meaning: 'Excessive or degraded bit errors on section/path', action: 'Check optical levels, connectors, splices; clean and re-measure.' },
      { indicator: 'SYNC / Holdover / Free-run', meaning: 'Selected timing source lost', action: 'Check timing references and SSM; restore line or external sync.' },
      { indicator: 'Tributary E1 LOS', meaning: 'No E1 signal from the local PD-Mux/exchange', action: 'Check E1 cable/DDF and the local equipment.' },
    ],
    maintenance: [
      { frequency: 'daily', check: 'Review EMS alarm list and performance counters (ES/SES) for all nodes on the ring.' },
      { frequency: 'weekly', check: 'Check protection status — both SNCP paths/MSP sides healthy and no switch left active.' },
      { frequency: 'monthly', check: 'Record optical Rx power on each aggregate port and compare with the commissioning value.' },
      { frequency: 'quarterly', check: 'Back up NE configuration; check fans, filters, earthing and −48 V DC.' },
      { frequency: 'yearly', check: 'Planned protection switch test (in a maintenance block, with coordination).' },
    ],
    commonFaults: [
      {
        symptom: { en: 'All circuits beyond one station lost; LOS alarm on one aggregate.', hi: 'Ek station ke aage ke saare circuits gaye; ek aggregate par LOS alarm.' },
        likelyCause: 'Fibre cut or optic failure on that span; protection did not switch (not configured or both paths hit).',
        howToCheck: 'Check LOS at both ends of the span, Rx power, OTDR on the fibre; check protection state.',
        fix: 'Repair fibre/optic; verify SNCP/MSP is provisioned for all critical VC-12s.',
      },
      {
        symptom: { en: 'Only one E1 is dead, the rest work; TU-AIS seen.', hi: 'Sirf ek E1 dead hai, baaki chal rahe; TU-AIS dikh raha.' },
        likelyCause: 'Missing or wrong VC-12 cross-connect somewhere on the path.',
        howToCheck: 'Trace the VC-12 (K-L-M) through every node’s cross-connect table.',
        fix: 'Create/correct the cross-connect.',
      },
      {
        symptom: { en: 'Intermittent errors and clicks on circuits after rain.', hi: 'Baarish ke baad circuits par beech-beech mein errors aur click.' },
        likelyCause: 'Water ingress in a joint, raising loss; or a marginal optical budget.',
        howToCheck: 'Compare Rx power with commissioning; check B1/B2 counters; OTDR for a step loss.',
        fix: 'Repair joint; clean connectors; restore margin.',
      },
      {
        symptom: { en: 'Slips on all E1s across the ring.', hi: 'Ring ke saare E1 par slips.' },
        likelyCause: 'Timing loop or nodes in holdover/free-run; wrong SSM settings.',
        howToCheck: 'Check each NE’s selected timing source and SSM quality.',
        fix: 'Correct timing priorities so the ring follows one reference without loops.',
      },
    ],
    safetyNotes: [
      SAFETY_LASER,
      SAFETY_48V,
      SAFETY_ESD,
      {
        en: 'A ring carries many safety-related circuits (block, BPAC, control). Changes to cross-connects or protection must be planned, coordinated with control and done in an approved block.',
        hi: 'Ring par kai safety-related circuits (block, BPAC, control) chalte hain. Cross-connect ya protection mein badlaav planned, control se coordinate karke aur approved block mein hi karo.',
      },
    ],
    migrationNote: {
      en: 'Option 1: the SDH ring is retained and keeps carrying unmigrated circuits. At each span the optics are made coloured (or a CWDM mux is added) so the IP-MPLS ring rides another wavelength on the same fibre. Circuits move to IP-MPLS one by one; finally the SDH can be decommissioned.',
      hi: 'Option 1: SDH ring bana rehta hai aur jo circuits abhi migrate nahi hue unhe le jaata hai. Har span par coloured optics (ya CWDM mux) lagate hain taaki IP-MPLS ring usi fibre par alag wavelength par chale. Circuits ek-ek karke IP-MPLS par jaate hain; aakhir mein SDH hata sakte hain.',
    },
    vendorExamples: ['Generic'],
    relatedLabs: [],
    quickQuiz: [
      {
        prompt: `How many E1s can one ${n} carry using VC-12 mapping?`,
        options: [String(e1 / 3), String(e1), String(e1 * 2), String(level * 32)],
        correctIndex: 1,
        explanation: `Each STM-1 carries one VC-4 = 3 TUG-3 × 7 TUG-2 × 3 TU-12 = 63 VC-12; ${n} has ${level} × 63 = ${e1}.`,
      },
      {
        prompt: 'A fibre is cut between two ADMs. Which alarm does the downstream ADM raise first on that port?',
        options: ['RDI', 'LOS', 'TU-AIS', 'SLIP'],
        correctIndex: 1,
        explanation: 'No light arrives, so LOS is raised locally; AIS is then sent downstream and RDI back upstream.',
      },
      {
        prompt: 'SNCP protection works at which level?',
        options: ['Whole fibre only', 'Per path (e.g. per VC-12), selecting the better of two routes', 'Only on Ethernet ports', 'Inside the PD-Mux'],
        correctIndex: 1,
        explanation: 'SNCP is sub-network connection protection: the receiving node selects the better of the working and protection paths per VC.',
      },
    ],
    glossary: [
      { term: 'SDH', meaning: 'Synchronous Digital Hierarchy — ITU-T TDM transmission standard (G.707).' },
      { term: 'STM-N', meaning: `Synchronous Transport Module level N; STM-1 = 155.52 Mbit/s.` },
      { term: 'VC-12', meaning: 'Virtual container that carries one E1 across the SDH network.' },
      { term: 'VC-4', meaning: 'High-order virtual container filling one STM-1 payload (carries 63 VC-12).' },
      { term: 'TU-12 / TUG-2 / TUG-3', meaning: 'Tributary units and groups used to multiplex VC-12s into a VC-4.' },
      { term: 'AU-4 / AUG', meaning: 'Administrative unit (VC-4 + pointer) and its group placed into the STM-N frame.' },
      { term: 'Cross-connect', meaning: 'Switching of containers between ports: add, drop or pass-through.' },
      { term: 'MSP 1+1', meaning: 'Multiplex Section Protection: a standby line takes over using K1/K2 bytes.' },
      { term: 'SNCP', meaning: 'Sub-Network Connection Protection: per-path protection selecting the better route.' },
      { term: 'SETS', meaning: 'Synchronous Equipment Timing Source: selects the clock reference for the NE.' },
      { term: 'LOS', meaning: 'Loss Of Signal: no optical/electrical signal detected.' },
      { term: 'LOF', meaning: 'Loss Of Frame: signal present but frame alignment lost.' },
      { term: 'AIS', meaning: 'Alarm Indication Signal: sent downstream to say “upstream failed”.' },
      { term: 'RDI', meaning: 'Remote Defect Indication: sent back upstream to say “I am not receiving you”.' },
      { term: 'DCC', meaning: 'Data Communication Channel in SDH overhead used for EMS management.' },
      { term: 'LCT', meaning: 'Local Craft Terminal: laptop software to configure an NE on site.' },
    ],
    sources: [SRC_CAMTECH, 'ITU-T G.707', 'ITU-T G.783', 'ITU-T G.841', 'ITU-T G.957', 'ITU-T G.813', SRC_IR_TELECOM_MANUAL],
  };
}

export const admStm1Doc = admDoc(1);
export const admStm4Doc = admDoc(4);
export const admStm16Doc = admDoc(16);

// ---------------------------------------------------------------------------
// CWDM
// ---------------------------------------------------------------------------

export const cwdmDoc: DeviceDoc = {
  type: 'cwdm-mux',
  fullName: 'Coarse Wavelength Division Multiplexer / Demultiplexer (CWDM Mux/Demux)',
  oneLiner: {
    en: 'Passive optical filter that puts several colours of light on one fibre so SDH and IP-MPLS can share it.',
    hi: 'Passive optical filter: ek fibre par kai rang ki light, taaki SDH aur IP-MPLS ek fibre share karein.',
  },
  overview: {
    en: [
      'CWDM sends several signals over one fibre, each on its own wavelength (“colour”) of light.',
      'The ITU-T G.694.2 grid has 18 channels from 1271 nm to 1611 nm, spaced 20 nm apart.',
      'The mux/demux is passive: no power, no software — just optical filters. Each channel port accepts one coloured optic.',
      'The equipment on each channel needs a coloured SFP/optic matching that channel’s wavelength.',
      'Every pass through a filter costs insertion loss, which must be added to the optical budget.',
      'Analogy: one railway track carrying trains in different colours, each sorted onto its own platform at the end.',
    ].join('\n'),
    hi: [
      'CWDM ek fibre par kai signals bhejta hai, har ek apni alag wavelength (“rang”) par.',
      'ITU-T G.694.2 grid mein 1271 nm se 1611 nm tak 18 channels hain, 20 nm ke gap par.',
      'Mux/demux passive hai: na power, na software — sirf optical filters. Har channel port par ek coloured optic lagta hai.',
      'Har channel ke equipment mein usi wavelength ka coloured SFP/optic chahiye.',
      'Har filter se guzarne par insertion loss lagta hai, jo optical budget mein jodna padta hai.',
      'Misaal: ek hi track par alag-alag rang ki trains, jo end par apne-apne platform par chhaant di jaati hain.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Key enabler of CAMTECH migration Option 1: the existing SDH ring and the new IP-MPLS ring run on the same OFC fibre using different CWDM wavelengths, so no new fibre is needed during migration.',
    hi: 'CAMTECH migration Option 1 ka mukhya hissa: purana SDH ring aur naya IP-MPLS ring same OFC fibre par alag CWDM wavelengths par chalte hain, isliye migration mein naya fibre nahi chahiye.',
  },
  whereInstalled: ['Station OFC termination rack (next to the FMS/ODF)', 'Junction stations'],
  layer: ['physical'],
  cardsAndModules: [
    'Passive filter module (4, 8 or 16 channels typical) in a 1U chassis or cassette',
    'Optional upgrade/expansion port and monitor tap (some models)',
    'No power supply or controller (passive)',
  ],
  ports: [
    { name: 'LINE (COM)', medium: 'Single-mode fibre', connector: 'LC/SC (typical)', rate: 'Rate-agnostic', purpose: 'Common port to the outside-plant fibre towards the next station' },
    { name: 'CHxxxx', medium: 'Single-mode fibre patch', connector: 'LC (typical)', rate: 'Rate-agnostic', purpose: 'One wavelength each (e.g. CH1551) — patch to a coloured optic on SDH or router' },
  ],
  typicalSpecs: [
    { param: 'Channel grid', value: '1271–1611 nm, 20 nm spacing, 18 channels', note: 'Standard (ITU-T G.694.2)' },
    { param: 'Channel passband', value: '± 6.5 nm around centre', note: 'Typical' },
    { param: 'Insertion loss (mux or demux)', value: '1.5–3 dB per pass', note: 'Typical — add mux + demux to the span budget' },
    { param: 'Adjacent channel isolation', value: '> 30 dB', note: 'Typical' },
    { param: 'Power', value: 'None (passive)', note: 'Typical — passive filters need no power' },
    { param: 'Fibre note', value: 'Channels near 1383 nm suffer extra loss on older fibre (water peak); G.652.D low-water-peak fibre supports all 18', note: 'Standard fibre types (ITU-T G.652)' },
  ],
  connectsTo: [
    { device: 'cwdm-mux', link: 'ofc', note: 'LINE to LINE over the outside-plant fibre between stations' },
    { device: 'adm-stm1', link: 'cwdm-lambda', note: 'Coloured STM-1 optic into one channel' },
    { device: 'ler', link: 'cwdm-lambda', note: 'Coloured 1G/10G SFP of the MPLS router into another channel' },
    { device: 'lsr', link: 'cwdm-lambda', note: 'Coloured SFP at junctions' },
  ],
  protocolsStandards: ['ITU-T G.694.2 (CWDM wavelength grid)', 'ITU-T G.695 (CWDM optical interfaces)', 'ITU-T G.652 (single-mode fibre)'],
  configBasics: [
    'Plan wavelengths per span: e.g. one channel for SDH, one or two for IP-MPLS. Both ends must use the same channel for a given system.',
    'Replace grey optics with coloured optics of the planned wavelength (SFP must match the channel exactly).',
    'Patch each coloured optic to the matching CHxxxx port; patch LINE to the outside fibre on the FMS.',
    'Recalculate the optical budget: Tx − (fibre + splices + connectors + mux IL + demux IL) must stay above Rx sensitivity with margin.',
    'Measure Rx power per channel at the far end (router DDM or power meter) and record it.',
    'Label every patch cord with channel and destination.',
  ],
  ledsAndAlarms: [
    { indicator: '(none on unit)', meaning: 'Passive device has no LEDs or alarms', action: 'Monitor via the optics’ DDM (Rx power) on the SDH/router ports.' },
    { indicator: 'LOS on one channel only', meaning: 'Only that wavelength is missing', action: 'Check that channel’s patch cord and coloured optic; check wavelength matches the port.' },
    { indicator: 'LOS on all channels', meaning: 'Common fibre (LINE) problem', action: 'Check LINE patch, FMS, outside-plant fibre (OTDR).' },
  ],
  maintenance: [
    { frequency: 'monthly', check: 'Record Rx power on each channel from the equipment DDM; compare with commissioning values.' },
    { frequency: 'quarterly', check: 'Inspect and clean connectors with a fibre scope; check labelling and bend radius of patch cords.' },
    { frequency: 'as required', check: 'Before adding a channel, recompute budget and confirm the wavelength is free at both ends.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'New MPLS link stays down, SDH on the same fibre is fine.', hi: 'Naya MPLS link down hai, usi fibre par SDH theek chal raha.' },
      likelyCause: 'Wrong-colour SFP or patched to the wrong channel port.',
      howToCheck: 'Read the SFP wavelength (DDM/label) and compare with the channel port at both ends.',
      fix: 'Fit the correct coloured SFP / correct patching.',
    },
    {
      symptom: { en: 'Both SDH and MPLS went down together at one span.', hi: 'Ek span par SDH aur MPLS dono saath mein down.' },
      likelyCause: 'Common fibre (LINE side) cut or dirty connector.',
      howToCheck: 'OTDR from the FMS; check LINE patch cord.',
      fix: 'Repair fibre / clean or replace patch.',
    },
    {
      symptom: { en: 'Link up but errors increase after adding CWDM.', hi: 'CWDM lagane ke baad link up hai par errors badh gaye.' },
      likelyCause: 'Optical budget reduced by insertion loss — margin too small.',
      howToCheck: 'Compare Rx power with sensitivity; include mux + demux IL.',
      fix: 'Use higher-budget optics or reduce connectors/splices.',
    },
  ],
  safetyNotes: [SAFETY_LASER, {
    en: 'The LINE port carries every wavelength: unplugging it cuts SDH and IP-MPLS together. Plan and coordinate before touching it.',
    hi: 'LINE port par saari wavelengths hoti hain: ise nikaalne se SDH aur IP-MPLS dono kat jaate hain. Chhoone se pehle plan aur coordinate karo.',
  }],
  migrationNote: {
    en: 'Introduced for Option 1 migration. After migration, the CWDM can stay in place to carry the IP-MPLS ring (and spare wavelengths for future systems) or be removed if the SDH is decommissioned and grey optics are reused.',
    hi: 'Option 1 migration ke liye lagaya jaata hai. Migration ke baad CWDM IP-MPLS ring (aur future systems ke spare wavelengths) ke liye reh sakta hai, ya SDH hatne par grey optics ke saath hata sakte hain.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'What is the channel spacing of the ITU-T G.694.2 CWDM grid?',
      options: ['0.8 nm', '5 nm', '20 nm', '100 nm'],
      correctIndex: 2,
      explanation: 'CWDM uses a coarse 20 nm grid from 1271 to 1611 nm (DWDM uses ~0.8 nm).',
    },
    {
      prompt: 'Why is CWDM useful in SDH → IP-MPLS migration Option 1?',
      options: ['It increases SDH line rate', 'Both networks share the same fibre on different wavelengths', 'It converts SDH to Ethernet', 'It replaces the PD-Mux'],
      correctIndex: 1,
      explanation: 'Option 1 runs SDH and IP-MPLS side by side on the existing fibre without laying new cable.',
    },
    {
      prompt: 'After adding a CWDM mux at both ends, what must you add to the optical budget?',
      options: ['Nothing — it is passive', 'Mux and demux insertion loss', 'Only connector loss', 'Chromatic dispersion only'],
      correctIndex: 1,
      explanation: 'Passive does not mean lossless: each filter pass adds insertion loss.',
    },
  ],
  glossary: [
    { term: 'CWDM', meaning: 'Coarse WDM: few wavelengths, 20 nm apart, low-cost uncooled lasers.' },
    { term: 'Lambda (λ)', meaning: 'A wavelength / optical channel.' },
    { term: 'Coloured optic', meaning: 'An SFP/transceiver fixed to one CWDM wavelength.' },
    { term: 'Insertion loss', meaning: 'Optical power lost passing through a component.' },
    { term: 'Water peak', meaning: 'Higher fibre attenuation near 1383 nm on older fibre types.' },
    { term: 'DDM', meaning: 'Digital Diagnostic Monitoring: optic reports Tx/Rx power and temperature.' },
  ],
  sources: [SRC_CAMTECH, 'ITU-T G.694.2', 'ITU-T G.695', 'ITU-T G.652'],
};

// ---------------------------------------------------------------------------
// Exchange
// ---------------------------------------------------------------------------

export const exchangeDoc: DeviceDoc = {
  type: 'exchange',
  fullName: 'Railway Telephone Exchange (Electronic / ISDN / IP-PBX)',
  oneLiner: {
    en: 'Switches railway auto-phone calls between subscribers, other exchanges and IP phones.',
    hi: 'Railway auto-phone calls ko subscribers, doosre exchanges aur IP phones ke beech switch karta hai.',
  },
  overview: {
    en: [
      'The railway exchange connects internal “auto phones” of offices, stations and colonies on the railway numbering plan.',
      'Subscriber lines (FXS) feed analogue phones; trunks connect to other exchanges over E1 (ISDN PRI or CAS) or E&M via the PD-Mux.',
      'Modern exchanges are ISDN/IP-PBX hybrids that also register SIP/IP phones over the LAN.',
      'Remote stations get an extension through the PD-Mux (exchange FXS → mux FXO, carried on a timeslot, → far-end mux FXS → phone).',
      'Analogy: the exchange is the junction station of calls — it routes each call to the right line.',
    ].join('\n'),
    hi: [
      'Railway exchange offices, stations aur colonies ke internal “auto phones” ko railway numbering plan par jodta hai.',
      'Subscriber lines (FXS) analogue phones ko feed karti hain; trunks doosre exchanges se E1 (ISDN PRI ya CAS) ya PD-Mux ke E&M se judte hain.',
      'Naye exchanges ISDN/IP-PBX hybrid hote hain jo LAN par SIP/IP phones bhi register karte hain.',
      'Door ke station ko extension PD-Mux se milta hai (exchange FXS → mux FXO → timeslot → door ka mux FXS → phone).',
      'Misaal: exchange calls ka junction station hai — har call ko sahi line par bhejta hai.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Administrative and operational auto-phone network: officers, SM offices, control offices, maintenance depots, colonies; trunk links between divisional/zonal exchanges.',
    hi: 'Administrative aur operational auto-phone network: officers, SM office, control office, depots, colonies; divisional/zonal exchanges ke beech trunk links.',
  },
  whereInstalled: ['Divisional HQ / major stations (exchange room)', 'Zonal HQ'],
  layer: ['physical', 'TDM (PDH/SDH)', 'application'],
  cardsAndModules: [
    'Power supply (−48 V DC with battery backup, typical)',
    'Control processor (call control, numbering plan)',
    'Subscriber line cards (FXS)',
    'Trunk cards: E1 (ISDN PRI / CAS), E&M, analogue FXO',
    'IP/VoIP gateway card (SIP trunks, IP phones)',
    'Ring generator, tone/announcement module',
  ],
  ports: [
    { name: 'E1-n', medium: 'Copper pair', connector: '120 Ω krone / RJ48', rate: '2.048 Mbit/s', purpose: 'ISDN PRI (30B+D) or CAS trunks' },
    { name: 'SUB-n', medium: 'Telephone pair', connector: 'Krone / MDF', rate: 'Analogue', purpose: 'FXS subscriber lines to phones or to PD-Mux FXO' },
    { name: 'EM-n', medium: '4W + E/M leads', connector: 'Krone', rate: 'Analogue', purpose: 'E&M trunks via PD-Mux' },
    { name: 'LAN', medium: 'Cat6', connector: 'RJ45', rate: '1 Gbit/s', purpose: 'IP phones, SIP trunks, management' },
  ],
  typicalSpecs: [
    { param: 'PRI capacity', value: '30 B (64 kbit/s) + 1 D channel per E1', note: 'Standard (ITU-T I.431 / Q.931)' },
    { param: 'Subscriber loop', value: '−48 V DC feed, ring ~75 V rms 25 Hz', note: 'Typical' },
    { param: 'Capacity', value: 'From a few hundred to several thousand lines', note: 'Typical' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: 'SUB (FXS) → PD-Mux FXO to extend lines to stations' },
    { device: 'pdmux', link: 'e1-copper', note: 'E1 trunk into PD-Mux / SDH' },
    { device: 'adm-stm1', link: 'e1-copper', note: 'E1/PRI trunks between exchanges over SDH' },
    { device: 'l3-switch', link: 'cat6', note: 'IP-PBX LAN for IP phones / SIP' },
    { device: 'control-phone', link: 'quad', note: 'Direct subscriber line (when nearby)' },
  ],
  protocolsStandards: ['ITU-T Q.931 / I.431 (ISDN PRI)', 'ITU-T G.703 / G.704 (E1)', 'ITU-T Q.421/Q.441 (R2 CAS signalling)', 'RFC 3261 (SIP)'],
  configBasics: [
    'Log in to the exchange management console (vendor GUI/terminal).',
    'Define the numbering plan and subscriber classes (local, trunk, priority).',
    'Configure E1 trunks: framing, signalling type (PRI or CAS), clock source (usually from the network).',
    'Map subscriber ports to extension numbers; for remote extensions, note the PD-Mux channel used.',
    'Configure IP/SIP: phone registration, codecs, and voice VLAN on the LAN switch.',
    'Test calls: local, remote extension via PD-Mux, trunk to another exchange.',
  ],
  ledsAndAlarms: [
    { indicator: 'E1 LOS/LOF/AIS', meaning: 'Trunk E1 failure', action: 'Check E1 path through PD-Mux/SDH.' },
    { indicator: 'D-channel down', meaning: 'ISDN PRI signalling link not established', action: 'Check PRI settings (network/user side), framing, CRC-4.' },
    { indicator: 'Ring generator fail', meaning: 'Phones will not ring', action: 'Replace ring module.' },
    { indicator: 'Battery/power alarm', meaning: 'Mains or battery problem', action: 'Check rectifier and battery bank.' },
  ],
  maintenance: [
    { frequency: 'daily', check: 'Check alarm log and trunk status.' },
    { frequency: 'weekly', check: 'Test calls on trunks and remote extensions; check call records for failures.' },
    { frequency: 'monthly', check: 'Back up configuration and database; check battery backup.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'Remote station auto-phone has no dial tone.', hi: 'Door wale station ke auto-phone mein dial tone nahi.' },
      likelyCause: 'Exchange subscriber port, PD-Mux FXO/FXS channel, or E1 path fault.',
      howToCheck: 'Check exchange port status; test at the PD-Mux FXO; check E1 alarms.',
      fix: 'Repair the faulty segment.',
    },
    {
      symptom: { en: 'Calls to another division fail, local calls fine.', hi: 'Doosre division ki calls fail, local calls theek.' },
      likelyCause: 'Trunk E1 down or D-channel down.',
      howToCheck: 'Trunk status and E1 alarms.',
      fix: 'Restore E1/PRI.',
    },
  ],
  safetyNotes: [SAFETY_48V, SAFETY_ESD],
  migrationNote: {
    en: 'Retained or upgraded to IP-PBX. E1 trunks can ride TDM pseudowires; SIP trunks and IP phones move to the MPLS VoIP VRF with priority QoS.',
    hi: 'Rehta hai ya IP-PBX mein upgrade hota hai. E1 trunks TDM pseudowire par chal sakte hain; SIP trunks aur IP phones MPLS VoIP VRF mein priority QoS ke saath jaate hain.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'An ISDN PRI on E1 provides how many bearer channels?',
      options: ['24', '30', '31', '32'],
      correctIndex: 1,
      explanation: 'E1 PRI = 30 B channels + 1 D channel (TS16), TS0 is framing.',
    },
    {
      prompt: 'To extend an exchange line to a remote station over a PD-Mux, the exchange SUB port connects to which mux card?',
      options: ['FXS', 'FXO', 'E1', 'MGMT'],
      correctIndex: 1,
      explanation: 'The FXO card behaves like a phone towards the exchange; the far-end mux FXS feeds the real phone.',
    },
    {
      prompt: 'IP phones on the exchange should be placed in which kind of VLAN?',
      options: ['Native VLAN', 'Voice VLAN with priority QoS', 'CCTV VLAN', 'Management VLAN'],
      correctIndex: 1,
      explanation: 'A dedicated voice VLAN with priority queuing protects speech quality.',
    },
  ],
  glossary: [
    { term: 'PRI', meaning: 'Primary Rate Interface: ISDN on E1, 30B+D.' },
    { term: 'D-channel', meaning: 'ISDN signalling channel (TS16 on E1 PRI).' },
    { term: 'SIP', meaning: 'Session Initiation Protocol for VoIP calls.' },
    { term: 'FXS', meaning: 'Port that feeds a telephone.' },
    { term: 'FXO', meaning: 'Port that connects to an exchange line.' },
  ],
  sources: [SRC_IR_TELECOM_MANUAL, 'ITU-T Q.931', 'ITU-T I.431', 'RFC 3261'],
  needsExpertReview: 'Railway numbering plan, exchange types in service and trunk signalling practice vary by zone.',
};
