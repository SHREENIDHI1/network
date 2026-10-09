import { SAFETY_FIELD_WORK, SRC_CAMTECH, SRC_IR_SEM, SRC_IR_TELECOM_MANUAL } from './common';
import type { DeviceDoc } from './types';

/**
 * Equipment docs: field terminals and signalling-related equipment that use
 * the telecom network (control phone, block instrument, BPAC, data logger,
 * LC gate phone). Operating rules for these circuits come from the IR
 * General & Subsidiary Rules, SEM and zonal instructions — these docs only
 * explain the communication side, at a teaching level.
 */

export const controlPhoneDoc: DeviceDoc = {
  type: 'control-phone',
  fullName: 'Control Telephone (Way-station / Selective-calling Control Phone)',
  oneLiner: {
    en: 'Station telephone on the shared section-control circuit; rings only when the controller dials its code.',
    hi: 'Section-control circuit par station ka phone; sirf tab bajta hai jab controller uska code dial kare.',
  },
  overview: {
    en: [
      'The control phone sits on an “omnibus” circuit that is shared by all stations in a control section.',
      'The controller at the divisional control office calls a particular station by sending its selective-calling code (DTMF tones); only that phone rings.',
      'All stations stay connected to the same speech path, so the controller can talk to one or several stations.',
      'Separate omnibus circuits exist for Section Control, Deputy Control, TPC, TLC and Emergency control.',
      'Older installations used magneto phones (hand-generator ringing, local battery); modern ones use DTMF selective calling over PD-Mux VF channels.',
      'Analogy: a party line where the controller is the announcer and each station has its own call-name.',
    ].join('\n'),
    hi: [
      'Control phone ek “omnibus” circuit par hota hai jo control section ke saare stations share karte hain.',
      'Divisional control office ka controller kisi station ko uska selective-calling code (DTMF tones) bhej kar bulata hai; sirf wahi phone bajta hai.',
      'Saare stations ek hi speech path par jude rehte hain, isliye controller ek ya kai stations se baat kar sakta hai.',
      'Section Control, Deputy Control, TPC, TLC aur Emergency control ke alag omnibus circuits hote hain.',
      'Purane setup mein magneto phone (haath ka generator, local battery) the; naye mein PD-Mux VF channels par DTMF selective calling hai.',
      'Misaal: ek party line jahan controller announcer hai aur har station ka apna call-name hai.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Train operation communication: Section Controller ↔ Station Masters (train running, crossings, precedence), TPC ↔ traction substations/OHE depots, Emergency control from portable phones along the track.',
    hi: 'Train operation ki baatcheet: Section Controller ↔ Station Masters (train running, crossing, precedence), TPC ↔ traction substations/OHE depots, track ke saath emergency sockets se portable phones.',
  },
  whereInstalled: ['SM office / ASM room', 'Cabins', 'Traction substations (TPC)', 'Emergency sockets along the track (portable sets)'],
  layer: ['physical', 'application'],
  cardsAndModules: ['Handset and keypad', 'DTMF selective-call decoder with station code', 'Ringer/buzzer', 'Line interface (2W)'],
  ports: [{ name: 'LINE', medium: 'Quad cable pair', connector: 'Terminal block / krone', rate: 'Analogue VF (300–3400 Hz)', purpose: 'Connects to a PD-Mux 2W/FXS channel of the omnibus circuit' }],
  typicalSpecs: [
    { param: 'Voice band', value: '300–3400 Hz', note: 'Standard telephony channel' },
    { param: 'Calling', value: 'DTMF selective code per station', note: 'Typical' },
    { param: 'Line', value: '2-wire on quad cable to PD-Mux', note: 'Typical' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: 'PD-Mux FXS or 2W VF channel bridged on the omnibus' },
    { device: 'hybrid-agg', link: 'quad', note: 'After migration, a VF port on a hybrid aggregation box' },
  ],
  protocolsStandards: ['ITU-T Q.23 / Q.24 (DTMF)', 'ITU-T G.711 (when digitised in PD-Mux)'],
  configBasics: [
    'Set the station’s selective-calling code as allotted in the control circuit plan.',
    'Connect LINE to the designated PD-Mux omnibus channel via quad cable/terminal block.',
    'Ask the controller to call the station code; confirm only this phone rings.',
    'Check speech in both directions at normal volume; report levels to the telecom team if low.',
  ],
  ledsAndAlarms: [
    { indicator: 'Ring/call lamp', meaning: 'Incoming selective call for this station', action: 'Answer and identify the station.' },
    { indicator: 'No ring on test call', meaning: 'Code mismatch, decoder fault or no line', action: 'Check code setting, line continuity and PD-Mux channel.' },
  ],
  maintenance: [
    { frequency: 'daily', check: 'Exchange of test call with the controller at shift start (as per local practice).' },
    { frequency: 'monthly', check: 'Check handset cord, keypad, terminals; clean equipment.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'Controller says the station does not ring when called.', hi: 'Controller bolta hai station bulane par bajta hi nahi.' },
      likelyCause: 'Wrong selective code, faulty decoder, or line/PD-Mux channel fault.',
      howToCheck: 'Verify code; test line pair; check PD-Mux channel alarms.',
      fix: 'Correct code / replace phone / repair line.',
    },
    {
      symptom: { en: 'Heavy hum and noise on the control circuit.', hi: 'Control circuit par bahut hum aur noise.' },
      likelyCause: 'Earth fault or induction on the quad pair, or wrong VF levels.',
      howToCheck: 'Insulation test of the pair; measure VF level at the mux.',
      fix: 'Clear earth fault; correct levels.',
    },
  ],
  safetyNotes: [
    {
      en: 'Control communication is essential for train operation. Do not disconnect a control phone without informing the controller and following local instructions.',
      hi: 'Control communication train operation ke liye zaroori hai. Controller ko bataye aur local instructions follow kiye bina control phone disconnect mat karo.',
    },
  ],
  migrationNote: {
    en: 'The omnibus VF circuit can ride a TDM pseudowire (CESoPSN) over IP-MPLS, or be re-engineered as a VoIP conference with priority QoS. The phone itself may be retained via a VF port on a hybrid box.',
    hi: 'Omnibus VF circuit IP-MPLS par TDM pseudowire (CESoPSN) se chal sakta hai, ya priority QoS wale VoIP conference mein badal sakta hai. Phone khud hybrid box ke VF port se jud kar reh sakta hai.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'How does a controller ring only one station on a shared omnibus circuit?',
      options: ['Separate pair per station', 'Selective-calling code (DTMF) decoded by each phone', 'Different voltage per station', 'Using an IP address'],
      correctIndex: 1,
      explanation: 'Each phone decodes its own code; all phones share the speech path.',
    },
    {
      prompt: 'Which PD-Mux card type is commonly used for a way-station control phone?',
      options: ['E&M', '2W VF / FXS', 'E1 aggregate', 'Ethernet'],
      correctIndex: 1,
      explanation: 'The phone connects on a 2-wire VF/FXS channel bridged onto the omnibus.',
    },
    {
      prompt: 'TPC stands for…',
      options: ['Train Passing Control', 'Traction Power Control', 'Telecom Protection Circuit', 'Track Point Control'],
      correctIndex: 1,
      explanation: 'TPC is the traction power controller’s circuit to substations and OHE depots.',
    },
  ],
  glossary: [
    { term: 'Omnibus', meaning: 'Circuit shared by all stations in a section.' },
    { term: 'Selective calling', meaning: 'Ringing one station by its unique code.' },
    { term: 'DTMF', meaning: 'Dual-tone multi-frequency signalling (touch-tone).' },
    { term: 'TPC', meaning: 'Traction Power Control.' },
    { term: 'Magneto phone', meaning: 'Older phone with a hand generator for ringing.' },
  ],
  sources: [SRC_CAMTECH, SRC_IR_TELECOM_MANUAL, 'ITU-T Q.23'],
};

