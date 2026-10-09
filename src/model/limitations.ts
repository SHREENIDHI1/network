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
    text: 'RailMPLS Lab is an educational simulator, not a carrier-grade emulator. It models protocol behaviour at the level needed to teach concepts correctly; it does not run real vendor software or reproduce vendor-specific defaults.',
  },
  {
    area: 'General',
    status: 'active',
    phase: 2,
    text: 'Built so far: topology editor (Phase 1), Ethernet + IPv4 engine (Phase 2), and OSPF, DHCP, NAT, ACL, HSRP/VRRP and QoS analysis (Phase 3, engine + CLI). MPLS, VPNs and fault/NMS features are not simulated yet.',
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
  // ---------------- Engine (Phase 2) ----------------
  {
    area: 'Engine',
    status: 'active',
    phase: 2,
    text: 'Discrete-event engine with simulated time in milliseconds. Link delay = 0.01 ms + 0.005 ms/km; device processing, serialisation, queuing and CPU load are not modelled, so round-trip times are idealised (IOS output shows them as 1 ms).',
  },
  {
    area: 'Engine',
    status: 'active',
    phase: 2,
    text: 'Realtime mode runs a command’s events to completion instantly; Simulation mode queues them for Step / Play. Fibre cuts, MAC/ARP tables and traces are runtime state and are not saved in the topology file (configs are).',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'Spanning tree is a simplified RSTP: one instance for all VLANs (like 802.1Q CST / MST0, even though "show" uses PVST-style wording), roles computed directly from the topology with 802.1D-2004 path costs, instant convergence, no BPDUs, timers, proposal/agreement or TCN messages. A topology change flushes dynamic MAC entries.',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'Switch ports default to static access mode in VLAN 1 (real Catalyst default is dynamic auto/DTP). DTP, VTP, voice VLAN, CDP/LLDP, EtherChannel, storm control and jumbo frames are not modelled. IP phones do not bridge their PC port.',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'Port security: sticky MACs, aging and err-disable auto-recovery are not modelled; recovery is "shutdown" then "no shutdown". Duplex/speed negotiation is assumed to succeed at the link speed.',
  },
  {
    area: 'IP',
    status: 'active',
    phase: 2,
    text: 'IPv4 only. ICMP echo, time-exceeded and net-unreachable are modelled; traceroute uses ICMP echo probes with increasing TTL (like Windows tracert), not UDP as IOS does. No IP options, fragmentation, MTU, ICMP redirects, proxy ARP or gratuitous ARP. Static routes to an exit interface ARP for the destination directly.',
  },
  {
    area: 'IP',
    status: 'active',
    phase: 2,
    text: 'Routers drop the packet that triggers ARP resolution (so the first ping often shows ".!!!!", as on IOS); hosts queue it for up to 3 s. MAC addresses are generated deterministically from the device ID (locally-administered 02:xx…).',
  },
  {
    area: 'CLI',
    status: 'active',
    phase: 2,
    text: 'The CLI is an IOS-like subset for learning: commands, prompts and "show" layouts follow Cisco IOS closely but are not byte-identical, and many options are absent. Hosts use a Windows-style prompt with ipconfig, ping, tracert and arp; their IP settings are made in the IP Configuration form. Firewall, LER/LSR, RR and uCPE behave as plain IPv4 routers until their features arrive.',
  },
  // ---------------- Phase 3 ----------------
  {
    area: 'OSPF',
    status: 'active',
    phase: 3,
    text: 'OSPF state is computed directly from topology and config (no Hello/DBD/LSU packets, timers or LSA ageing). Modelled: neighbours with failure reasons (area, subnet, hello/dead, duplicate RID, MTU → EXSTART), DR/BDR election (non-preemptive history not kept), per-area SPF, ABR inter-area summaries, E2 externals (default-information originate, redistribute static), cost, ECMP up to 4 paths. Not modelled: stub/NSSA areas, virtual links, summarisation, authentication, route age in "show ip route".',
  },
  {
    area: 'Services',
    status: 'active',
    phase: 3,
    text: 'DHCP: real DORA packets, relay (ip helper-address) and APIPA fallback; lease timers, renewal/rebinding, conflict detection (ping before offer) and DNS resolution are not modelled. NAT/PAT translates ICMP only (ICMP id used as the "port"); translations do not time out. ACLs: standard/extended, numbered/named, first match, implicit deny, ICMP admin-prohibited; TCP traffic is never generated so TCP entries never match.',
  },
  {
    area: 'Redundancy',
    status: 'active',
    phase: 3,
    text: 'HSRP v1 / VRRPv2 election is computed from config and live interface state (no hello timers, so failover is instantaneous); priority, preempt and interface tracking are modelled. A new active router moves the virtual MAC in switch tables immediately (stands in for its hellos).',
  },
  {
    area: 'QoS',
    status: 'active',
    phase: 3,
    text: 'QoS is a steady-state fluid model of configured traffic flows, not packet scheduling: per-flow delivered rate and loss at each L3 egress interface, with LLQ (priority, policed under congestion), CBWFQ (bandwidth %) and FIFO. Queue delay/jitter, L2 switch queues, policing/shaping tools other than LLQ, and WRED are not modelled. SVI egress capacity is assumed 1 Gbit/s. The railway DSCP plan is illustrative, not an official IR policy.',
  },
  // ---------------- RailMPLS Lab profiles & data ----------------
  {
    area: 'Equipment profiles',
    status: 'active',
    phase: 1,
    text: 'Team Engineers NEON\'s real CLI is not public. NEON-LER/LSR profiles use the exact hardware figures quoted from CAMTECH SP37A p.35 and RailMPLS Lab\'s generic SP CLI (IOS-XE style); the console says "CLI syntax is generic, not official NEON syntax". src/profiles/commandMapping.neon.json is left unmapped until the official manual is available.',
  },
  {
    area: 'Equipment profiles',
    status: 'active',
    phase: 1,
    text: 'Cisco ASR 920/903, Juniper ACX4000/MX104 and Nokia SAR 8/IXR R4 are listed because the CAMTECH vendor table names them, but their specifications could not be read for this build: they show "unverified", use a generic placeholder port layout, and behave like the generic SP router. Vendor CLI dialects are not emulated.',
  },
  {
    area: 'Jodhpur division data',
    status: 'active',
    phase: 1,
    text: 'Station data comes from a reading of the NWR Jodhpur Division TRACK map (km = chainage as printed). Simulated OFC is assumed to run along the track, as is normal IR practice; the simulated network is not the actual RailTel/NWR telecom network. Items marked "check" must be verified on the physical map (see docs/jodhpur-check-report.md).',
  },
  {
    area: 'Devices',
    status: 'active',
    phase: 1,
    text: 'The hub repeats every frame out of every other port (no MAC learning), which shows why hubs waste bandwidth; collisions and half-duplex timing are not modelled yet. Internet and Adjacent Division clouds are placeholders whose behaviour arrives in later phases (their links show "media not simulated").',
  },
  // ---------------- Planned ----------------
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
  // ---------------- Labs (Phase 7) ----------------
  {
    area: 'Labs',
    status: 'active',
    phase: 7,
    text: 'Lab auto-checkers validate simulator STATE (topology, tables, sessions, alarms), not the exact CLI commands typed. Any configuration that produces the required state passes.',
  },
  {
    area: 'Labs',
    status: 'active',
    phase: 7,
    text: 'A lab whose required engine modules are not built is shown as LOCKED with the missing module and phase. The simulator never fakes protocol output to make a lab playable.',
  },
  {
    area: 'Labs',
    status: 'planned',
    phase: 7,
    text: 'Completion certificates are RailMPLS Lab training records only. They are not official Indian Railways, RDSO or IRISET certificates.',
  },
  {
    area: 'Equipment docs',
    status: 'active',
    phase: 7,
    text: 'Equipment descriptions are educational summaries; real equipment follows its OEM manual and IR/RDSO documents. Numeric values are typical teaching values unless marked as Standard. Safety-critical circuits (block, BPAC, LC gate, signalling data) are worked only as per IR manuals, RDSO guidelines and zonal instructions.',
  },
  {
    area: 'Scope',
    status: 'active',
    phase: 7,
    text: 'Networking-only mode (ENABLE_LEGACY_TDM = false): SDH/STM, PD-Mux, CWDM, E1/G.703, quad/VF and the voice/signalling terminals on them are hidden from the palette, link dialog, canvas and docs. Their model code is kept; files containing them still load, and the legacy items are preserved in the file but not shown. New routers are created without E1 WAN ports in this mode.',
  },
];
