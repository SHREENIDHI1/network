import { z } from 'zod';
import { isDeviceKind } from '../model/catalog';
import { validateStoredNetConfig } from '../engine/config/netConfig';
import { checkLink, isLinkKind } from '../model/linkRules';
import type { Topology } from '../model/types';

/**
 * Save/load format for RailMPLS Lab topologies.
 * The file is plain JSON with a format tag and schema version so future
 * phases can migrate older files instead of rejecting them.
 */

export const FILE_FORMAT = 'railnet-sim-topology';
export const FILE_VERSION = 1;

const xySchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const portSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['rj45', 'sfp', 'combo', 'stm', 'e1', 'vf2w', 'vf4w', 'cwdm-line', 'cwdm-ch']),
  speedsGbps: z.array(z.number().positive()).optional(),
  stmLevel: z.union([z.literal(1), z.literal(4), z.literal(16)]).optional(),
  vfRole: z.enum(['FXS', 'FXO', 'E&M', '2W', '4W', 'TERM']).optional(),
  lambdaNm: z.number().positive().optional(),
});

const deviceSchema = z.object({
  id: z.string().min(1),
  kind: z.string().refine(isDeviceKind, { message: 'unknown device kind' }),
  name: z.string().min(1).max(64),
  station: z.string().max(16).optional(),
  position: xySchema,
  ports: z.array(portSchema),
  notes: z.string().max(4000).optional(),
  config: z.record(z.unknown()).default({}),
});

const opticalSchema = z.object({
  profile: z.string(),
  wavelengthNm: z.number().positive(),
  lossDbPerKm: z.number().min(0),
  connectors: z.number().int().min(0),
  connectorLossDb: z.number().min(0),
  splices: z.number().int().min(0),
  spliceLossDb: z.number().min(0),
  extraLossDb: z.number().min(0),
  txPowerDbm: z.number(),
  rxSensitivityDbm: z.number(),
  rxOverloadDbm: z.number(),
});

const linkEndSchema = z.object({ deviceId: z.string().min(1), portId: z.string().min(1) });

const linkSchema = z.object({
  id: z.string().min(1),
  kind: z.string().refine(isLinkKind, { message: 'unknown link kind' }),
  a: linkEndSchema,
  b: linkEndSchema,
  lengthKm: z.number().min(0),
  cores: z.union([z.literal(1), z.literal(2)]).optional(),
  optical: opticalSchema.optional(),
  label: z.string().max(200).optional(),
});

const fileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  version: z.number().int(),
  savedAt: z.string().optional(),
  topology: z.object({
    meta: z.object({ name: z.string().min(1).max(200), description: z.string().max(4000).optional() }),
    devices: z.array(deviceSchema),
    links: z.array(linkSchema),
  }),
});

export function serializeTopology(topology: Topology, now: Date = new Date()): string {
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, savedAt: now.toISOString(), topology },
    null,
    2,
  );
}

export type ParseResult = { ok: true; topology: Topology } | { ok: false; errors: string[] };

export function parseTopology(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  if (parsed.data.version > FILE_VERSION) {
    return { ok: false, errors: [`File version ${parsed.data.version} is newer than this app supports (${FILE_VERSION}).`] };
  }

  const topology = parsed.data.topology as Topology;
  const errors: string[] = [];

  const deviceIds = new Set<string>();
  for (const d of topology.devices) {
    if (deviceIds.has(d.id)) errors.push(`Duplicate device id ${d.id}`);
    deviceIds.add(d.id);
    errors.push(...validateStoredNetConfig(d as Topology['devices'][number]));
    const portIds = new Set<string>();
    for (const p of d.ports) {
      if (portIds.has(p.id)) errors.push(`Duplicate port ${p.id} on ${d.name}`);
      portIds.add(p.id);
    }
  }

  // Re-validate every link against physical rules, in file order, so a
  // hand-edited file cannot sneak in an impossible or double-booked link.
  const accepted: Topology['links'] = [];
  const linkIds = new Set<string>();
  for (const l of topology.links) {
    if (linkIds.has(l.id)) {
      errors.push(`Duplicate link id ${l.id}`);
      continue;
    }
    linkIds.add(l.id);
    const res = checkLink(l, topology.devices, accepted);
    if (!res.ok) errors.push(`Link ${l.id}: ${res.reason}`);
    else accepted.push(l);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, topology };
}