export const blockInstrumentDoc: DeviceDoc = {
  type: 'block-instrument',
  fullName: 'Block Instrument (Absolute Block System)',
  oneLiner: {
    en: 'Safety-critical instrument that lets adjacent stations agree “line clear” before a train enters a block section.',
    hi: 'Safety-critical instrument jisse padosi stations block section mein train bhejne se pehle “line clear” par sehmat hote hain.',
  },
  overview: {
    en: [
      'Under the Absolute Block System, only one train may be in a block section between two stations at a time.',
      'Block instruments at both ends show the section state (e.g. Line Closed, Line Clear, Train On Line) and are interlocked so one station cannot grant itself line clear.',
      'The instruments communicate over a “block line”: originally overhead/underground copper, now often a VF channel of the PD-Mux over OFC through a suitable interface.',
      'Bell codes and line currents between the instruments carry the operations; the exact equipment (single/double line, token/tokenless, handle type) varies.',
      'If the block line fails, train working changes to the special procedure prescribed in the rules — so the communication path is safety-related.',
      'Analogy: a two-key locker — the receiving station must turn its key before the sending station can open the section.',
    ].join('\n'),
    hi: [
      'Absolute Block System mein do stations ke beech block section mein ek samay par sirf ek train ho sakti hai.',
      'Dono ends ke block instruments section ki halat dikhate hain (jaise Line Closed, Line Clear, Train On Line) aur interlocked hote hain, taaki koi station khud ko line clear na de sake.',
      'Instruments “block line” par baat karte hain: pehle copper line, ab aksar OFC par PD-Mux ka VF channel (sahi interface ke through).',
      'Bell codes aur line currents se operations hote hain; equipment ka type (single/double line, token/tokenless, handle type) alag-alag hota hai.',
      'Block line fail hone par rules mein di gayi special procedure se train chalti hai — isliye yeh communication path safety-related hai.',
      'Misaal: do chaabi wala locker — receiving station ki chaabi ghoome bina sending station section nahi khol sakta.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Train separation between adjacent stations on non-automatic-signalling sections. Its communication rides a dedicated VF circuit, usually on PD-Mux over OFC, sometimes on quad cable.',
    hi: 'Non-automatic-signalling sections par padosi stations ke beech train separation. Iska communication ek dedicated VF circuit par chalta hai, aam taur par OFC par PD-Mux, kabhi quad cable par.',
  },
  whereInstalled: ['SM office / panel room at each station of the block section'],
  layer: ['physical', 'application'],
  cardsAndModules: ['Instrument with indications and commutator/handle', 'Bell/plunger', 'Line interface towards the block line (relay/tone interface when carried over VF)'],
  ports: [{ name: 'LINE', medium: 'Quad cable pair / VF channel', connector: 'Terminal block', rate: 'DC/tone signalling (type dependent)', purpose: 'Block line to the adjacent station’s instrument' }],
  typicalSpecs: [
    { param: 'Communication', value: 'Dedicated point-to-point VF channel between adjacent stations', note: 'Typical' },
    { param: 'Latency/availability', value: 'Must be continuous; failure invokes special working rules', note: 'Operating requirement' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: '2W VF channel (via block-over-OFC interface where used)' },
    { device: 'hybrid-agg', link: 'quad', note: 'After migration: VF port on a hybrid box, carried by pseudowire' },
  ],
  protocolsStandards: ['IR General & Subsidiary Rules (block working)', 'IR Signal Engineering Manual', 'RDSO specifications for the instrument type'],
  configBasics: [
    'The telecom team provides a dedicated, permanently-connected VF channel between the two adjacent stations’ block instruments (point-to-point, not omnibus).',
    'Map the channel on the PD-Mux at both stations to the same timeslot path and set VF levels per the interface requirement.',
    'Signalling staff connect and test the instrument; joint testing by S&T is done under the prescribed procedure.',
    'Record the channel/timeslot used in the circuit register so it is never reused.',
  ],
  ledsAndAlarms: [
    { indicator: 'Instrument indication not changing / bell not received', meaning: 'Block line communication lost', action: 'Report as block failure; follow rules for working during failure; telecom checks the VF channel.' },
  ],
  maintenance: [
    { frequency: 'as required', check: 'Joint inspection/testing by S&T as per SEM and zonal schedules — not by telecom alone.' },
    { frequency: 'monthly', check: 'Telecom: verify VF channel levels and alarm-free E1 path for the block circuit.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'SM/BNO: block instrument dead, control phone theek hai.', hi: 'SM/BNO: block instrument dead hai, control phone theek hai.' },
      likelyCause: 'The E1/SDH path is fine (control works) — fault is in the block channel: VF card, timeslot mapping, or quad pair to the instrument.',
      howToCheck: 'Check the block channel mapping and card at both PD-Muxes; check pair continuity — under disconnection procedure.',
      fix: 'Repair channel/card/pair; joint test with signalling staff before restoring.',
    },
    {
      symptom: { en: 'Block and control both dead at a station.', hi: 'Ek station par block aur control dono dead.' },
      likelyCause: 'Common path failure: E1, SDH or fibre.',
      howToCheck: 'Check PD-Mux E1 and SDH alarms.',
      fix: 'Restore transmission path.',
    },
  ],
  safetyNotes: [
    SAFETY_FIELD_WORK,
    {
      en: 'Never test a block circuit by operating the instrument or simulating line-clear. Never loop, patch or reuse its channel. Work only under a valid disconnection memo with the SM’s knowledge.',
      hi: 'Instrument chala kar ya line-clear simulate karke block circuit kabhi test mat karo. Iska channel kabhi loop, patch ya reuse mat karo. Sirf valid disconnection memo aur SM ki jaankari mein kaam karo.',
    },
  ],
  migrationNote: {
    en: 'The VF block channel is migrated last, after IP-MPLS has proven stable — typically as a CESoPSN/SAToP pseudowire with highest QoS priority and protected paths. Instrument is retained.',
    hi: 'VF block channel sabse aakhir mein migrate hota hai, jab IP-MPLS stable sabit ho jaaye — aam taur par sabse oonchi QoS priority aur protected path wale CESoPSN/SAToP pseudowire se. Instrument wahi rehta hai.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'Block circuit dead but control phone works at the same station. Where is the fault most likely?',
      options: ['Fibre cut', 'SDH ring failure', 'The block channel itself (card/mapping/pair)', 'Exchange'],
      correctIndex: 2,
      explanation: 'Control working proves the E1/SDH path; the fault is specific to the block channel.',
    },
    {
      prompt: 'Should a block circuit share an omnibus channel?',
      options: ['Yes, to save timeslots', 'No — it needs a dedicated point-to-point channel', 'Only at night', 'Only on double line'],
      correctIndex: 1,
      explanation: 'Block communication is between two adjacent stations only and must be dedicated.',
    },
    {
      prompt: 'In migration, when is the block channel usually moved to IP-MPLS?',
      options: ['First', 'Last, after the new network is proven', 'Never allowed', 'At the same time as Wi-Fi'],
      correctIndex: 1,
      explanation: 'Safety-critical circuits move last, with the highest priority and protection.',
    },
  ],
  glossary: [
    { term: 'Absolute Block System', meaning: 'Only one train in a block section at a time.' },
    { term: 'Block section', meaning: 'Track between two block stations.' },
    { term: 'Line clear', meaning: 'Permission from the receiving station for a train to enter the section.' },
    { term: 'Disconnection memo', meaning: 'Formal notice before disconnecting safety equipment.' },
  ],
  sources: [SRC_IR_SEM, SRC_IR_TELECOM_MANUAL, SRC_CAMTECH],
  safetyCritical: true,
  needsExpertReview: 'Block instrument types, indications and block-over-OFC interface practice vary by zone; verify wording with a signalling expert.',
};

