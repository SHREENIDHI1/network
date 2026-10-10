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
    text: 'Built so far: topology editor (Phase 1), Ethernet + IPv4 engine (Phase 2), OSPF, IS-IS, RIPv2, DHCP, DNS, NAT, NTP, syslog/SNMP traps, SSH/Telnet login checks, ACL, HSRP/VRRP and QoS analysis (Phase 3), MPLS with LDP, LSP ping/trace and the Jodhpur division topologies J1–J4 (Phase 4), BGP (eBGP/iBGP, route reflectors) with MP-BGP VPNv4 L3VPNs and VRFs (Phase 5), L2VPN pseudowires — VPWS, VPLS and E1 circuit emulation (SAToP/CESoPSN) on logical E1 controllers (Phase 6), MPLS QoS (EXP marking and core classes) with RSVP-TE tunnels and fast reroute (Phase 7), and operations: NMS view with alarms and railway services, power / card / fibre fault drills, an automation tab and the Option A inter-division hand-off (Phase 8). Segment Routing and the grand capstone come next.',
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
    text: 'Switch ports default to static access mode in VLAN 1 (real Catalyst default is dynamic auto/DTP). DTP, VTP, voice VLAN, CDP/LLDP, PAgP, storm control and jumbo frames are not modelled. IP phones do not bridge their PC port.',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'Port security: sticky MACs, aging and err-disable auto-recovery are not modelled; recovery is "shutdown" then "no shutdown".',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'EtherChannel (LACP 802.3ad, simplified): bundling is computed from configuration and link state — no LACPDUs, timers, system/port priorities or hot-standby members; PAgP (auto/desirable) is not simulated; only Layer 2 port-channels on switches. Mode "on" facing LACP suspends both ends (real gear may bundle one side and loop; EtherChannel guard would then err-disable it). LACP with no partner shows stand-alone (I). Frames are spread by a src/dst MAC hash.',
  },
  {
    area: 'Ethernet',
    status: 'active',
    phase: 2,
    text: 'Duplex: auto/auto → full; forced + auto → the auto end falls back to half duplex (mismatch when forced full). Only Cat6 links negotiate; fibre/SFP is always full. A mismatch is modelled as a fixed loss of every 4th frame on that link plus CRC (full end) and late-collision (half end) counters — real loss depends on load. Speed negotiation is assumed to succeed at the link speed.',
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
    text: 'DHCP: real DORA packets, relay (ip helper-address) and APIPA fallback; lease timers, renewal/rebinding and conflict detection (ping before offer) are not modelled. NAT/PAT translates ICMP only (ICMP id used as the "port"); translations do not time out. ACLs: standard/extended, numbered/named, first match, implicit deny, ICMP admin-prohibited; UDP/TCP port entries match the simulated DNS, NTP, syslog, SNMP, SSH and Telnet packets. ACLs are stateless (no reflexive/established tracking); "show access-lists" match counters count simulated packets only.',
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
  {
    area: 'IS-IS',
    status: 'active',
    phase: 3,
    text: 'IS-IS state is computed from config (no IIH/LSP/CSNP packets, no LSP ageing or timers). Modelled: NET parsing, L1 adjacency only within one area, L2 between any areas, duplicate system-ID refusal, simple DIS/pseudonode, narrow metrics (default 10), L1→L2 leaking, ATT bit and a default route on L1-only routers, AD 115. Not modelled: wide metrics, route leaking L2→L1, authentication, overload bit, multi-topology, mesh groups.',
  },
  {
    area: 'RIP',
    status: 'active',
    phase: 3,
    text: 'RIPv2 is a converged Bellman-Ford result (hop count, 16 = unreachable, split horizon, classful "network" statements, passive interfaces, default-information originate). It runs only with "version 2". Update/invalid/flush timers, triggered updates, poisoned reverse and authentication are not modelled — RIP exists here only as a historical comparison.',
  },
  {
    area: 'Management',
    status: 'active',
    phase: 3,
    text: 'DNS, NTP, syslog and SNMP traps travel as real UDP packets (routing, ACLs and NAT apply; Packet Inspector shows them). DNS: A records only, one level (no recursion, no zones, no TTL caching). NTP: one request/reply sets the clock and stratum; the poll is sent when you run "show ntp status" or "show ntp associations" (stand-in for the periodic poll; no offset/delay maths, no authentication). Syslog/traps are sent only for interface up/down events. SNMP polling (GET/WALK) is not simulated.',
  },
  {
    area: 'Management',
    status: 'active',
    phase: 3,
    text: 'SSH and Telnet open a real TCP connection (SYN, SYN-ACK or RST) and check the vty rules (transport input, login local/line, password set, access-class, RSA keys + domain name for SSH). There is no interactive remote shell and no encryption maths — use the device console. Passwords are not stored or checked; only the username must exist for "login local".',
  },
  {
    area: 'IP',
    status: 'active',
    phase: 3,
    text: 'Loopback interfaces are always up unless shut down and are advertised as /32 host routes (OSPF cost 1). Router-originated non-ICMP packets (DNS, NTP, syslog, traps) wait for ARP to resolve, while pings keep the IOS behaviour of dropping the first packet during ARP.',
  },
  {
    area: 'Labs',
    status: 'active',
    phase: 3,
    text: 'Capstone fault tickets are injected one at a time into your working network; each ticket closes only when the complaint’s own test (ping, DHCP lease, DNS lookup, neighbour state) passes again. Tasks that depend on a planned fibre cut accept the post-cut state. The QoS tab traffic flows are preset in the lab topology.',
  },
  // ---------------- Phase 4 ----------------
  {
    area: 'MPLS',
    status: 'active',
    phase: 4,
    text: 'LDP state is computed from config and routing tables (no Hello/Init/Label-Mapping messages, timers, session flaps or graceful restart). Modelled: discovery on "mpls ip" interfaces, sessions that need the peer LDP router-ID routable (and unique), downstream-unsolicited bindings with liberal retention for every IGP/connected/static prefix, implicit-null (PHP) or explicit-null for own prefixes, LFIB from the routing next hop, LDP-IGP sync (max OSPF cost) and "mpls ldp autoconfig" for OSPF. Not modelled: targeted LDP, label filtering/allocation for host routes only, session protection, IS-IS sync/autoconfig, MPLS MTU.',
  },
  {
    area: 'MPLS',
    status: 'active',
    phase: 4,
    text: 'Local labels are allocated from 16 upwards on each router in route-install order (connected first, then nearest IGP routes) — real routers allocate in learning order, so exact numbers differ; only their meaning matters. The data plane does real push/swap/pop with label TTL (uniform with propagate-ttl, pipe without) and RFC 4950 labels in traceroute; with a single label an expired label TTL answers ICMP directly; with a label stack (L3VPN) the ICMP error is forwarded along the LSP to the egress PE, which returns it in the VRF (RFC 3032 §2.3.2). EXP/TC is copied from IP precedence at imposition unless an input policy sets it (Phase 7); queuing is evaluated by the QoS analysis, not packet by packet.',
  },
  {
    area: 'MPLS',
    status: 'active',
    phase: 4,
    text: 'LSP ping / traceroute (RFC 8029) send real MPLS echo packets (UDP 3503, IP destination 127.0.0.1) and return the codes ! L B Q f. Downstream mapping (DDMAP), MRU, multipath discovery, reply modes and the full return-code set are not simulated.',
  },
  {
    area: 'IP',
    status: 'active',
    phase: 4,
    text: 'Routers with a FULL OSPF adjacency or an LDP session already know each other’s MAC (their unicast DBD/LSU and TCP exchanges resolved ARP), so the first transit packet is not dropped for ARP between them. /31 point-to-point links (RFC 3021) are supported.',
  },
  {
    area: 'Jodhpur division data',
    status: 'active',
    phase: 4,
    text: 'J1–J4 are generated from the TRACK map: OFC is assumed to follow the track, so they are a teaching design, not the real RailTel / NWR network. Layout is schematic (directions per section, very short spans drawn at a minimum length — not to scale). Unknown chainages are interpolated and marked "estimated". J1 links are logical express paths whose optics are not modelled. Boundary hand-offs to adjacent divisions are placeholders until the inter-division labs (Phase 8). The IP plan and OSPF area design (core area 0, one area per control board) are a teaching plan.',
  },
  // ---------------- Phase 5 ----------------
  {
    area: 'BGP',
    status: 'active',
    phase: 5,
    text: 'BGP is computed, not exchanged: sessions come up when the neighbour is reachable from the right source (update-source), remote-as matches, eBGP peers are directly connected (or ebgp-multihop) and nothing is shut down; otherwise the summary shows Idle/Active with the reason. No OPEN/UPDATE/KEEPALIVE messages, timers, hold-time expiry, message counters or table versions (shown as "-"), no graceful restart, route dampening, communities other than route-targets, route-maps or prefix-lists.',
  },
  {
    area: 'BGP',
    status: 'active',
    phase: 5,
    text: 'Best path uses: weight, LOCAL_PREF, locally originated, AS_PATH length, ORIGIN, MED (always compared), eBGP over iBGP, IGP cost to the next hop, ORIGINATOR_ID/router-ID, peer address. Route reflection follows RFC 4456 (client/non-client rules, ORIGINATOR_ID, CLUSTER_LIST with the RR router-ID as cluster-id). Not modelled: confederations, multipath, add-path, AS-path prepending, aggregation, synchronisation, BGP next-hop tracking delays.',
  },
  {
    area: 'L3VPN',
    status: 'active',
    phase: 5,
    text: 'VPNv4 routes are exported from a VRF only by "redistribute connected/static" or "network" under its address-family (or learned from a PE–CE eBGP neighbour) and imported by route-target into VRFs on OTHER PEs; leaking between two VRFs on the same PE (local import) is not modelled. VPN labels are allocated per prefix from 1000 on each PE (real routers use their own label ranges and may allocate per VRF/CE). PE–CE routing: static and eBGP only (no PE–CE OSPF/RIP, no sham-links, no as-override/allowas-in). No inter-AS options, no 6PE/6VPE.',
  },
  {
    area: 'L3VPN',
    status: 'active',
    phase: 5,
    text: 'The JU firewall in the B6 labs is a router with NAT and routes, not a stateful firewall: no zones, sessions or inspection. The ISP router is a teaching stand-in. The VRF/RD/RT plan (RT 65000:100–107) is a teaching plan, not the real RailTel/NWR design.',
  },
  // ---------------- Phase 6 ----------------
  {
    area: 'L2VPN',
    status: 'active',
    phase: 6,
    text: "Pseudowire signalling is computed, not exchanged: a VC is UP when both PEs have a mirror xconnect / VFI neighbour (same VC ID, peer = the other PE's LDP router-ID), the router-IDs are reachable both ways, PW types match (Ethernet and Eth VLAN interwork), MTUs match (Ethernet) and timeslots match (CESoPSN), both attachment circuits are up and an LDP LSP leads to the peer. No targeted-LDP hellos, PW status TLVs, control-word or VCCV negotiation, PW redundancy or pseudowire headend. VC labels are allocated per PE after its LDP labels (from 2000 at the lowest).",
  },
  {
    area: 'L2VPN',
    status: 'active',
    phase: 6,
    text: 'Ethernet frames really cross the core under [transport, VC] labels; a VLAN-based AC removes its tag and the far end adds its own (VLAN rewrite). VPLS: the VFI attaches straight to a port ("xconnect vfi NAME" on the interface — IOS attaches it to an SVI, IOS-XE to a bridge-domain); MAC learning per VFI, flooding and split horizon are modelled; MAC aging, MAC limits, BPDU handling, H-VPLS and EVPN are not.',
  },
  {
    area: 'TDM over MPLS',
    status: 'active',
    phase: 6,
    text: 'Networking-only mode: E1 controllers are logical — they follow the hardware profile (NEON LER E1 0/2/0–15, LSR E1 0/4/0–15) but no E1 cable, framer, line coding, alarms (LOS/AIS/RAI), clock or TDM bits are simulated, and the equipment behind them (BPAC, block, control phones) is not. CEM traffic does not appear in the QoS tab; packetisation, jitter buffer and clock recovery are taught with a calculator only. "show controllers E1" and the CEM lines are simplified.',
  },
  // ---------------- Phase 7 ----------------
  {
    area: 'MPLS QoS',
    status: 'active',
    phase: 7,
    text: 'The QoS tab follows each configured traffic flow through VRFs, VPN labels, LDP (with PHP), TE tunnels (incl. FRR backups) and pseudowires, and computes steady-state loss per queue (LLQ, bandwidth guarantees, FIFO). A labelled packet only matches "match mpls experimental topmost"; an unlabelled one only "match dscp". EXP at imposition = IP precedence, or "set mpls experimental imposition"; "set mpls experimental topmost" re-marks in the core. Not modelled: bursts, queue depth, WRED, policers other than LLQ, shaping, uniform/pipe/short-pipe mode commands (taught in the lesson), EXP-to-DSCP copy at egress, EoMPLS EXP from 802.1p (pseudowire traffic uses EXP 0 unless re-marked).',
  },
  {
    area: 'MPLS TE',
    status: 'active',
    phase: 7,
    text: 'RSVP-TE is computed, not signalled: TE links need OSPF FULL adjacency, "mpls traffic-eng tunnels" on both routers and interfaces, OSPF "mpls traffic-eng router-id/area" and "ip rsvp bandwidth" (no value = 75% of the link). CSPF uses the OSPF cost as TE metric with a bandwidth constraint; explicit paths support strict "next-address" and "exclude-address"; bandwidth is admitted tunnel by tunnel in head-name order. Not modelled: setup/hold priorities and pre-emption, affinities/attribute flags, SRLGs, loose hops, auto-bandwidth, forwarding adjacency, LDP over TE, static routes into tunnels, IS-IS TE, Path/Resv messages and refresh. TE labels are allocated per router after its LDP labels (from 3000 at the lowest).',
  },
  {
    area: 'MPLS TE',
    status: 'active',
    phase: 7,
    text: 'Autoroute announce moves the head end\'s IGP routes whose path passes through the tail into the tunnel. FRR is facility backup with link protection (merge at the next hop or next-next hop); the switchover is immediate in the model, and an LSP stays on its backup until "mpls traffic-eng reoptimize" is run on the head end so the FRR state can be studied — real head ends re-signal on their own within seconds (make-before-break). Established LSPs keep their path while it stays valid (no periodic re-optimisation). The JU–DNA lease in the B10 labs is a teaching assumption: the J1 core is a tree.',
  },
  // ---------------- Phase 8 ----------------
  {
    area: 'NMS',
    status: 'active',
    phase: 8,
    text: 'The NMS tab is computed from simulator state, not from SNMP traffic: a router is "managed" when it has an SNMP community equal to the NMS polling community and the NMS has a path to one of its addresses (path check, no SNMP packets, no MIB walk, no poll interval). Alarms are raised for managed devices (plus node unreachable / not managed) and split by layer: root causes (power, card, link, err-disabled, OSPF, LDP) and impact (BGP, pseudowire, TE, congestion, services). Correlation is rule-based — every impact alarm lists the root causes present at the same time; there is no timing, flapping, acknowledgement or topology-aware correlation.',
  },
  {
    area: 'NMS',
    status: 'active',
    phase: 8,
    text: 'Railway services are path checks (the same hop walk as the QoS tab: routing, VRFs, labels, TE, pseudowires) or pseudowire states; they do not evaluate ACLs, NAT or firewalls, so confirm with a real ping. DEGRADED means a configured traffic flow on that path loses more than 1%. Link utilisation comes from the configured traffic flows (no counters over time, no graphs history).',
  },
  {
    area: 'Faults',
    status: 'active',
    phase: 8,
    text: 'Fault injection: fibre cut on a link (not saved in the file), power failure and line-card failure on a device (saved with the topology until repaired; a card is a port-name prefix such as Te0/0/). A powered-off device takes all its interfaces down; there is no boot time, redundancy switchover (dual control card / PSU) or partial card failure.',
  },
  {
    area: 'Automation',
    status: 'active',
    phase: 8,
    text: 'The Automation tab is a teaching tool modelled on Ansible-style workflows: {{hostname}}, {{station}}, {{loopback}}, {{router_id}} variables, push through the simulator CLI with per-device errors, and regex compliance over the running-config. No inventory files, idempotency, dry-run diff, rollback, NETCONF/RESTCONF/YANG or telemetry.',
  },
  {
    area: 'Inter-AS',
    status: 'active',
    phase: 8,
    text: 'Only Inter-AS Option A (back-to-back VRFs on dot1Q sub-interfaces with per-VRF eBGP) is simulated. Options B and C (labelled VPNv4 between ASes) are taught in lesson B13 only. JP-ASBR and AS 65002 are a teaching stand-in for the Jaipur division.',
  },
  // ---------------- RailMPLS Lab profiles & data ----------------
  {
    area: 'Learning content',
    status: 'active',
    phase: 1,
    text: 'Lessons and equipment detail panels are teaching-level summaries, not RDSO/CAMTECH specifications or maintenance schedules. Config guides use only commands this simulator accepts (checked by tests); real equipment syntax and procedures may differ. Bandwidth/latency and optical-budget widgets use ideal maths (no protocol overhead, queueing, ageing beyond the 3 dB margin).',
  },
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
  // ---------------- Labs ----------------
  {
    area: 'Labs',
    status: 'active',
    phase: 2,
    text: 'Lab scores, hints used and quiz results are stored in this browser (export/import in Learn mode). Break-fix faults are injected into your lab topology; ping history is cleared so the fix must be tested again.',
  },
  {
    area: 'Learning content',
    status: 'active',
    phase: 2,
    text: '"Ask why" explains the fields of supported show commands in a side pane next to the console (xterm text cannot carry buttons inline). Command Reference lists the documented commands; "?" in the CLI shows everything the simulator accepts in a mode.',
  },
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
