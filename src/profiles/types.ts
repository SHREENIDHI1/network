/**
 * Equipment profiles: hardware spec + interface naming + capability flags +
 * CLI dialect for IP-MPLS routers. Pure data; no UI imports.
 */

export type ProfileRole = 'LER' | 'LSR';
export type CliDialect = 'generic-sp';

export interface SpecItem {
  param: string;
  value: string;
  /** Where the value comes from, e.g. "CAMTECH p.35", or "typical". */
  source: string;
}

export interface PortGroup {
  /** Interface name prefix, e.g. "Te0/0/" (TenGigabitEthernet0/0/x). */
  prefix: string;
  count: number;
  kind: 'rj45' | 'sfp' | 'combo' | 'e1';
  speedsGbps?: number[];
  purpose: string;
}

export interface DeviceProfile {
  id: string;
  label: string;
  vendor: 'Team Engineers' | 'Cisco' | 'Juniper' | 'Nokia';
  model: string;
  role: ProfileRole;
  /** Placement in the Jodhpur design. */
  placement: string;
  specs: SpecItem[];
  ports: PortGroup[];
  capabilities: string[];
  cliDialect: CliDialect;
  /** Shown when the console opens. */
  cliBanner: string;
  /** False when the spec could not be checked against the CAMTECH table. */
  specsVerified: boolean;
  /** True when the port layout is a generic placeholder, not the vendor's. */
  genericPortLayout: boolean;
  notes: string[];
}