export const bpacDoc: DeviceDoc = {
  type: 'bpac',
  fullName: 'Block Proving by Axle Counter (BPAC)',
  oneLiner: {
    en: 'Counts axles in and out of a block section to prove the whole train has arrived.',
    hi: 'Block section mein ghuse aur nikle axles gin kar sabit karta hai ki poori train pahunch gayi.',
  },
  overview: {
    en: [
      'BPAC counts the axles of a train entering a block section at one end and leaving it at the other.',
      'When the counts match, the section is proved clear; if they don’t, the section stays “occupied”.',
      'The two ends must continuously exchange counts and health information over a communication link.',
      'This link is usually a modem over 4-wire VF channels of the PD-Mux (often duplicated for availability), or a digital channel.',
      'BPAC replaces manual verification of the last vehicle and works together with the block instruments.',
      'Analogy: a ticket checker at both gates of a platform — if the number going in equals the number coming out, the platform is empty.',
    ].join('\n'),
    hi: [
      'BPAC block section ke ek end par ghusne aur doosre end par nikalne wale train ke axles ginta hai.',
      'Count match ho jaaye to section clear sabit hota hai; na mile to section “occupied” rehta hai.',
      'Dono ends ko lagatar counts aur health info ek communication link par exchange karni padti hai.',
      'Yeh link aam taur par PD-Mux ke 4-wire VF channels par modem hota hai (availability ke liye aksar do), ya digital channel.',
      'BPAC last vehicle ki manual verification ki jagah leta hai aur block instruments ke saath kaam karta hai.',
      'Misaal: platform ke dono gates par ticket checker — andar gaye aur bahar aaye log barabar hon to platform khaali hai.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Automatic proving of block section clearance for train separation; needs a reliable, low-error channel between the two stations’ evaluators.',
    hi: 'Train separation ke liye block section clear hone ka automatic proof; dono stations ke evaluators ke beech reliable, kam-error channel chahiye.',
  },
  whereInstalled: ['Relay/equipment room at each station of the block section', 'Detection points (track devices) at the section ends'],
  layer: ['physical', 'application'],
  cardsAndModules: ['Evaluator / processing unit', 'Track devices (axle detectors) and junction boxes', 'Communication modem(s) or digital interface', 'Reset box / indication panel at SM'],
  ports: [
    { name: 'MODEM-1 / MODEM-2', medium: '4W VF channel (quad / PD-Mux)', connector: 'Terminal block', rate: 'Low-rate modem (type dependent)', purpose: 'Count and health exchange with the far-end evaluator; second channel for redundancy where used' },
  ],
  typicalSpecs: [
    { param: 'Communication', value: '4W VF modem channel(s) between stations', note: 'Typical' },
    { param: 'Channel quality', value: 'Low noise, stable level; errors cause section to show occupied (fail-safe)', note: 'Operating requirement' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: '4W VF channel(s), dedicated point-to-point' },
    { device: 'hybrid-agg', link: 'quad', note: 'After migration: 4W VF port carried by pseudowire' },
  ],
  protocolsStandards: ['RDSO specifications for BPAC / axle counters', 'IR Signal Engineering Manual', 'ITU-T G.712 (VF channel transmission characteristics)'],
  configBasics: [
    'Telecom provides dedicated 4W VF channel(s) between the two stations (no omnibus, no bridging).',
    'Set transmit/receive levels on the PD-Mux 4W cards as required by the BPAC modem.',
    'Where two channels are used, route them on independent paths if available.',
    'Signalling staff commission and test the BPAC; record the channels in the circuit register.',
  ],
  ledsAndAlarms: [
    { indicator: 'Comm fail / section occupied', meaning: 'Evaluators lost contact or counts disagree — system fails safe (occupied)', action: 'Report BPAC failure; telecom checks VF channels; reset only as per prescribed procedure.' },
  ],
  maintenance: [
    { frequency: 'monthly', check: 'Telecom: check VF levels and error-free E1/SDH path of BPAC channels.' },
    { frequency: 'as required', check: 'Signalling: maintenance and testing as per SEM/zonal schedule.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'BPAC shows section occupied after the train has arrived.', hi: 'Train pahunch gayi, phir bhi BPAC section occupied dikha raha.' },
      likelyCause: 'Communication failure (noisy/one-way VF channel) or a count mismatch at the track device.',
      howToCheck: 'Telecom checks channel levels/noise and E1 alarms; signalling checks track devices.',
      fix: 'Restore channel; reset strictly as per rules.',
    },
    {
      symptom: { en: 'Frequent BPAC failures during rain.', hi: 'Baarish mein BPAC baar-baar fail.' },
      likelyCause: 'Moisture in quad cable joints causing noise on the VF channel.',
      howToCheck: 'Insulation resistance test of the pairs; level/noise measurement.',
      fix: 'Repair joints; shift to a healthy pair/channel.',
    },
  ],
  safetyNotes: [
    SAFETY_FIELD_WORK,
    {
      en: 'Never reset a BPAC to “clear” a section for convenience. Resets follow the prescribed procedure with both stations. Never loop or reuse its VF channels.',
      hi: 'Suvidha ke liye BPAC ko reset karke section “clear” kabhi mat karo. Reset dono stations ke saath prescribed procedure se hi hota hai. Iske VF channels kabhi loop ya reuse mat karo.',
    },
  ],
  migrationNote: {
    en: 'Migrated last, as a TDM pseudowire (CESoPSN for the VF timeslots or SAToP for a full E1) with top QoS priority and protected paths; or via VF ports of a hybrid aggregation box. The BPAC equipment is retained.',
    hi: 'Sabse aakhir mein migrate hota hai — top QoS priority aur protected path wale TDM pseudowire (VF timeslots ke liye CESoPSN, poore E1 ke liye SAToP) se, ya hybrid box ke VF ports se. BPAC equipment wahi rehta hai.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'If the BPAC communication channel fails, the system…',
      options: ['Shows section clear', 'Fails safe and shows section occupied', 'Keeps the last state forever', 'Switches to Wi-Fi'],
      correctIndex: 1,
      explanation: 'Safety equipment fails to the restrictive (occupied) state.',
    },
    {
      prompt: 'Which PD-Mux card usually carries a BPAC modem?',
      options: ['FXS', '4W VF', 'FXO', 'MGMT'],
      correctIndex: 1,
      explanation: 'BPAC modems use 4-wire VF channels (separate transmit and receive pairs).',
    },
    {
      prompt: 'Why are two BPAC channels sometimes provided?',
      options: ['To double the speed', 'For redundancy/availability', 'One for voice', 'Rules require four'],
      correctIndex: 1,
      explanation: 'A second channel (ideally on a different path) improves availability.',
    },
  ],
  glossary: [
    { term: 'Axle counter', meaning: 'System that counts train axles at detection points.' },
    { term: 'Evaluator', meaning: 'Unit that compares counts and decides clear/occupied.' },
    { term: 'Fail-safe', meaning: 'On failure, the system goes to the safe (restrictive) state.' },
    { term: '4W', meaning: 'Four-wire circuit with separate transmit and receive pairs.' },
  ],
  sources: [SRC_IR_SEM, SRC_IR_TELECOM_MANUAL, SRC_CAMTECH],
  safetyCritical: true,
  needsExpertReview: 'Number of channels, modem type and reset procedure depend on the BPAC make and zonal instructions.',
};

