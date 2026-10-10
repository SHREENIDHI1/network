# RailMPLS Lab

A browser-based **networking + IP-MPLS training simulator** set in the context of Indian Railways (NWR, Jodhpur division). It teaches from zero: what a network is → Ethernet, IP, OSPF → MPLS, VPNs and the divisional backbone. Lessons are in simple Hinglish; the UI, labels and CLI are in English.

> **Honesty first.** RailMPLS Lab is an *educational simulator*, not a real router OS. Every simplification is listed in the in-app **Model Limitations** panel.
> - Team Engineers NEON's real CLI is not public. NEON profiles use the hardware figures quoted from CAMTECH SP37A p.35 plus a *generic SP CLI* (IOS-XE style), with the banner "CLI syntax is generic, not official NEON syntax". `src/profiles/commandMapping.neon.json` stays unmapped until an official manual is available.
> - Cisco/Juniper/Nokia profiles are marked **unverified** and behave like the generic SP router.
> - The Jodhpur map is a **track** map. The simulator assumes OFC runs along the track; it is **not** the real RailTel/NWR network. Items marked `check` in `docs/jodhpur-check-report.md` need verification.
> - Show commands print only state the engine really computes.

## Three modes

| Mode | What you do |
|---|---|
| **Learn** | Lessons A0–A15 (foundations) and B0–B15 (IP-MPLS); A0–A8 available now. Railway analogies, interactive widgets (MAC learning, subnet calculator, VLSM planner, 802.1Q tag, root election…), glossary and a 5-question flash quiz. Also a searchable **Glossary** and **Command reference**. Progress is saved in the browser (Export/Import as JSON). |
| **Lab** | Auto-checked labs L4.1–L8.1 at MTD (hub vs switch, addressing, VLSM, VLANs, STP + LACP + port security): live task checks from engine state, hints (−2 points each), break-fix fault, quiz, field note and the reference solution after completion. |
| **Sandbox** | Free canvas: place devices, cable them, configure them via CLI, ping, and step packets hop by hop. The console's **Ask why** pane explains every field of the last show command. |

Click any device (or the ⓘ on a palette item, or double-click a device) for its **detail panel**: Overview, Hardware, Capabilities, How it forwards, Config guide, Verify & troubleshoot, Maintenance & safety, Station info and LIVE state, in English or Hinglish.

## Status

| Phase | Scope | Status |
|---|---|---|
| P1 | Scaffold, canvas, device catalog (basics, NEON and vendor profiles), links, save/load, Model Limitations, device detail panel, LEARN framework + lessons A0–A3, Jodhpur station data (M0) | ✅ Done |
| P2 | Engine core, physical (duplex), Ethernet/VLAN/STP, EtherChannel/LACP, CLI (incl. interface range), consoles, packet walk, Lab mode, lessons + labs A4–A8, Glossary, Command Reference, "Ask why" | ✅ Done |
| P3 | Loopbacks, OSPF, IS-IS (L1/L2), RIPv2 (comparison), DHCP/DNS/NAT/NTP/syslog/SNMP traps/SSH-Telnet as real packets, ACL + vty security, HSRP/VRRP, QoS tab; lessons A9–A15 and labs L9.1–L15.1 (capstone with 5 fault tickets) | ✅ Done |
| P4 | Jodhpur generators J1–J4 + IP plan + schematic map layout; MPLS + LDP (PHP, explicit-null, LDP-IGP sync), label data plane, LSP ping/trace, MPLS LIVE panel; lessons B0–B4 and labs LB1.1–LB4.1 | ✅ Done — awaiting review |
| P5 | BGP + route reflectors + L3VPN; B5–B6 | Next |
| P6–P10 | L2VPN/TDM PW, MPLS QoS/TE, NMS/automation, grand capstone, final docs | Planned |

Everything a lab checks is engine state (tables, sessions, packets) — the simulator never fakes show output. Simplifications are listed in the in-app **Model Limitations** panel.

## Run it on Windows

You already have Node.js. Check it in PowerShell with `node -v` (version 20 or 22 recommended).

