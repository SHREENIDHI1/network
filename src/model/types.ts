/**
 * Core domain types for RailMPLS Lab topologies.
 * These types are shared by the UI, the store, save/load and (from Phase 2) the
 * simulation engine. They must not import anything from React or the UI.
 */

export type DeviceCategory = 'legacy' | 'lan' | 'mpls';

export type DeviceKind =
  // Legacy / transmission
  | 'pdmux'
  | 'adm-stm1'
  | 'adm-stm4'
  | 'adm-stm16'
  | 'cwdm-mux'
  | 'control-phone'
  | 'block-instrument'
  | 'bpac'
  | 'data-logger'
  | 'lc-gate-phone'
  | 'exchange'
  // LAN / IP
  | 'pc'
  | 'uts-prs'
  | 'fois'
  | 'ip-phone'
  | 'cctv'
  | 'nvr'
  | 'wifi-ap'
  | 'l2-switch'
  | 'l3-switch'
  | 'router'
  | 'firewall'
  | 'nms'
  | 'dns-dhcp'
  // MPLS
  | 'ler'
  | 'lsr'
  | 'rr'
  | 'hybrid-agg'
  | 'ucpe'
  // RailMPLS Lab additions: basics + IP-MPLS router profiles
  | 'laptop'
  | 'hub'
  | 'server'
  | 'internet'
  | 'adj-division'
  | 'neon-ler'
  | 'neon-lsr'
  | 'asr920'
  | 'asr903'
  | 'acx4000'
  | 'mx104'
  | 'sar8'
  | 'ixr-r4';

/**
 * Physical port families.
 * - rj45      : copper Ethernet (Cat6)
 * - sfp       : pluggable optical/DAC Ethernet port (speeds in speedsGbps)
 * - combo     : 1G combo port — accepts either an RJ45 cable or an SFP (used as one at a time)
 * - stm       : SDH aggregate/tributary optical port (stmLevel 1/4/16)
 * - e1        : 2.048 Mbit/s G.703 electrical interface (120 ohm balanced assumed)
 * - vf2w/vf4w : voice-frequency analogue 2-wire / 4-wire interface
 * - cwdm-line : common (multiplexed) port of a CWDM mux/demux
 * - cwdm-ch   : single-wavelength channel port of a CWDM mux/demux
 */
export type PortKind = 'rj45' | 'sfp' | 'combo' | 'stm' | 'e1' | 'vf2w' | 'vf4w' | 'cwdm-line' | 'cwdm-ch';

/**
 * Voice-frequency interface role.
 * TERM = terminal equipment (telephone, block instrument line unit, modem).
 */
export type VfRole = 'FXS' | 'FXO' | 'E&M' | '2W' | '4W' | 'TERM';

export type StmLevel = 1 | 4 | 16;

export interface Port {
  id: string;
  name: string;
  kind: PortKind;
  /** Supported Ethernet speeds (Gbit/s) for rj45/sfp ports. */
  speedsGbps?: number[];
  /** SDH level for stm ports. */
  stmLevel?: StmLevel;
  /** VF role for vf2w/vf4w ports. */
  vfRole?: VfRole;
  /** Nominal centre wavelength for cwdm-ch ports (ITU-T G.694.2 grid). */
  lambdaNm?: number;
}

export interface XY {
  x: number;
  y: number;
}

export interface Device {
  id: string;
  kind: DeviceKind;
  /** Display name / hostname, e.g. "JU-LER-1". */
  name: string;
  /** Railway station code, e.g. "JU", "MTD". Optional. */
  station?: string;
  position: XY;
  ports: Port[];
  notes?: string;
  /**
   * Per-device configuration. Empty in Phase 1; protocol modules add their own
   * namespaced sections (e.g. config.ip, config.sdh) in later phases.
   */
  config: Record<string, unknown>;
}

export type LinkKind =
  | 'ofc'
  | 'cwdm-lambda'
  | 'e1-copper'
  | 'quad'
  | 'cat6'
  | 'sfp-1g'
  | 'sfp-10g'
  | 'sfp-25g'
  | 'sfp-100g';

export interface LinkEnd {
  deviceId: string;
  portId: string;
}

/** Parameters for a point-to-point optical power budget. */
export interface OpticalParams {
  /** Optic profile id from OPTIC_PROFILES, or 'custom'. */
  profile: string;
  wavelengthNm: number;
  /** Fibre attenuation in dB/km. */
  lossDbPerKm: number;
  connectors: number;
  connectorLossDb: number;
  splices: number;
  spliceLossDb: number;
  /** Additional fixed loss, e.g. CWDM mux+demux insertion loss. */
  extraLossDb: number;
  txPowerDbm: number;
  rxSensitivityDbm: number;
  rxOverloadDbm: number;
}

export interface Link {
  id: string;
  kind: LinkKind;
  a: LinkEnd;
  b: LinkEnd;
  /** Route length in km. Meaningful for ofc; short patch for the rest. */
  lengthKm: number;
  /** For ofc: 1 = single fibre (BiDi optics), 2 = fibre pair (Tx/Rx). */
  cores?: 1 | 2;
  optical?: OpticalParams;
  label?: string;
}

export interface TopologyMeta {
  name: string;
  description?: string;
}

export interface Topology {
  meta: TopologyMeta;
  devices: Device[];
  links: Link[];
}
