import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { getTemplate } from '../../model/catalog';
import type { Device } from '../../model/types';
import { CATEGORY_ACCENT, DEVICE_ICONS } from '../icons';

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
      className={`rn-device w-[150px] rounded-lg border bg-slate-900/95 px-2 py-1.5 shadow-lg ${accent}`}
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
          <span className="rounded bg-slate-800 px-1 font-mono text-slate-300">{device.station}</span>
        ) : (
          <span />
        )}
        <span>
          {usedPorts}/{device.ports.length} ports
        </span>
      </div>
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
