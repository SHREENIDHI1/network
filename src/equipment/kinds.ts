import type { DeviceKind } from '../model/types';
import { PROFILES } from '../profiles/profiles';
import type { KindDoc } from './types';

const k = (
  kind: DeviceKind,
  family: KindDoc['family'],
  oneLiner: [string, string],
  overview: [string, string],
  railwayUse: [string, string],
): KindDoc => ({
  kind,
  family,
  oneLiner: { en: oneLiner[0], hi: oneLiner[1] },
  overview: { en: overview[0], hi: overview[1] },
  railwayUse: { en: railwayUse[0], hi: railwayUse[1] },
});

const BASE: KindDoc[] = [
  k(
    'pc',
    'endpoint',
    ['Desktop computer with one Ethernet NIC.', 'Ek Ethernet port wala desktop computer.'],
    [
      'A PC is an end device: it creates and consumes data. It has an IP address, subnet mask and default gateway (typed in or from DHCP), and uses ARP to find MAC addresses on its own subnet.',
      'PC ek end device hai: data banata aur use karta hai. Iska IP address, subnet mask aur default gateway hota hai (haath se ya DHCP se), aur apne subnet par MAC address ARP se dhoondhta hai.',
    ],
    [
      'Office PCs in SM office, control office, TI/SSE offices; test PC for engineers.',
      'SM office, control office, SSE office ke PC; engineer ka test PC.',
    ],
  ),
  k(
    'laptop',
    'endpoint',
    ['Engineer laptop: Ethernet NIC for testing and console work.', 'Engineer ka laptop: testing aur console ke liye.'],
    [
      'Same as a PC in the simulator (one Ethernet NIC). In the field a laptop is the maintenance tool: it plugs into a switch port to test, or into a console port with a USB-serial cable to configure equipment.',
      'Simulator mein PC jaisa hi (ek Ethernet NIC). Field mein laptop maintenance tool hai: switch port mein lagakar test, ya USB-serial cable se console port par configure.',
    ],
    [
      'Carried by S&T / telecom staff for commissioning and fault finding.',
      'S&T / telecom staff commissioning aur fault dhoondhne ke liye le jaate hain.',
    ],
  ),
  k(
    'server',
    'endpoint',
    ['Server host: application or file server with a fixed IP.', 'Server: fixed IP wala application/file server.'],
    [
      'A server is an end device that offers a service (web, database, file). It normally has a static IP so clients can always find it. In this simulator it answers ping; application services are not modelled.',
      'Server ek end device hai jo service deta hai (web, database, file). Static IP rakhte hain taaki clients hamesha dhoondh sakein. Simulator mein ping ka jawab deta hai; application services modelled nahi hain.',
    ],
    ['Divisional data centre / HQ server room (e.g. application servers reached over a VPN).', 'Divisional data centre / HQ server room.'],
  ),
  k(
    'uts-prs',
    'endpoint',
    ['UTS/PRS ticketing terminal at a booking counter.', 'Booking counter ka UTS/PRS ticket terminal.'],
    [
      'Ticketing terminal that talks to central ticketing servers. Needs reliable, isolated connectivity — usually its own VLAN and VPN, separated from public Railnet/Internet traffic.',
      'Ticket terminal jo central servers se baat karta hai. Bharosemand aur alag connectivity chahiye — aam taur par apna VLAN aur VPN, public Railnet/Internet se alag.',
    ],
    [
      'Booking counters at stations. Typical design: VLAN 10 for UTS, 20 for PRS (teaching plan).',
      'Station booking counter. Teaching plan: UTS VLAN 10, PRS VLAN 20.',
    ],
  ),
  k(
    'fois',
    'endpoint',
    ['FOIS terminal for freight operations data.', 'Freight operations (FOIS) ka terminal.'],
    [
      'Freight Operations Information System terminal used at goods sheds and yards. Treated as an IP end device in its own VLAN.',
      'Goods shed aur yard mein FOIS terminal. Apne VLAN mein IP end device ki tarah.',
    ],
    ['Goods sheds, yards, freight offices.', 'Goods shed, yard, freight office.'],
  ),
  k(
    'ip-phone',
    'endpoint',
    ['IP telephone: voice over the data network.', 'IP phone: data network par voice.'],
    [
      'Converts voice into packets (VoIP). Voice is sensitive to delay and jitter, so it usually gets its own voice VLAN and a high QoS priority (DSCP EF).',
      'Awaaz ko packets mein badalta hai (VoIP). Voice delay/jitter se pareshaan hoti hai, isliye alag voice VLAN aur high QoS priority (DSCP EF) dete hain.',
    ],
    ['Administrative and control telephony on the IP network.', 'IP network par administrative aur control telephony.'],
  ),
  k(
    'cctv',
    'endpoint',
    ['IP CCTV camera streaming video to an NVR.', 'IP CCTV camera jo NVR ko video bhejta hai.'],
    [
      'Captures video and streams it over IP. Cameras are often PoE-powered and generate steady high bandwidth, which drives station bandwidth planning.',
      'Video capture karke IP par bhejta hai. Aksar PoE se power, aur lagataar zyada bandwidth leta hai — station bandwidth planning mein bada hissa.',
    ],
    ['Platforms, circulating area, FOBs (video surveillance).', 'Platform, circulating area, FOB par surveillance.'],
  ),
  k(
    'nvr',
    'endpoint',
    ['Network video recorder storing CCTV streams.', 'CCTV video record karne wala NVR.'],
    [
      'Records camera streams to disk and serves them to viewers. Simulated as an IP end device.',
      'Camera stream disk par record karta hai. Simulator mein IP end device.',
    ],
    ['Station CCTV control room / RPF post.', 'Station CCTV control room / RPF post.'],
  ),
  k(
    'wifi-ap',
    'endpoint',
    ['Wi-Fi access point (wired uplink only in this simulator).', 'Wi-Fi access point (simulator mein sirf wired uplink).'],
    [
      'Bridges wireless clients onto the wired LAN. Radio, SSIDs and roaming are not simulated; only the wired uplink exists here.',
      'Wireless users ko wired LAN se jodta hai. Radio, SSID, roaming simulate nahi; yahan sirf wired uplink hai.',
    ],
    ['Station public Wi-Fi and staff Wi-Fi.', 'Station public Wi-Fi aur staff Wi-Fi.'],
  ),
  k(
    'nms',
    'endpoint',
    ['Network Management System server (monitoring).', 'Network Management System server (monitoring).'],
    [
      'Collects alarms, performance and configuration from network devices (SNMP, Syslog, NETCONF). In P1 it is an IP end device; NMS features arrive in P8.',
      'Devices se alarm, performance, config ikattha karta hai (SNMP, Syslog, NETCONF). P1 mein IP end device; NMS features P8 mein.',
    ],
    ['Divisional NOC at HQ (teaching assumption: JU).', 'HQ par divisional NOC (teaching assumption: JU).'],
  ),
  k(
    'dns-dhcp',
    'endpoint',
    ['DNS / DHCP / NTP server.', 'DNS / DHCP / NTP server.'],
    [
      'Gives names to addresses (DNS), addresses to hosts (DHCP) and time (NTP). In this simulator DHCP pools run on routers/L3 switches; this box is an IP end device.',
      'Naam se address (DNS), hosts ko address (DHCP), aur time (NTP). Simulator mein DHCP pool routers/L3 switch par chalta hai; yeh box IP end device hai.',
    ],
    ['Central services at HQ / data centre.', 'HQ / data centre ki central services.'],
  ),
  k(
    'hub',
    'hub',
    ['Ethernet hub: repeats every frame out of all ports.', 'Hub: har frame sab ports par repeat karta hai.'],
    [
      'A hub is a Layer 1 repeater. It does not read MAC addresses; whatever comes in one port goes out of all others. All ports share one collision domain. Hubs are obsolete — shown to understand why switches replaced them.',
      'Hub Layer 1 repeater hai. MAC address nahi padhta; ek port ka signal baaki sab ports par bhej deta hai. Sab ek collision domain mein. Hub ab purana ho gaya — switch kyon aaya, yeh samajhne ke liye dikhaya hai.',
    ],
    ['Not used in new railway networks (teaching only).', 'Naye railway networks mein use nahi (sirf padhai ke liye).'],
  ),
  k(
    'l2-switch',
    'l2switch',
    ['Layer 2 access switch: VLANs, trunks, RSTP.', 'Layer 2 access switch: VLAN, trunk, RSTP.'],
    [
      'Learns which MAC address lives on which port and forwards frames only where needed. VLANs split one switch into separate broadcast domains (e.g. UTS, CCTV, VoIP). Trunks carry many VLANs on one link with 802.1Q tags. RSTP blocks loops.',
      'Kaunsa MAC kis port par hai seekhta hai aur frame sirf zaroori port par bhejta hai. VLAN ek switch ko alag broadcast domains mein baant deta hai (UTS, CCTV, VoIP). Trunk ek link par kai VLAN 802.1Q tag ke saath le jaata hai. RSTP loop rokta hai.',
    ],
    ['Station LAN access switch in SM office / equipment room.', 'SM office / equipment room ka station LAN switch.'],
  ),
  k(
    'l3-switch',
    'l3switch',
    ['Layer 3 switch: VLAN switching plus inter-VLAN routing (SVIs).', 'L3 switch: VLAN switching + inter-VLAN routing (SVI).'],
    [
      'A switch that can also route. Each VLAN gets an SVI (interface Vlan10) with an IP that acts as the gateway for that VLAN. Routes between VLANs in hardware and can run OSPF.',
      'Switch jo route bhi karta hai. Har VLAN ka SVI (interface Vlan10) hota hai jiska IP us VLAN ka gateway hai. VLANs ke beech routing aur OSPF chala sakta hai.',
    ],
    ['Junction / major station distribution, HQ core LAN.', 'Junction / major station distribution, HQ core LAN.'],
  ),
  k(
    'router',
    'router',
    ['IP router: connects different networks and picks the best path.', 'IP router: alag networks jodta hai aur best rasta chunta hai.'],
    [
      'Reads the destination IP of each packet, looks up the routing table (longest prefix match) and sends it to the next hop. Learns routes statically or from protocols like OSPF. Also runs services such as DHCP, NAT and ACLs.',
      'Har packet ka destination IP padh kar routing table (longest prefix match) dekhta hai aur next hop ko bhejta hai. Routes static ya OSPF jaise protocol se seekhta hai. DHCP, NAT, ACL jaisi services bhi chalata hai.',
    ],
    [
      'Station or office WAN edge (before IP-MPLS: branch router on leased line / E1).',
      'Station/office WAN edge (IP-MPLS se pehle: leased line / E1 par branch router).',
    ],
  ),
  k(
    'firewall',
    'firewall',
    ['Firewall: filters traffic between security zones.', 'Firewall: security zones ke beech traffic filter.'],
    [
      'Sits between trusted and untrusted networks and allows only permitted traffic. Real firewalls are stateful and zone-based; in this simulator a firewall is a router whose filtering you build with ACLs (stateless).',
      'Trusted aur untrusted network ke beech baith kar sirf allowed traffic jaane deta hai. Asli firewall stateful/zone-based hote hain; simulator mein firewall ek router hai jismein ACL se filtering karte ho (stateless).',
    ],
    ['Internet / Railnet edge at HQ, data centre perimeter.', 'HQ par Internet/Railnet edge, data centre perimeter.'],
  ),
  k(
    'ler',
    'mpls',
    ['Generic LER / PE: edge router where traffic enters the MPLS network.', 'Generic LER/PE: MPLS network ka entry/exit router.'],
    [
      'Label Edge Router (Provider Edge). Customer/station traffic enters here, gets a label (push) and leaves at the far LER (pop). Holds VRFs for L3VPN and pseudowires for L2VPN.',
      'Label Edge Router (PE). Station ka traffic yahan aata hai, label lagta hai (push) aur door wale LER par hatta hai (pop). L3VPN ke VRF aur L2VPN ke pseudowire yahin.',
    ],
    ['Every station/POP on the IP-MPLS backbone (teaching design).', 'IP-MPLS backbone ka har station/POP (teaching design).'],
  ),
  k(
    'lsr',
    'mpls',
    ['Generic LSR / P: core router that switches labels.', 'Generic LSR/P: core router jo label switch karta hai.'],
    [
      'Label Switching Router (Provider). Looks only at the top label, swaps it and forwards — it does not need customer routes. Sits at junctions/aggregation points.',
      'Label Switching Router (P). Sirf top label dekhta, badalta aur aage bhejta hai — customer routes ki zaroorat nahi. Junction/aggregation par.',
    ],
    ['Junction / aggregation nodes (teaching assumption: JU, MTD, DNA…).', 'Junction/aggregation node (teaching assumption: JU, MTD, DNA…).'],
  ),
  k(
    'rr',
    'mpls',
    ['BGP route reflector for VPN routes.', 'VPN routes ke liye BGP route reflector.'],
    [
      'Reflects MP-BGP VPN routes between LERs so every LER does not need a session with every other LER. Usually not in the data path.',
      'LERs ke beech MP-BGP VPN routes reflect karta hai taaki har LER ko har LER se session na banana pade. Aam taur par data path mein nahi.',
    ],
    ['HQ / data centre, redundant pair.', 'HQ / data centre, redundant pair.'],
  ),
  k(
    'hybrid-agg',
    'mpls',
    ['Hybrid aggregation node: Ethernet + E1/TDM services on IP-MPLS.', 'Hybrid aggregation: IP-MPLS par Ethernet + E1/TDM.'],
    [
      'Combines packet ports with TDM (E1) interfaces so legacy circuits can ride the MPLS network (pseudowires, P6).',
      'Packet ports aur TDM (E1) interfaces saath — taaki purane circuits MPLS par chal sakein (pseudowire, P6).',
    ],
    ['Stations during SDH → IP-MPLS migration.', 'SDH → IP-MPLS migration ke dauran stations.'],
  ),
  k(
    'ucpe',
    'mpls',
    ['Universal CPE: small edge box hosting virtual functions.', 'Universal CPE: chhota edge box, virtual functions ke saath.'],
    [
      'Small edge router/server that can host virtual network functions. Simulated as a router.',
      'Chhota edge router/server jo virtual functions chala sakta hai. Simulator mein router.',
    ],
    ['Small sites / halts (teaching).', 'Chhote sites / halts (teaching).'],
  ),
  k(
    'internet',
    'cloud',
    ['Internet cloud (placeholder).', 'Internet cloud (placeholder).'],
    [
      'Represents the public Internet. Placeholder only in P1 — it does not forward or answer traffic yet.',
      'Public Internet ko dikhata hai. P1 mein sirf placeholder — traffic forward/jawab nahi.',
    ],
    ['Reached through NAT/firewall at HQ.', 'HQ par NAT/firewall ke through.'],
  ),
  k(
    'adj-division',
    'cloud',
    ['Adjacent division network (placeholder).', 'Padosi division ka network (placeholder).'],
    [
      'Represents a neighbouring division (e.g. beyond a division-boundary station). Placeholder in P1; inter-division hand-off is taught in B13.',
      'Padosi division (boundary station ke aage). P1 mein placeholder; inter-division hand-off B13 mein.',
    ],
    ['Division boundary hand-off point.', 'Division boundary hand-off point.'],
  ),
];

