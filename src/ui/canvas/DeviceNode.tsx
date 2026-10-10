import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { getTemplate } from '../../model/catalog';
import type { Device } from '../../model/types';
import { boardsOf, type ControlBoard } from '../../topologies/data/jodhpur';
import { CATEGORY_ACCENT, DEVICE_ICONS } from '../icons';

/** Control-board colours (Jodhpur division map legend style). */
const BOARD_BADGE: Record<ControlBoard, string> = {
  North: 'bg-sky-900 text-sky-200',
  Central: 'bg-amber-900 text-amber-200',
  West: 'bg-rose-900 text-rose-200',
  East: 'bg-emerald-900 text-emerald-200',
};

function stationBadge(code: string): { cls: string; title: string } {
  const boards = boardsOf(code);
  if (boards.length === 1) return { cls: BOARD_BADGE[boards[0]], title: `${boards[0]} control board` };
  if (boards.length > 1) return { cls: 'bg-violet-900 text-violet-200', title: `Junction between ${boards.join(' / ')} boards` };
  return { cls: 'bg-slate-800 text-slate-300', title: 'Station' };
}

export type DeviceNodeData = {
  device: Device;
  usedPorts: number;
};

export type DeviceFlowNode = Node<DeviceNodeData, 'device'>;

const HANDLES: Array<{ id: string; pos: Position }> = [
  { id: 't', pos: Position.Top },
  { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom },
  { id: 'l', pos: Position.Left },
];

function DeviceNodeImpl({ data }: NodeProps<DeviceFlowNode>) {
  const { device, usedPorts } = data;
  const t = getTemplate(device.kind);
  const Icon = DEVICE_ICONS[t.icon];
  const accent = CATEGORY_ACCENT[t.category];

  return (
    <div
      className={`rn-device w-[150px] rounded-lg border ${device.fault?.power ? 'opacity-60' : ''} bg-slate-900/95 px-2 py-1.5 shadow-lg ${accent}`}
      title={t.description}
    >
      {HANDLES.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={h.pos} className="rn-handle" />
      ))}
      <div className="flex items-center gap-2">
        <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-100">{device.name}</div>
          <div className="truncate text-[10px] text-slate-400">{t.label}</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        {device.station ? (
          <span className={`rounded px-1 font-mono ${stationBadge(device.station).cls}`} title={stationBadge(device.station).title}>
            {device.station}
          </span>
        ) : (
          <span />
        )}
        {device.fault?.power ? (
          <span className="rounded bg-red-600 px-1 font-bold text-white">POWER OFF</span>
        ) : device.fault?.cards?.length ? (
          <span className="rounded bg-orange-500 px-1 font-bold text-slate-950">CARD FAIL</span>
        ) : (
          <span>
            {usedPorts}/{device.ports.length} ports
          </span>
        )}
      </div>
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
