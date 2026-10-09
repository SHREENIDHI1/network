import { useDetail } from '../../store/detailStore';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type FinalConnectionState,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { computeBudget } from '../../engine/physical/opticalBudget';
import { usedPortKeys } from '../../model/linkRules';
import { isDeviceKind } from '../../model/catalog';
import { visibleTopology } from '../../model/networkingMode';
import { useTopologyStore } from '../../store/topologyStore';
import { useSimStore } from '../../store/simStore';
import { portKey } from '../../engine/physical/linkState';
import { DeviceNode, type DeviceFlowNode } from './DeviceNode';
import { LinkEdge, type LinkFlowEdge } from './LinkEdge';

export const DRAG_MIME = 'application/x-railnet-device';

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

export function TopologyCanvas() {
  const topology = useTopologyStore((s) => s.topology);
  // Networking-only mode hides legacy TDM devices/links; they stay in the file.
  const { devices, links } = useMemo(() => visibleTopology(topology), [topology]);
  const selection = useTopologyStore((s) => s.selection);
  const select = useTopologyStore((s) => s.select);
  const addDevice = useTopologyStore((s) => s.addDevice);
  const moveDevice = useTopologyStore((s) => s.moveDevice);
  const removeDevice = useTopologyStore((s) => s.removeDevice);
  const removeLink = useTopologyStore((s) => s.removeLink);
  const requestConnection = useTopologyStore((s) => s.requestConnection);
  const { screenToFlowPosition } = useReactFlow();

  // React Flow keeps measured sizes on its node objects, so nodes live in
  // local state and are re-synced from the store whenever devices change.
  const [nodes, setNodes] = useState<DeviceFlowNode[]>([]);

  useEffect(() => {
    const used = usedPortKeys(links);
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return devices.map((d) => {
        const old = prevById.get(d.id);
        return {
          ...(old ?? {}),
          id: d.id,
          type: 'device' as const,
          position: old?.dragging ? old.position : d.position,
          selected: selection?.type === 'device' && selection.id === d.id,
          data: { device: d, usedPorts: d.ports.filter((p) => used.has(`${d.id}|${p.id}`)).length },
        };
      });
    });
  }, [devices, links, selection]);

  const sim = useSimStore((s) => s.sim);
  const simVersion = useSimStore((s) => s.version);
  const simMode = useSimStore((s) => s.mode);

  const edges = useMemo<LinkFlowEdge[]>(() => {
    const inFlight = simMode === 'simulation' ? sim.linksInFlight() : new Set<string>();
    const groups = new Map<string, string[]>();
    for (const l of links) {
      const key = [l.a.deviceId, l.b.deviceId].sort().join('|');
      groups.set(key, [...(groups.get(key) ?? []), l.id]);
    }
    return links.map((l) => {
      const key = [l.a.deviceId, l.b.deviceId].sort().join('|');
      const group = groups.get(key)!;
      return {
        id: l.id,
        type: 'link' as const,
        source: l.a.deviceId,
        target: l.b.deviceId,
        selected: selection?.type === 'link' && selection.id === l.id,
        data: {
          link: l,
          parallelIndex: group.indexOf(l.id),
          parallelCount: group.length,
          opticalStatus: l.kind === 'ofc' && l.optical ? computeBudget(l.lengthKm, l.optical).status : undefined,
          operUp: sim.phys.links.get(l.id)?.up ?? false,
          downReason: sim.phys.links.get(l.id)?.reason,
          stpBlocked: [portKey(l.a.deviceId, l.a.portId), portKey(l.b.deviceId, l.b.portId)].some((k) => sim.stp.ports.get(k)?.role === 'alternate'),
          inFlight: inFlight.has(l.id),
        },
      };
    });
    // simVersion: engine state changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, selection, sim, simVersion, simMode]);

  const onNodesChange = useCallback((changes: NodeChange<DeviceFlowNode>[]) => {
    // Removal and selection are owned by the store; apply only geometry here.
    const geometry = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (geometry.length) setNodes((ns) => applyNodeChanges(geometry, ns));
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) requestConnection(c.source, c.target);
    },
    [requestConnection],
  );

  // Dropping a connection anywhere on a device body (not only on a handle)
  // should still connect, which is what users of Packet Tracer expect.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode) return;
      const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
      const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node');
      const toId = el?.getAttribute('data-id');
      if (toId && toId !== state.fromNode.id) requestConnection(state.fromNode.id, toId);
    },
    [requestConnection],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const kind = e.dataTransfer.getData(DRAG_MIME);
      if (!kind || !isDeviceKind(kind)) return;
      e.preventDefault();
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addDevice(kind, { x: pos.x - 75, y: pos.y - 30 });
    },
    [addDevice, screenToFlowPosition],
  );

  return (
    <div className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        connectionMode={ConnectionMode.Loose}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, n) => select({ type: 'device', id: n.id })}
        onNodeDoubleClick={(_, n) => {
          const d = useTopologyStore.getState().topology.devices.find((x) => x.id === n.id);
          if (d) useDetail.getState().open({ kind: d.kind, deviceId: d.id });
        }}
        onEdgeClick={(_, e) => select({ type: 'link', id: e.id })}
        onPaneClick={() => select(null)}
        onNodeDragStop={(_, _n, dragged) => dragged.forEach((n) => moveDevice(n.id, n.position))}
        onNodesDelete={(ns) => ns.forEach((n) => removeDevice(n.id))}
        onEdgesDelete={(es) => es.forEach((e) => removeLink(e.id))}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        <Controls position="bottom-left" />
        <MiniMap pannable zoomable nodeColor="#334155" maskColor="rgba(2,6,23,0.7)" />
      </ReactFlow>
    </div>
  );
}