const PROFILE_DOCS: KindDoc[] = PROFILES.map((p) =>
  k(
    p.id as DeviceKind,
    'mpls',
    [`${p.vendor} ${p.model} profile — ${p.role}.`, `${p.vendor} ${p.model} profile — ${p.role}.`],
    [
      `${p.label}: IP-MPLS ${p.role === 'LER' ? 'edge (PE)' : 'core (P)'} router profile. Hardware values come from the profile's source column; ${
        p.specsVerified ? 'checked against the CAMTECH table as provided.' : 'NOT verified against a datasheet — treat as generic.'
      } CLI is the simulator's generic SP CLI, not the vendor's syntax.`,
      `${p.label}: IP-MPLS ${p.role === 'LER' ? 'edge (PE)' : 'core (P)'} router profile. Hardware values profile ke source column se; ${
        p.specsVerified ? 'CAMTECH table (jaise diya gaya) se.' : 'datasheet se verify NAHI — generic maano.'
      } CLI simulator ka generic SP CLI hai, vendor ka syntax nahi.`,
    ],
    [p.placement, p.placement],
  ),
);

export const KIND_DOCS: KindDoc[] = [...BASE, ...PROFILE_DOCS];

export function kindDoc(kind: DeviceKind): KindDoc | undefined {
  return KIND_DOCS.find((d) => d.kind === kind);
}