```powershell
git clone https://github.com/shreenidhi1/network.git
cd network
git checkout claude/railnet-sim-simulator-le2oq2
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>). macOS/Linux: same commands.

### Localhost par purane items dikh rahe hain?

1. **Status bar ke right corner** mein `v0.4.0 · <commit>` dekho. Agar commit GitHub ke latest se purana hai, to code purana hai:
   ```powershell
   git pull origin claude/railnet-sim-simulator-le2oq2
   npm install
   ```
   Phir `npm run dev` band karke (Ctrl+C) dobara chalao, aur browser mein **Ctrl+Shift+R** (hard refresh).
2. Canvas par purana topology = browser ka **autosave** (aapka pichhla kaam). App ab notice dikhata hai "Restored your last canvas…". Fresh start ke liye Sandbox mein **New** dabao. Lab start karne par bhi canvas lab topology se replace ho jaata hai.
3. Sab kuch reset karna ho (progress bhi): browser DevTools → Application → Local Storage → `railnet-sim:autosave` aur `railmpls-lab:*` keys delete karo. Progress pehle Learn mode se Export kar lo.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm test` | Run all unit tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check + production build into `dist/` (static files, works offline) |
| `npm run preview` | Serve the production build |
| `npm run report:jodhpur` | Regenerate `docs/jodhpur-check-report.md` from the station data |

## Deploy for free

`npm run build` produces a static site in `dist/`, with relative asset paths so it works from any sub-folder.

- **Netlify** (easiest): <https://app.netlify.com/drop> → drag the `dist` folder onto the page. Or connect the repo with build command `npm run build` and publish directory `dist`.
- **Vercel**: import the GitHub repo → framework *Vite* → build `npm run build`, output `dist`.
- **GitHub Pages**: repo *Settings → Pages → Source: GitHub Actions* → use the "Static HTML" starter workflow, and change its upload `path` to `dist` after an `npm ci && npm run build` step.

No server, database or API key is needed. Progress and autosave live in the visitor's browser.

## Sandbox: using the simulator

- **Configure hosts** (PC, UTS/PRS, FOIS, CCTV…): select the device → *IP Configuration* (address, mask, gateway) → Apply.
- **Configure switches/routers**: select the device → *Open CLI* (or *Console* in the toolbar). IOS-like commands, e.g.
  ```
  enable
  configure terminal
  vlan 10
   name UTS
  interface gi0/1
   switchport mode access
   switchport access vlan 10
  interface gi0/24
   switchport mode trunk
   switchport trunk allowed vlan 10,20
  end
  show vlan brief
  ```
  Router-on-a-stick: `interface g0/0` → `no shutdown`; `interface g0/0.10` → `encapsulation dot1Q 10` → `ip address 10.0.10.1 255.255.255.0`.
  Router ports are shut down by default, as on real routers. `?` gives help, Tab completes, `do` works in config mode, `write memory` saves startup-config.
- **Test**: `ping`, `traceroute` on routers/switches; `ping`, `tracert`, `ipconfig`, `nslookup`, `ssh user@host`, `telnet`, `arp -a` on hosts.
- **Routing (P3)**: `router ospf 1` / `network … area 0`, `router isis` / `net 49.0001.0000.0000.0001.00` + `ip router isis`, `router rip` / `version 2`. Check with `show ip route`, `show ip ospf neighbor`, `show ip ospf interface`, `show isis neighbors`.
- **Services (P3)**: DHCP pools and DNS records on the DNS/DHCP server (properties panel), `ip helper-address`, `ip nat inside/outside` + `ip nat inside source list … overload`, `ntp server`, `logging host`, `snmp-server host`, SSH (`ip domain-name`, `crypto key generate rsa`, `username`, `line vty 0 4` → `login local`, `transport input ssh`). The NMS server shows received syslog/traps in its panel.
- **Jodhpur division (P4)**: toolbar → *Load* → J1 core / J2 JU–FL / J3 per control board / J4 full division, with a config level (cabled, IP plan, + OSPF, + OSPF + MPLS). Learn → *Jodhpur* shows the sites, spans, OSPF areas and the generated IP plan with its overlap check. Track-map teaching design, not the real RailTel/NWR network.
- **MPLS (P4)**: `mpls ip` on core interfaces (or `mpls ldp autoconfig` under `router ospf`), `mpls ldp router-id loopback0 force`, `mpls ldp sync`, `mpls ldp explicit-null`, `no mpls ip propagate-ttl`. Check with `show mpls ldp neighbor`, `show mpls ldp bindings`, `show mpls forwarding-table`, `ping mpls ipv4 10.0.2.6/32`, `traceroute mpls ipv4 …`. The Packet Inspector shows the label stack; a router's LIVE panel lists LDP peers and the LFIB.
- **QoS tab** (bottom dock): offered vs delivered rate and loss per traffic flow, and which interface is the bottleneck.
- **Packet Inspector** (Console dock): each probe/ARP exchange as a flow; step hop by hop and see Ethernet / 802.1Q / ARP / IPv4 / ICMP headers and which table decided (MAC table, VLAN, STP, ARP cache, routing table).
- **Realtime vs Simulation mode** (toolbar): Realtime runs commands instantly; Simulation queues events — use Step ⏭ / Play ▶ / speed and watch frames move on the canvas (yellow glow) and in the *Events* tab.
- **Faults**: select a link → *Cut fibre/cable* and *Repair*. Canvas shows `DOWN`, `DOWN (admin)`, `CUT` and `STP BLK` badges.

