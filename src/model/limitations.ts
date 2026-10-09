/**
 * Model Limitations register. Every simplification the simulator makes is
 * listed here and shown in the in-app "Model Limitations" panel.
 * status 'active'  = applies to what is built today.
 * status 'planned' = describes how a future phase will simplify, so learners
 *                    know in advance what NOT to expect.
 */

export interface Limitation {
  area: string;
  text: string;
  status: 'active' | 'planned';
  phase: number;
}

export const LIMITATIONS: Limitation[] = [
  // ---------------- General ----------------
  {
    area: 'General',
    status: 'active',
    phase: 1,
    text: 'RailNet Sim is an educational simulator, not a carrier-grade emulator. It models protocol behaviour at the level needed to teach concepts correctly; it does not run real vendor software or reproduce vendor-specific defaults.',
  },
  {
    area: 'General',
    status: 'active',
    phase: 1,
    text: 'Phase 1 is a topology editor only. No traffic, protocols, alarms or timing are simulated yet; the canvas shows static physical properties (ports, link types, optical budget).',
  },
  // ---------------- Physical ----------------
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'Optical budget is a static point-to-point calculation: Rx = Tx − (km × dB/km + connectors + splices + extra loss). Dispersion, PMD, OSNR, reflections, temperature and ageing are not modelled; ageing is represented only by a fixed 3 dB system margin.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'Optic profiles use worst-case minimum Tx power and sensitivity from ITU-T G.957 / IEEE 802.3 where a standard exists; ZX and CWDM profiles are vendor-typical values. All values are editable.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'LOS is declared when Rx power falls below receiver sensitivity. Real equipment declares LOS at a vendor-specific threshold (often several dB below sensitivity) and shows rising BER before that.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'Fibre attenuation defaults: 0.35 dB/km at 1310 nm, 0.25 dB/km at 1550 nm (cabled G.652). Splice count defaults to one per 2 km drum joint. CWDM mux+demux insertion loss defaults to 5 dB total.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'A CWDM lambda is modelled as a patch between an optic and a mux channel port; the end-to-end budget of a lambda through mux → fibre → demux is computed on the OFC between the two LINE ports (extra loss field).',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'Wi-Fi radio links are not modelled; a Wi-Fi AP is represented by its wired uplink only.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'Copper links (E1 G.703, quad, Cat6) are treated as ideal within their length limits; crosstalk, line attenuation and impedance are not modelled. Cat6 is limited to 100 m.',
  },
  {
    area: 'Physical',
    status: 'active',
    phase: 1,
    text: 'VF interface compatibility is simplified to role pairs: FXS↔phone, FXS↔FXO, 2W↔2W/phone, 4W↔4W/terminal, E&M↔E&M. Signalling types (E&M Type I–V), impedance and levels are not modelled.',
  },
  {
    area: 'Devices',
    status: 'active',
    phase: 1,
    text: 'Device port counts are representative, not a specific vendor model (e.g. STM-1 ADM has 21 × E1, STM-4/16 have 63 × E1). Card slots, power supplies and fans are not modelled individually yet.',
  },
  // ---------------- Planned ----------------
  {
    area: 'Engine',
    status: 'planned',
    phase: 2,
    text: 'Discrete-event engine uses simulated time; protocol timers are scaled and processing delays are idealised (no CPU/queue jitter unless QoS module is active).',
  },
  {
    area: 'Ethernet',
    status: 'planned',
    phase: 2,
    text: 'RSTP will be simplified: role/state election and proposal/agreement are modelled, but BPDU timers and edge cases (e.g. dispute, TC flooding storms) are abstracted.',
  },
  {
    area: 'SDH',
    status: 'planned',
    phase: 4,
    text: 'SDH frames are shown structurally (G.707 mapping hierarchy) without real byte-level scrambling or pointer justification. Synchronisation (SSM, clock quality) will be simplified.',
  },
  {
    area: 'MPLS',
    status: 'planned',
    phase: 5,
    text: 'MP-BGP VPNv4 will be simplified: best-path selection uses a reduced attribute set. CESoPSN/SAToP E1 emulation timing (adaptive/differential clock recovery, jitter buffers) is labelled as simplified.',
  },
];