export const dataLoggerDoc: DeviceDoc = {
  type: 'data-logger',
  fullName: 'Signalling Data Logger',
  oneLiner: {
    en: 'Records relay and voltage events of station signalling for failure analysis; reports to a central server.',
    hi: 'Station signalling ke relay aur voltage events record karta hai failure analysis ke liye; central server ko report karta hai.',
  },
  overview: {
    en: [
      'A data logger continuously monitors the state of signalling relays (digital inputs) and key voltages/currents (analogue inputs) in the station.',
      'Every change is time-stamped and stored, building a record of what happened before and during a failure.',
      'Loggers of many stations are networked to a central server through the telecom network, so failures can be analysed remotely.',
      'It only listens — inputs are isolated so the logger cannot affect vital circuits.',
      'Analogy: the “black box” of a station’s signalling.',
    ].join('\n'),
    hi: [
      'Data logger station ke signalling relays (digital inputs) aur zaroori voltage/current (analogue inputs) ko lagatar monitor karta hai.',
      'Har badlaav time-stamp ke saath store hota hai, jisse failure se pehle aur dauraan kya hua uska record ban jaata hai.',
      'Kai stations ke loggers telecom network se central server se jude hote hain, taaki failures door se analyse ho sakein.',
      'Yeh sirf sunta hai — inputs isolated hote hain, isliye logger vital circuits par asar nahi daal sakta.',
      'Misaal: station ki signalling ka “black box”.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Failure analysis, predictive maintenance and monitoring of signalling (point, track circuit, signal and block relay states). Needs a data path from each station to the divisional server.',
    hi: 'Signalling ka failure analysis, predictive maintenance aur monitoring (point, track circuit, signal, block relay states). Har station se divisional server tak data path chahiye.',
  },
  whereInstalled: ['Relay room of the station', 'Central server/FEP at the divisional office'],
  layer: ['physical', 'L3', 'application'],
  cardsAndModules: ['CPU/storage', 'Digital input cards (opto-isolated, relay contacts)', 'Analogue input cards', 'Communication: VF modem and/or Ethernet'],
  ports: [
    { name: 'MODEM', medium: '4W VF channel', connector: 'Terminal block', rate: 'Low-rate modem', purpose: 'Legacy link to central server via PD-Mux' },
    { name: 'LAN', medium: 'Cat6', connector: 'RJ45', rate: '10/100 Mbit/s (typical)', purpose: 'IP link to central server over station LAN / MPLS' },
  ],
  typicalSpecs: [
    { param: 'Inputs', value: 'Hundreds of digital + tens of analogue channels', note: 'Typical' },
    { param: 'Time resolution', value: 'Milliseconds', note: 'Typical' },
    { param: 'Isolation', value: 'Opto-isolated inputs', note: 'Typical design requirement' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: '4W VF modem channel (legacy)' },
    { device: 'l2-switch', link: 'cat6', note: 'Ethernet to station LAN (SCADA/signalling VLAN)' },
    { device: 'ler', link: 'cat6', note: 'After migration: Ethernet into a VRF or VPWS pseudowire' },
  ],
  protocolsStandards: ['RDSO specifications for data loggers', 'IEEE 802.3 (Ethernet)', 'TCP/IP'],
  configBasics: [
    'Signalling staff wire relay contacts and analogue sensors to the logger inputs.',
    'Telecom provides the communication path: a 4W VF modem channel, or an IP address in the signalling/SCADA VLAN.',
    'Configure the server address and test that records reach the central server.',
    'Keep the logger network isolated from public/Railnet traffic (separate VLAN/VRF).',
  ],
  ledsAndAlarms: [
    { indicator: 'Comm fail', meaning: 'Logger cannot reach the server', action: 'Check modem channel / IP path; data is buffered locally meanwhile (typical).' },
    { indicator: 'Input card fail', meaning: 'Monitoring of some relays lost', action: 'Signalling staff check the card.' },
  ],
  maintenance: [
    { frequency: 'weekly', check: 'Confirm data from each station is reaching the central server.' },
    { frequency: 'monthly', check: 'Check time synchronisation of the logger clock.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'Central server not getting data from one station.', hi: 'Central server ko ek station se data nahi mil raha.' },
      likelyCause: 'Communication path (VF channel or IP/VLAN) fault.',
      howToCheck: 'Check modem/link LEDs; ping the logger from the server side.',
      fix: 'Restore the channel or IP config.',
    },
  ],
  safetyNotes: [
    SAFETY_FIELD_WORK,
    {
      en: 'Wiring to relay contacts is done by signalling staff only; the logger must never be able to drive or load vital circuits.',
      hi: 'Relay contacts ki wiring sirf signalling staff karta hai; logger kabhi vital circuits ko drive ya load nahi kar sakna chahiye.',
    },
  ],
  migrationNote: {
    en: 'Moves early to IP: Ethernet port into a dedicated signalling/SCADA VRF or a VPWS pseudowire to the central server.',
    hi: 'Jaldi IP par chala jaata hai: Ethernet port dedicated signalling/SCADA VRF mein, ya central server tak VPWS pseudowire se.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'A data logger’s inputs are opto-isolated so that…',
      options: ['It runs faster', 'It cannot affect vital signalling circuits', 'It uses less power', 'It can control signals'],
      correctIndex: 1,
      explanation: 'The logger only observes; isolation protects vital circuits.',
    },
    {
      prompt: 'After migration, a good way to carry logger traffic is…',
      options: ['On the public Wi-Fi VLAN', 'In a dedicated signalling VRF or VPWS', 'Over the omnibus control channel', 'It is not needed'],
      correctIndex: 1,
      explanation: 'Signalling data should be isolated from general traffic.',
    },
    {
      prompt: 'What does a data logger mainly record?',
      options: ['Phone calls', 'Relay states and analogue values with time stamps', 'CCTV video', 'Ticket sales'],
      correctIndex: 1,
      explanation: 'It is the event recorder of station signalling.',
    },
  ],
  glossary: [
    { term: 'FEP', meaning: 'Front-end processor that collects data from many loggers.' },
    { term: 'Opto-isolation', meaning: 'Electrical isolation using light inside a coupler.' },
    { term: 'VRF', meaning: 'Virtual routing table that keeps one application’s traffic separate.' },
  ],
  sources: [SRC_IR_SEM, SRC_CAMTECH],
  safetyCritical: true,
};

