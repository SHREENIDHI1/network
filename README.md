# RailMPLS Lab

**Indian Railways (NWR, Jodhpur division) ke context mein networking + IP-MPLS seekhne ka browser-based training simulator.**
Zero se shuru: network kya hai → Ethernet, IP, OSPF → MPLS, LDP, L3VPN, pseudowires, QoS, Traffic Engineering, Segment Routing → NMS aur poora divisional backbone. Lessons simple Hinglish mein; UI, labels aur CLI English mein.

Created by **Shreenidhi Sharma · JE (Tele), NWR** · Version **1.0.0**

> **Imaandari pehle (honesty first)**
> - Yeh ek **educational simulator** hai, asli router OS nahi. Har simplification app ke **Model Limitations** panel mein likha hai.
> - Team Engineers NEON ka asli CLI public nahi hai. NEON profiles mein CAMTECH SP37A p.35 ke hardware figures + ek **generic SP CLI (IOS-XE style)** hai — banner bhi yahi kehta hai. `src/profiles/commandMapping.neon.json` tab tak unmapped rahega jab tak official manual na mile.
> - Cisco / Juniper / Nokia profiles **unverified** hain aur generic SP router jaise chalte hain.
> - Jodhpur map ek **track map** hai. Simulator maanta hai ki OFC track ke saath hai; yeh **asli RailTel / NWR network nahi** hai. `docs/jodhpur-check-report.md` mein `check` wale items verify karne hain.
> - Show commands sirf wahi state dikhate hain jo engine sach mein compute karta hai — kuch bhi "fake" output nahi.

## Isme kya hai

| Mode | Kya karte ho |
|---|---|
| **Learn** | 32 lessons: A0–A15 (networking foundations) aur B0–B15 (IP-MPLS). Railway analogies, interactive widgets (subnet / VLSM calculator, SPF, LSP walk, CSPF, TI-LFA…), 5-question flash quiz, Glossary, Command Reference (188 commands), Jodhpur IP plan aur **Dashboard** (progress, points, "aage kya karein"). |
| **Lab** | 31 auto-checked labs (L4.1 → LB15.1): scenario, plan, live task checks (engine state se), hints (−2 points), break-fix fault, quiz, field note, reference solution. Capstones: L15.1 (5 tickets) aur LB15.1 (J2 ke 27 routers, 23 ke catalog se seed se 10 tickets). |
| **Sandbox** | Khaali canvas: devices rakho, cable lagao, CLI se configure karo, ping / traceroute karo, packets hop-by-hop dekho, Jodhpur topologies (J1–J4) load karo. |

Kisi bhi device par click karo → **detail panel** (Overview, Hardware, Capabilities, How it forwards, Config guide, Verify & troubleshoot, Maintenance & safety, Station info, LIVE state) — English ya Hinglish mein.

Engine mein: physical / optical budget, Ethernet, VLAN, RSTP, LACP, IPv4, ARP, ACL, NAT, DHCP, DNS, NTP, syslog / SNMP, SSH, HSRP / VRRP, OSPF, IS-IS, RIP, QoS, MPLS / LDP, LSP ping / trace, BGP + route reflector, VRF / MP-BGP L3VPN, VPWS, VPLS, E1 SAToP / CESoPSN, MPLS QoS (EXP), RSVP-TE + FRR, Segment Routing + TI-LFA, NMS alarms, fault injection, automation. Kya **simulate nahi** hota (jaise BFD, SDH byte-level) — Model Limitations panel mein dekho.

## Windows par zero se chalana

### Step 1 — Node.js install karo (ek baar)
1. <https://nodejs.org> kholo → **LTS** version (22.x ya 20.x) ka **Windows Installer (.msi)** download karo.
2. Installer chalao → Next → Next → Install (default settings theek hain).
3. **Naya** PowerShell kholo (Start → "PowerShell") aur check karo:
   ```powershell
   node -v
   npm -v
   ```
   Dono version number dikhayein (jaise `v22.11.0` aur `10.9.0`) to ready ho.

