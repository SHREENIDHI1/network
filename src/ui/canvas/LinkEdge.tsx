import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import type { OpticalStatus } from '../../engine/physical/opticalBudget';
import { getLinkKindInfo } from '../../model/linkRules';
import type { Link } from '../../model/types';
import { LINK_STYLES } from '../linkStyle';

export type LinkEdgeData = {
  link: Link;
  /** Position of this link among parallel links between the same two devices. */
  parallelIndex: number;
  parallelCount: number;
  opticalStatus?: OpticalStatus;
};

export type LinkFlowEdge = Edge<LinkEdgeData, 'link'>;

const PARALLEL_GAP = 12;

function centerOf(n: InternalNode) {
  const w = n.measured.width ?? 150;
  const h = n.measured.height ?? 60;
  return { x: n.internals.positionAbsolute.x + w / 2, y: n.internals.positionAbsolute.y + h / 2, w, h };
}

/** Point where the ray from the node centre towards (dx,dy) leaves the node box. */
function boundary(c: { x: number; y: number; w: number; h: number }, dx: number, dy: number) {
  const tx = dx !== 0 ? c.w / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? c.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const STATUS_BADGE: Partial<Record<OpticalStatus, { text: string; cls: string }>> = {
  los: { text: 'LOS', cls: 'bg-red-600 text-white' },
  overload: { text: 'OVERLOAD', cls: 'bg-orange-600 text-white' },
  marginal: { text: 'MARGINAL', cls: 'bg-yellow-500 text-slate-900' },
};

function LinkEdgeImpl({ id, source, target, data, selected }: EdgeProps<LinkFlowEdge>) {
  const sNode = useInternalNode(source);
  const tNode = useInternalNode(target);
  if (!sNode || !tNode || !data) return null;

  const s = centerOf(sNode);
  const t = centerOf(tNode);
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Offset parallel links along the normal of a canonical direction so links
  // drawn A->B and B->A between the same pair still fan out consistently.
  const sign = source < target ? 1 : -1;
  const offset = (data.parallelIndex - (data.parallelCount - 1) / 2) * PARALLEL_GAP * sign;
  const nx = -uy * offset;
  const ny = ux * offset;

  const p1 = boundary(s, ux, uy);
  const p2 = boundary(t, -ux, -uy);
  const x1 = p1.x + nx;
  const y1 = p1.y + ny;
  const x2 = p2.x + nx;
  const y2 = p2.y + ny;
  const path = `M ${x1},${y1} L ${x2},${y2}`;

  const style = LINK_STYLES[data.link.kind];
  const info = getLinkKindInfo(data.link.kind);
  const badge = data.opticalStatus ? STATUS_BADGE[data.opticalStatus] : undefined;
  const lengthText = data.link.kind === 'ofc' ? ` ${data.link.lengthKm} km` : '';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={14}
        style={{
          stroke: badge && data.opticalStatus === 'los' ? '#ef4444' : style.stroke,
          strokeWidth: selected ? style.width + 2 : style.width,
          strokeDasharray: data.opticalStatus === 'los' ? '8 6' : style.dash,
          filter: selected ? 'drop-shadow(0 0 4px #38bdf8)' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute flex items-center gap-1 text-[10px]"
          style={{ transform: `translate(-50%, -50%) translate(${(x1 + x2) / 2}px, ${(y1 + y2) / 2}px)` }}
        >
          <span className="rounded bg-slate-950/90 px-1 font-medium" style={{ color: style.stroke }}>
            {data.link.label ? `${data.link.label} · ` : ''}
            {info.short}
            {lengthText}
          </span>
          {badge && <span className={`rounded px-1 font-bold ${badge.cls}`}>{badge.text}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const LinkEdge = memo(LinkEdgeImpl);
