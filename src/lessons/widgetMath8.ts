import { renderTemplate } from '../engine/automation/automation';

/** Maths behind the P8 (operations / automation) lesson widgets. */

// ------------------------------------------------- B11: alarm layering

export type Failure = 'fibre-cut' | 'card' | 'power' | 'ldp' | 'none';

export interface LayeredAlarm {
  layer: 'root' | 'impact';
  text: string;
}

/**
 * Chain JU – PPR – MTD with a Data Logger VPWS JU ↔ MTD through PPR. Which alarms does an NMS show for a
 * failure at PPR (or on the PPR–JU span)? Root causes are the lowest failed layer; everything above is impact.
 */
export function alarmLayers(f: Failure): LayeredAlarm[] {
  switch (f) {
    case 'none':
      return [];
    case 'fibre-cut':
      return [
        { layer: 'root', text: 'LINK-DOWN JU Te0/0/0 → PPR (fibre cut)' },
        { layer: 'root', text: 'LINK-DOWN PPR Te0/0/0 → JU (fibre cut)' },
        { layer: 'impact', text: 'PW-DOWN Data Logger VC 1301 (no LSP)' },
        { layer: 'impact', text: 'SERVICE-DOWN Data Logger MTD ↔ JU (safety)' },
      ];
    case 'card':
      return [
        { layer: 'root', text: 'CARD-FAIL PPR line card Te0/0/x' },
        { layer: 'root', text: 'LINK-DOWN JU → PPR and MTD → PPR' },
        { layer: 'impact', text: 'PW-DOWN Data Logger VC 1301' },
        { layer: 'impact', text: 'SERVICE-DOWN Data Logger MTD ↔ JU (safety)' },
      ];
    case 'power':
      return [
        { layer: 'root', text: 'NODE-UNREACHABLE / POWER-FAIL PPR' },
        { layer: 'root', text: 'LINK-DOWN JU → PPR and MTD → PPR (peer has no power)' },
        { layer: 'impact', text: 'PW-DOWN Data Logger VC 1301' },
        { layer: 'impact', text: 'SERVICE-DOWN Data Logger MTD ↔ JU (safety)' },
      ];
    case 'ldp':
      return [
        { layer: 'root', text: 'LDP-DOWN JU Te0/0/0: OSPF FULL with PPR but no LDP hello' },
        { layer: 'impact', text: 'PW-DOWN Data Logger VC 1301 (no LSP)' },
        { layer: 'impact', text: 'SERVICE-DOWN Data Logger MTD ↔ JU (safety)' },
      ];
  }
}

// --------------------------------------------------- B12: templates

export const SAMPLE_DEVICES = [
  { hostname: 'JU-LSR', station: 'JU', loopback: '10.0.1.1', router_id: '10.0.1.1' },
  { hostname: 'MTD-LSR', station: 'MTD', loopback: '10.0.1.13', router_id: '10.0.1.13' },
  { hostname: 'DNA-LSR', station: 'DNA', loopback: '10.0.2.6', router_id: '10.0.2.6' },
];

/** Renders a template for the sample devices (the same renderer the Automation tab uses). */
export function renderForSamples(template: string): Array<{ hostname: string; lines: string[]; errors: string[] }> {
  return SAMPLE_DEVICES.map((v) => ({ hostname: v.hostname, ...renderTemplate(template, v) }));
}