### Step 2 — Code download karo
**Option A — Git se (recommended, update aasaan):** <https://git-scm.com/download/win> se Git install karo, phir:
```powershell
git clone https://github.com/shreenidhi1/network.git
cd network
git checkout claude/railnet-sim-simulator-le2oq2
```
**Option B — ZIP se:** GitHub par repo kholo → branch **claude/railnet-sim-simulator-le2oq2** chuno → **Code → Download ZIP** → ZIP extract karo → us folder mein PowerShell kholo (folder mein Shift + Right-click → "Open PowerShell window here").

### Step 3 — Install aur run
```powershell
npm install      # pehli baar: ~1–2 minute, internet chahiye
npm run dev      # app chalu
```
Browser mein **<http://localhost:5173>** kholo. Band karne ke liye PowerShell mein **Ctrl + C**.

**Agar error aaye:**
- `npm.ps1 cannot be loaded because running scripts is disabled` → PowerShell mein ek baar chalao: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (ya **Command Prompt** use karo).
- `'node' is not recognized` → Node install ke baad PowerShell band karke **naya** kholo.
- Port 5173 busy → Vite khud doosra port (5174…) le leta hai; jo URL print ho woh kholo.

### Update karna
```powershell
git pull origin claude/railnet-sim-simulator-le2oq2
npm install
npm run dev
```
Phir browser mein **Ctrl + Shift + R** (hard refresh). Status bar ke right corner mein `v1.0.0 · <commit>` se pata chalta hai kaun sa version chal raha hai.

### Localhost par purane items dikh rahe hain?
1. Status bar ka commit GitHub ke latest se purana hai → upar wala "Update karna" karo.
2. Canvas par purana topology = browser ka **autosave** (aapka pichhla kaam). Fresh start: Sandbox → **New**. Lab start karne par bhi canvas lab topology se replace hota hai.
3. Sab reset (progress bhi): pehle Learn → Export se progress save karo, phir browser DevTools → Application → Local Storage → `railnet-sim:autosave` aur `railmpls-lab:*` keys delete karo.

## Commands (npm scripts)

| Command | Kya karta hai |
|---|---|
| `npm run dev` | Dev server (hot reload) — roz ke use ke liye |
| `npm test` | Saare automated tests ek baar (Vitest, 627 tests) |
| `npm run test:watch` | Tests watch mode mein |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check + production build → `dist/` folder (static website) |
| `npm run preview` | `dist/` ko local server par chalao (build check karne ke liye) |
| `npm run report:jodhpur` | Station data se `docs/jodhpur-check-report.md` dobara banao |

## Free mein online deploy (koi server / database nahi chahiye)

`npm run build` ek static website `dist/` mein banata hai (relative paths — kisi bhi sub-folder se chalti hai). Progress aur autosave har user ke apne browser mein rehta hai.

**1. Netlify Drop (sabse aasaan, 2 minute):**
1. `npm run build` chalao.
2. <https://app.netlify.com/drop> kholo (free account banana padega).
3. `dist` folder ko us page par **drag & drop** karo → turant ek public link milta hai (jaise `https://xyz.netlify.app`). Site settings mein naam badal sakte ho.

**2. GitHub Pages (har push par auto-update):** repo mein `.github/workflows/deploy-pages.yml` pehle se hai.
1. GitHub repo → **Settings → Pages → Source: "GitHub Actions"**.
2. **Actions** tab → "Deploy to GitHub Pages" → **Run workflow** (ya branch par push karo).
3. Workflow tests + build chala kar site publish karta hai: `https://shreenidhi1.github.io/network/`.

**3. Cloudflare Pages / Vercel:** repo connect karo → build command `npm run build`, output folder `dist`.

