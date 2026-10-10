/** Maths behind the P5 (BGP / L3VPN) lesson widgets. */

// ------------------------------------------------ B5: iBGP full mesh vs RR

/** iBGP sessions needed: full mesh of n speakers, or k route reflectors (meshed among themselves) with every other router a client of each RR. */
export function ibgpSessions(n: number, rrs: number): { fullMesh: number; withRr: number; perClient: number } | string {
  if (!Number.isInteger(n) || n < 2) return 'Need at least 2 BGP routers.';
  if (!Number.isInteger(rrs) || rrs < 1 || rrs >= n) return 'Route reflectors must be 1 … (routers − 1).';
  return { fullMesh: (n * (n - 1)) / 2, withRr: (rrs * (rrs - 1)) / 2 + rrs * (n - rrs), perClient: rrs };
}

// --------------------------------------------------- B6: RT import matcher

export interface VrfRts {
  pe: string;
  vrf: string;
  exports: string[];
  imports: string[];
}

const RT = /^\d{1,10}:\d{1,10}$/;

/** Which VRF's routes land in which VRF (on other PEs): a route is imported when any of its export RTs is in the importer's import list. */
export function rtImports(vrfs: VrfRts[]): Array<{ from: string; into: string; via: string[] }> | string {
  for (const v of vrfs) for (const r of [...v.exports, ...v.imports]) if (!RT.test(r)) return `"${r}" is not an RT (use ASN:NN, e.g. 65000:105).`;
  const out: Array<{ from: string; into: string; via: string[] }> = [];
  for (const a of vrfs)
    for (const b of vrfs) {
      if (a.pe === b.pe) continue; // same-PE leaking is not modelled here
      const via = a.exports.filter((r) => b.imports.includes(r));
      if (via.length) out.push({ from: `${a.pe}:${a.vrf}`, into: `${b.pe}:${b.vrf}`, via });
    }
  return out;
}