export const lcGatePhoneDoc: DeviceDoc = {
  type: 'lc-gate-phone',
  fullName: 'Level Crossing Gate Telephone',
  oneLiner: {
    en: 'Telephone between the level-crossing gateman and the station, used before gate operations.',
    hi: 'Level-crossing gateman aur station ke beech phone, gate operation se pehle istemaal hota hai.',
  },
  overview: {
    en: [
      'Each manned level crossing has a telephone to the nearby station (SM/cabin).',
      'The gateman and station exchange information about approaching trains and gate closure, as laid down in the rules for that gate.',
      'The circuit runs on quad cable, a PD-Mux channel, or (after modernisation) a VoIP/hybrid box near the gate.',
      'Because it is part of safe working at the gate, its failure invokes the special procedure in the rules.',
      'Analogy: the hotline between the gate and the station.',
    ].join('\n'),
    hi: [
      'Har manned level crossing par paas ke station (SM/cabin) se ek phone hota hai.',
      'Gateman aur station aane wali trains aur gate band karne ki jaankari exchange karte hain, us gate ke rules ke hisaab se.',
      'Circuit quad cable, PD-Mux channel, ya (modernisation ke baad) gate ke paas VoIP/hybrid box par chalta hai.',
      'Yeh gate par safe working ka hissa hai, isliye fail hone par rules ki special procedure lagti hai.',
      'Misaal: gate aur station ke beech hotline.',
    ].join('\n'),
  },
  railwayRole: {
    en: 'Safe operation of manned level crossings: communication between gateman and station before closing/opening the gate.',
    hi: 'Manned level crossings ka safe operation: gate band/khulne se pehle gateman aur station ke beech baatcheet.',
  },
  whereInstalled: ['LC gate lodge', 'Station SM office / cabin (far end)'],
  layer: ['physical', 'application'],
  cardsAndModules: ['Telephone set', 'Ringer', 'Line interface (2W)'],
  ports: [{ name: 'LINE', medium: 'Quad cable pair', connector: 'Terminal block', rate: 'Analogue VF', purpose: 'To station via quad, PD-Mux FXS/2W, or hybrid box VF port' }],
  typicalSpecs: [
    { param: 'Line', value: '2-wire analogue', note: 'Typical' },
    { param: 'Path', value: 'Quad cable to station or PD-Mux channel', note: 'Typical' },
  ],
  connectsTo: [
    { device: 'pdmux', link: 'quad', note: 'FXS/2W channel to the station' },
    { device: 'hybrid-agg', link: 'quad', note: 'VF port of a hybrid box near the gate' },
    { device: 'ucpe', link: 'cat6', note: 'Via an IP phone/ATA on a uCPE at the gate (modernised)' },
  ],
  protocolsStandards: ['IR General & Subsidiary Rules (level crossings)', 'ITU-T G.711 (when digitised)'],
  configBasics: [
    'Provide a dedicated pair/channel from the gate to the station phone.',
    'If carried on PD-Mux, allocate an FXS/2W channel and record it in the circuit register.',
    'Test ringing and speech both ways with the station.',
  ],
  ledsAndAlarms: [{ indicator: 'No ring / no speech', meaning: 'Line or channel fault', action: 'Report as gate phone failure; follow the rules for gate working during failure; telecom checks the line.' }],
  maintenance: [
    { frequency: 'daily', check: 'Test call by the gateman at duty start (as per local instructions).' },
    { frequency: 'monthly', check: 'Check the instrument, cable termination and earthing.' },
  ],
  commonFaults: [
    {
      symptom: { en: 'Gateman: station ka phone nahi lag raha, ghanti nahi jaati.', hi: 'Gateman: station ka phone nahi lag raha, ghanti nahi jaati.' },
      likelyCause: 'Quad pair fault (cut/earth) or PD-Mux channel fault.',
      howToCheck: 'Test pair continuity/insulation; check the mux channel.',
      fix: 'Repair pair or channel; restore and test.',
    },
  ],
  safetyNotes: [SAFETY_FIELD_WORK],
  migrationNote: {
    en: 'Can be carried by a VF port on a hybrid box or uCPE at the gate, with traffic on a protected high-priority path; the phone itself may be retained.',
    hi: 'Gate par hybrid box ya uCPE ke VF port se chal sakta hai, protected high-priority path par; phone wahi reh sakta hai.',
  },
  vendorExamples: ['Generic'],
  relatedLabs: [],
  quickQuiz: [
    {
      prompt: 'An LC gate phone is primarily used for…',
      options: ['Ticket booking', 'Communication between gateman and station for gate operation', 'CCTV control', 'Traction power'],
      correctIndex: 1,
      explanation: 'It is the gate–station link used in safe working of the gate.',
    },
    {
      prompt: 'Which PD-Mux card can feed an LC gate phone?',
      options: ['FXS / 2W', 'FXO', 'E1', 'MGMT'],
      correctIndex: 0,
      explanation: 'The phone is a terminal; FXS or 2W VF feeds it.',
    },
    {
      prompt: 'If the gate phone fails…',
      options: ['Trains stop permanently', 'Special procedure in the rules applies', 'Nothing changes', 'Gate is left open'],
      correctIndex: 1,
      explanation: 'Rules prescribe how gate working continues during communication failure.',
    },
  ],
  glossary: [
    { term: 'LC', meaning: 'Level crossing.' },
    { term: 'Gate lodge', meaning: 'Gateman’s hut at the level crossing.' },
  ],
  sources: [SRC_IR_TELECOM_MANUAL, SRC_IR_SEM],
  safetyCritical: true,
  needsExpertReview: 'Exact gate–station communication procedure depends on gate class and interlocking; verify with zonal instructions.',
};
