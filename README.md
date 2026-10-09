# RailNet Sim

An educational, browser-based network simulator for **Indian Railways S&T telecom**: legacy PD-Mux and SDH/STM networks, station LANs, IP routing and IP-MPLS, including SDH → IP-MPLS migration. Think of it as Cisco Packet Tracer for railway telecom.

> RailNet Sim is a teaching tool, not a carrier-grade emulator. Every simplification is listed in the in-app **Model Limitations** panel.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold, canvas, device palette, links, save/load JSON, Model Limitations panel | ✅ Done |
| 2 | Engine core (event loop, step/play), Physical, Ethernet/VLAN, IP/ping, CLI basics, packet inspector | Planned |
| 3 | OSPF, DHCP, NAT, ACL, QoS | Planned |
| 4 | PD-Mux + E1 + SDH (mapping view, cross-connects, alarms, ring protection) | Planned |
| 5 | MPLS (LDP, LFIB, PHP), L3VPN, L2VPN/pseudowire, TE/FRR | Planned |
| 6 | Fault injection, NMS dashboard, migration mode | Planned |
| 7 | Labs mode with auto-checkers, preloaded topologies | Planned |

## Run it on Windows (first time)

1. **Install Node.js LTS** (version 20 or 22) from <https://nodejs.org> and keep the default options.
   Or, in PowerShell: `winget install OpenJS.NodeJS.LTS`
2. Close and reopen PowerShell, then check: `node -v` and `npm -v`.
3. Get the code (install Git from <https://git-scm.com> if you don't have it):
   ```powershell
   git clone https://github.com/shreenidhi1/network.git
   cd network
   git checkout claude/railnet-sim-simulator-le2oq2
   ```
4. Install dependencies and start:
   ```powershell
   npm install
   npm run dev
   ```
5. Open the URL it prints (usually <http://localhost:5173>).

macOS/Linux: same commands from step 3.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm test` | Run all unit tests once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check + production build into `dist/` (works fully offline) |
| `npm run preview` | Serve the production build |

## Using the editor (Phase 1)

- **Add devices**: drag from the left palette (Legacy / LAN-IP / IP-MPLS), or click a palette item.
- **Connect**: hover a device, drag from a blue handle and drop on another device. A dialog offers only *physically valid* link types and free port pairs, for example:
  - STM-1 aggregate ↔ STM-1 only (STM-1 ↔ STM-4 is refused: rate mismatch)
  - PD-Mux FXS ↔ phone, PD-Mux FXO ↔ exchange subscriber (FXS), E&M ↔ E&M
  - CWDM lambda: coloured STM/SFP optic ↔ CWDM channel port; OFC between CWDM LINE ports
  - Cat6 limited to 100 m
- **Inspect / edit**: click a device (name, station code, ports and what they connect to) or a link (length, label, cores, optics).
- **Optical budget**: OFC links compute Rx power from Tx, fibre dB/km, connectors, splices and extra (CWDM) loss using ITU-T G.957 / IEEE 802.3 optic profiles. Failing links turn red with an **LOS** badge.
- **Save / Open**: JSON files (`*.railnet.json`). Loading re-validates every link against the physical rules. Work is also autosaved in the browser.
- **Load demo**: a two-station STM-1 + PD-Mux + LAN example.

## Project structure

```
src/
  model/          domain types, device catalog, link rules, pure topology ops, limitations register
  engine/         simulation engine (pure TypeScript, no UI imports)
    physical/     optical power budget (Phase 1); link state, fibre cuts (Phase 2)
  io/             save/load JSON with schema validation
  store/          Zustand store
  ui/             React components (canvas, palette, properties, dialogs)
  topologies/     topology builder + demo / preloaded topologies
  labs/           Labs mode (Phase 7)
```

Engine modules for `pdh`, `sdh`, `ethernet`, `ip`, `ospf`, `mpls`, `bgp` and `qos` are added under `src/engine/` in their phases.

## Reference

Context from CAMTECH *An Introductory Handbook on IP-MPLS Technology* (CAMTECH/S/PROJ/2021-22/SP37A). Behaviour follows ITU-T G.707/G.704/G.957/G.694.2, IEEE 802.1Q/802.3 and RFC 3031/3032/5036/4364/4448; where the handbook is imprecise, the standard wins.