## Sandbox: using the editor

- **Add devices**: drag from the left palette (Legacy / LAN-IP / IP-MPLS), or click a palette item.
- **Connect**: hover a device, drag from a blue handle and drop on another device. A dialog offers only *physically valid* link types and free port pairs, for example:
  - STM-1 aggregate ↔ STM-1 only (STM-1 ↔ STM-4 is refused: rate mismatch)
  - PD-Mux FXS ↔ phone, PD-Mux FXO ↔ exchange subscriber (FXS), E&M ↔ E&M
  - CWDM lambda: coloured STM/SFP optic ↔ CWDM channel port; OFC between CWDM LINE ports
  - Cat6 limited to 100 m
- **Inspect / edit**: click a device (name, station code, ports and what they connect to) or a link (length, label, cores, optics).
- **Optical budget**: OFC links compute Rx power from Tx, fibre dB/km, connectors, splices and extra (CWDM) loss using ITU-T G.957 / IEEE 802.3 optic profiles. Failing links turn red with an **LOS** badge.
- **Save / Open**: JSON files (`*.railnet.json` (format name kept for compatibility)). Loading re-validates every link against the physical rules. Work is also autosaved in the browser.
- **Load demo**: a two-station STM-1 + PD-Mux + LAN example.

## Project structure

```
src/
  model/          domain types, device catalog, link rules, pure topology ops, limitations register
  engine/         simulation engine (pure TypeScript, no UI imports)
    core/         event queue, frame/packet types, MAC addressing
    config/       per-device NetConfig (running-config) model + defaults
    physical/     optical power budget, link/port state, fibre cuts
    ethernet/     simplified RSTP
    ip/           IPv4 helpers, L3 interfaces (ports, subinterfaces, SVIs), routing table
    cli/          IOS-like CLI parser/commands, show formatting, host command prompt
    sim.ts        discrete-event engine: bridging, ARP, IPv4 forwarding, ICMP, traces
  io/             save/load JSON with schema validation
  store/          Zustand store
  ui/             React components (canvas, palette, properties, dialogs)
  topologies/     topology builder + demo / preloaded topologies
  labs/           Labs framework (auto-checked labs from P2)
  lessons/        LEARN mode: curriculum, lesson content (content/a0.ts …), progress, widget maths
  equipment/      device detail panel data (per-kind + per-family docs, generated config/verify guides)
  profiles/       NEON / vendor router profiles + NEON command mapping (unmapped)
  topologies/data Jodhpur division stations and sections (M0)
```

Engine modules for `pdh`, `sdh`, `ethernet`, `ip`, `ospf`, `mpls`, `bgp` and `qos` are added under `src/engine/` in their phases.

## Reference

Context from CAMTECH *An Introductory Handbook on IP-MPLS Technology* (CAMTECH/S/PROJ/2021-22/SP37A). Behaviour follows ITU-T G.707/G.704/G.957/G.694.2, IEEE 802.1Q/802.3 and RFC 3031/3032/5036/4364/4448; where the handbook is imprecise, the standard wins.