> `dist/index.html` ko seedha double-click karke (file://) mat kholo — browser security module scripts ko block karti hai. `npm run preview` ya upar ka koi hosting use karo.

## Seekhne ka suggested plan (~6–8 hafte, 5–6 ghante / hafta)

| Hafta | Lessons | Labs |
|---|---|---|
| 1 | A0–A5 (network, layers, physical, Ethernet, IP) | L4.1, L5.1 |
| 2 | A6–A9 (VLSM, VLAN, STP, routing) | L6.1–L9.1 |
| 3 | A10–A15 (OSPF / IS-IS, services, security, HSRP, QoS, capstone) | L10.1–L15.1 |
| 4 | B0–B4 (MPLS, LDP, Jodhpur core) | LB1.1–LB4.1 |
| 5 | B5–B8 (BGP, L3VPN, VPWS / VPLS, E1) | LB5.1–LB8.1 |
| 6 | B9–B13 (QoS, TE / FRR, NMS, automation, Inter-AS) | LB9.1–LB13.1 |
| 7–8 | B14–B15 (SR, grand capstone) + revision | LB14.1, LB15.1 (alag-alag seeds se dobara) |

Learn → **Dashboard** hamesha batata hai agla lesson / lab kaun sa hai.

## Commands aur features — quick reference

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
- **BGP / L3VPN (P5)**: `vrf definition UTS` → `rd 10.0.1.1:100` → `address-family ipv4` → `route-target both 65000:100`; on the interface `vrf forwarding UTS` *then* `ip address …` (IOS removes the IP when the VRF changes). `router bgp 65000` → `neighbor 10.0.1.1 remote-as 65000` / `update-source loopback0`; `address-family vpnv4` → `neighbor … activate` (+ `route-reflector-client` on the RR); `address-family ipv4 vrf UTS` → `redistribute connected` or a PE–CE `neighbor … remote-as 65201`. Check with `show ip bgp summary`, `show bgp vpnv4 unicast all [summary|labels]`, `show ip route vrf UTS`, `show vrf`, `ping vrf UTS …`, `traceroute vrf UTS …`. If a session is not Established, the summary prints the reason under the table. Labs: LB5.1 (RR + eBGP to Jaipur division), LB6.1 (UTS/RAILNET VPNs + firewall internet), LB6.2 (SCADA PE–CE eBGP + NMS shared service).
- **L2VPN / TDM (P6)**: VPWS on a PE port: `interface gi0/3/2` → `xconnect 10.0.1.13 1301 encapsulation mpls` (peer = the other PE's loopback, same VC ID both sides; no IP on the port). VPLS: `l2 vfi CCTV manual` → `vpn id 104` → `neighbor <PE loopback> encapsulation mpls` (one per other PE), then `xconnect vfi CCTV` on the port. E1 (logical controllers from the NEON profile): `controller E1 0/2/0` → `cem-group 0 unframed` (SAToP) or `cem-group 0 timeslots 1-4` (CESoPSN) → `interface CEM0/2/0` → `cem 0` → `xconnect <peer> <vc> encapsulation mpls`. Check with `show mpls l2transport vc [detail]` (reason under the table when DOWN), `show vfi`, `show controllers E1 0/2/0`, `ping mpls pseudowire <peer> <vc>`. Labs: LB7.1 (Data Logger VPWS), LB7.2 (CCTV VPLS), LB8.1 (BPAC + control E1).
- **MPLS QoS / TE (P7)**: core classes match labels: `class-map match-any CORE-RT` → `match mpls experimental topmost 5 6`; at the PE `set mpls experimental imposition 6` in an input policy. TE: `mpls traffic-eng tunnels` (global + interfaces), `ip rsvp bandwidth`, under `router ospf`: `mpls traffic-eng router-id loopback0`, `mpls traffic-eng area 0`; `ip explicit-path name X enable` → `next-address` / `exclude-address`; `interface tunnel1` → `ip unnumbered loopback0`, `tunnel mode mpls traffic-eng`, `tunnel destination <tail loopback>`, `tunnel mpls traffic-eng bandwidth <kbps>`, `tunnel mpls traffic-eng path-option 1 explicit name X | dynamic`, `tunnel mpls traffic-eng autoroute announce`, `tunnel mpls traffic-eng fast-reroute`; protect a link with `mpls traffic-eng backup-path tunnel2`. Check with `show mpls traffic-eng tunnels [brief]`, `show mpls traffic-eng fast-reroute database`, `show ip rsvp interface`, `show ip explicit-paths`; after a cut, `mpls traffic-eng reoptimize`. Labs: LB9.1 (EXP + core queues), LB10.1 (TE around a busy span), LB10.2 (FRR fibre-cut drill).
- **Operations (P8)**: put an NMS device on a LAN, set its SNMP polling community and services in its properties; routers become managed with `snmp-server community <same> ro` (plus `snmp-server host`, `snmp-server enable traps`, `logging host`). Bottom dock → **NMS** shows managed / unreachable devices, root-cause vs impact alarms, service status and link load. Device properties → **Fault injection**: power failure, card failure (fibre cuts are on the link). Bottom dock → **Automation**: pick devices, write a template with `{{hostname}}`, `{{loopback}}`, `{{station}}`, `{{router_id}}`, Preview / Push, and check compliance with regex rules. Labs: LB11.1 (NMS drill), LB12.1 (baseline automation + drift), LB13.1 (Option A hand-off at Phulera).
- **Segment Routing / capstone (P9)**: `segment-routing mpls` → `connected-prefix-sid-map` → `address-family ipv4` → `10.0.1.1/32 index 1 range 1` → `exit-address-family`; under `router ospf 1`: `segment-routing mpls`, and for TI-LFA `fast-reroute per-prefix enable prefix-priority low` + `fast-reroute per-prefix ti-lfa`. Labels are 16000 + index; LDP stays preferred until you remove `mpls ip`. Check with `show mpls forwarding-table`, `ping mpls ipv4 <loopback>/32` and the device's LIVE **Segment Routing** panel (SRGB, SIDs, conflicts, TI-LFA repairs). Labs: LB14.1 (LDP → SR migration + TI-LFA), LB15.1 (grand capstone on J2: build the UTS VPN, Data Logger VPWS and NMS baseline on 27 routers, then 10 fault tickets drawn by seed from a catalog of 23 — the lab panel shows the seed; the same seed gives the same tickets).
- **QoS tab** (bottom dock): offered vs delivered rate and loss per traffic flow, and which interface is the bottleneck.
- **Packet Inspector** (Console dock): each probe/ARP exchange as a flow; step hop by hop and see Ethernet / 802.1Q / ARP / IPv4 / ICMP headers and which table decided (MAC table, VLAN, STP, ARP cache, routing table).
- **Realtime vs Simulation mode** (toolbar): Realtime runs commands instantly; Simulation queues events — use Step ⏭ / Play ▶ / speed and watch frames move on the canvas (yellow glow) and in the *Events* tab.
- **Faults**: select a link → *Cut fibre/cable* and *Repair*. Canvas shows `DOWN`, `DOWN (admin)`, `CUT` and `STP BLK` badges.

## Editor tips

- **Device add karo**: left palette se drag karo ya click karo.
- **Cable lagao**: device par hover → blue handle se drag karke doosre device par chhodo. Dialog sirf **physically valid** link aur free ports dikhata hai (Cat6 max 100 m; OFC par optical budget check hota hai).
- **Inspect / edit**: device par click (naam, station code, ports) ya link par click (length, label, cores, optics; *Cut* / *Repair*).
- **Optical budget**: OFC links ka Rx power Tx, fibre dB/km, connectors, splices se nikalta hai (ITU-T G.957 / IEEE 802.3 optic profiles). Fail hone par link laal aur **LOS** badge.
- **Save / Open**: JSON files (`*.railnet.json`). Load par har link phir se validate hota hai. Kaam browser mein autosave bhi hota hai.
- **Networking-only mode**: SDH / STM, PD-Mux, CWDM, E1/G.703 jaise legacy TDM devices palette se chhupe hain (unka code rakha hai); E1 sirf logical controllers ke roop mein circuit emulation ke liye hai.

## Status — saare phases complete

| Phase | Scope | Status |
|---|---|---|
| P1 | Scaffold, canvas, device catalog (basics, NEON, vendor profiles), links, save/load, Model Limitations, device detail panel, Learn framework + A0–A3, Jodhpur station data (M0) | ✅ |
| P2 | Engine core, physical, Ethernet / VLAN / STP, LACP, CLI, consoles, packet walk, Lab mode, A4–A8, Glossary, Command Reference, Ask why | ✅ |
| P3 | OSPF, IS-IS, RIP, DHCP / DNS / NAT / NTP / syslog / SNMP / SSH, ACL, HSRP / VRRP, QoS tab, A9–A15, labs L9.1–L15.1 | ✅ |
| P4 | Jodhpur generators J1–J4 + IP plan, MPLS + LDP, LSP ping / trace, B0–B4, LB1.1–LB4.1 | ✅ |
| P5 | BGP + RR, VRF, MP-BGP L3VPN, B5–B6, LB5.1–LB6.2 | ✅ |
| P6 | VPWS, VPLS, E1 SAToP / CESoPSN, B7–B8, LB7.1–LB8.1 | ✅ |
| P7 | MPLS QoS (EXP), RSVP-TE, CSPF, FRR, B9–B10, LB9.1–LB10.2 | ✅ |
| P8 | NMS + alarms, fault injection, automation, Inter-AS Option A, B11–B13, LB11.1–LB13.1 | ✅ |
| P9 | Segment Routing + TI-LFA, grand capstone with seeded tickets, B14–B15, LB14.1–LB15.1 | ✅ |
| P10 | Progress dashboard, Hinglish README (Windows setup, free deploy, study plan), GitHub Pages workflow, v1.0.0 | ✅ |

## Quality

- **627 automated tests** (Vitest): engine units, CLI parsing aur show output, har lesson ka data, aur **har lab** ke liye: start par saare tasks fail, reference solution se saare pass, har fault check ko todta hai aur uska fix theek karta hai, practical quiz answers engine output se match.
- TypeScript strict mode, Prettier formatting, har phase ke baad asli Chromium mein Playwright browser check.

## Project structure

```
src/
  engine/        protocol engine (pure TypeScript, UI se alag)
    core/        event queue, frame / packet types, MAC
    config/      per-device NetConfig (running-config) + Zod schema
    physical/    optical budget, port / link state, fibre cuts, power / card faults
    ethernet/    STP, EtherChannel, L2 segments
    ip/ ospf/ igp/  IPv4, routing table, OSPF, IS-IS, RIP
    services/ security/ fhrp/  DHCP, DNS, NAT, NTP, syslog, SNMP, SSH, ACL, HSRP / VRRP
    mpls/ bgp/ l2vpn/ te/ sr/  LDP + LFIB, BGP / VRF / VPNv4, pseudowires, RSVP-TE + FRR, Segment Routing
    qos/ nms/ automation/      QoS analysis, NMS alarms + services, templates + compliance
    cli/         IOS-XE-style CLI grammar, show formatting, host prompt
    sim.ts       recompute() control-plane pipeline + discrete-event data plane
  labs/          lab framework (snapshot, checks, seeded tickets) + 31 labs
  lessons/       curriculum, 32 lessons, widget maths, progress + dashboard
  topologies/    lab topologies + Jodhpur generator (J1–J4) + station data
  ui/            React: canvas, panels, console dock, Learn / Lab views
  docs/ equipment/ profiles/ model/ store/ io/
```

## Reference

Context from CAMTECH *An Introductory Handbook on IP-MPLS Technology* (CAMTECH/S/PROJ/2021-22/SP37A). Behaviour follows ITU-T G.707/G.704/G.957/G.694.2, IEEE 802.1Q/802.3 and RFC 3031/3032/5036/4364/4448; where the handbook is imprecise, the standard wins.
