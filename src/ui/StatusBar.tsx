import { APP_COMMIT, APP_VERSION } from '../buildInfo';
import { computeBudget } from '../engine/physical/opticalBudget';
import { ENABLE_LEGACY_TDM } from '../config/features';
import { visibleTopology } from '../model/networkingMode';
import { useTopologyStore } from '../store/topologyStore';

export function StatusBar() {
  const topology = useTopologyStore((s) => s.topology);
  const shown = visibleTopology(topology);
  let los = 0;
  let marginal = 0;
  for (const l of shown.links) {
    if (l.kind !== 'ofc' || !l.optical) continue;
    const st = computeBudget(l.lengthKm, l.optical).status;
    if (st === 'los' || st === 'overload') los += 1;
    else if (st === 'marginal') marginal += 1;
  }
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-950 px-3 text-xs text-slate-400">
      <span>{shown.devices.length} devices</span>
      <span>{shown.links.length} links</span>
      {(shown.hiddenDevices > 0 || shown.hiddenLinks > 0) && (
        <span className="text-slate-500" title="Legacy TDM items are kept in the file but hidden in networking-only mode.">
          {shown.hiddenDevices} legacy device(s), {shown.hiddenLinks} link(s) hidden
        </span>
      )}
      {los > 0 && <span className="text-red-400">{los} optical link(s) failing budget</span>}
      {marginal > 0 && <span className="text-yellow-300">{marginal} marginal optical link(s)</span>}
      <span className="ml-auto">
        {ENABLE_LEGACY_TDM ? 'Full mode' : 'Networking-only mode'} · Engine: Ethernet, VLAN, RSTP, IPv4, OSPF, IS-IS, RIP, DHCP, DNS, NAT, NTP,
        Syslog/SNMP, SSH, ACL, HSRP/VRRP, QoS, MPLS/LDP · Console = CLI + Packet Inspector
      </span>
      <span className="text-slate-500" title="Build stamp: if this commit is older than the latest on GitHub, run git pull and restart npm run dev.">
        v{APP_VERSION} · {APP_COMMIT}
      </span>
    </footer>
  );
}
