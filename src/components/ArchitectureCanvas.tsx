import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type NodeChange,
} from '@xyflow/react';
import { useStore } from '../application/store';
import { useDerived } from '../application/derived';
import { CATALOG } from '../domain/catalog';
import { CAPABILITY_KINDS, type CapabilityKind } from '../domain/types';
import { CapabilityNodeView, type CapabilityFlowNode } from './CapabilityNodeView';
import { CATEGORY_COLOR } from './icons';

const nodeTypes = { capability: CapabilityNodeView };
export const DRAG_MIME = 'application/gnikniht-kind';

/** Lets the palette add a node at the centre of the visible canvas. */
export const canvasApi: { center?: () => { x: number; y: number } } = {};

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function Canvas() {
  const { project, resolved, findings } = useDerived();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    canvasApi.center = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      const p = screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 });
      return { x: p.x - 115, y: p.y - 50 };
    };
    return () => { canvasApi.center = undefined; };
  }, [screenToFlowPosition]);

  const overlayName = useMemo(() => new Map(project.overlays.map((o) => [o.id, o.name])), [project.overlays]);

  const nodes: CapabilityFlowNode[] = useMemo(() => {
    const worst = new Map<string, 'warning' | 'error'>();
    for (const f of findings) for (const id of f.nodeIds) if (f.severity === 'error' || (f.severity === 'warning' && !worst.has(id))) worst.set(id, f.severity === 'error' ? 'error' : 'warning');
    const eff = new Map(resolved.effectiveNodes.map((n) => [n.node.id, n]));
    return project.graph.nodes.map((n) => ({
      id: n.id,
      type: 'capability' as const,
      position: n.position,
      selected: selection.nodeIds.includes(n.id),
      measured: dims[n.id],
      data: {
        kind: n.kind,
        name: n.name,
        config: eff.get(n.id)?.config ?? n.config,
        status: worst.get(n.id) ?? 'valid',
        overlayNames: (eff.get(n.id)?.overlayIds ?? []).map((id) => overlayName.get(id) ?? id),
      },
    }));
  }, [project.graph.nodes, resolved, findings, selection.nodeIds, overlayName, dims]);

  const edges: Edge[] = useMemo(() => {
    const byId = new Map(project.graph.nodes.map((n) => [n.id, n]));
    const invalid = new Set(findings.filter((f) => f.code.startsWith('EDGE_')).flatMap((f) => (f.id.split(':')[1] ? [f.id.split(':')[1]] : [])));
    return project.graph.edges.flatMap((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) return [];
      const forward = s.position.x <= t.position.x;
      const bad = invalid.has(e.id);
      const color = bad ? '#DC2626' : CATEGORY_COLOR[CATALOG[s.kind].category];
      return [{
        id: e.id, source: e.source, target: e.target,
        sourceHandle: forward ? 'r' : 'l', targetHandle: forward ? 'l' : 'r',
        type: 'default', label: e.relation, selected: selection.edgeId === e.id,
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { stroke: color, strokeWidth: 1.75, strokeDasharray: bad ? '6 4' : undefined },
        labelStyle: { fontSize: 11, fontWeight: 600, fill: bad ? '#DC2626' : '#475569' },
        labelBgStyle: { fill: '#fff' }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 6,
      }];
    });
  }, [project.graph, findings, selection.edgeId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    let selected: Set<string> | undefined;
    for (const c of changes) {
      if (c.type === 'position' && c.position) positions[c.id] = c.position;
      if (c.type === 'dimensions' && c.dimensions) {
        const { width, height } = c.dimensions;
        setDims((d) => (d[c.id]?.width === width && d[c.id]?.height === height ? d : { ...d, [c.id]: { width, height } }));
      }
      if (c.type === 'select') {
        selected ??= new Set(useStore.getState().selection.nodeIds);
        if (c.selected) selected.add(c.id);
        else selected.delete(c.id);
      }
    }
    const st = useStore.getState();
    if (Object.keys(positions).length) st.moveNodes(positions);
    if (selected) {
      const ids = [...selected];
      if (!sameIds(ids, st.selection.nodeIds)) st.select({ nodeIds: ids });
    }
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData(DRAG_MIME) as CapabilityKind;
    if (!(CAPABILITY_KINDS as readonly string[]).includes(kind)) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    useStore.getState().addNode(kind, { x: p.x - 115, y: p.y - 40 });
  };

  return (
    <div className="canvas-wrap" ref={wrapRef} data-testid="canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}>
      <div className="canvas-badge">{mode === 'overlays' ? 'Base architecture · overlay impact shown on nodes' : 'Base architecture'}</div>
      {project.graph.nodes.length === 0 && (
        <div className="canvas-empty"><strong>Empty canvas</strong><span>Click or drag a capability from the palette, or ask the assistant for a starter graph.</span></div>
      )}
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgeClick={(_, e) => useStore.getState().select({ edgeId: e.id })}
        onPaneClick={() => useStore.getState().select({})}
        onNodeDragStart={() => useStore.getState().beginMove()}
        onConnect={(c) => c.source && c.target && useStore.getState().addEdge(c.source, c.target)}
        isValidConnection={(c) => c.source !== c.target}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        fitView fitViewOptions={{ padding: 0.08 }} minZoom={0.2} maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#DCE3ED" />
        <Controls showInteractive={false} onFitView={() => fitView({ padding: 0.08 })} />
        <MiniMap pannable zoomable className="minimap" nodeColor={(n) => CATEGORY_COLOR[CATALOG[(n.data as { kind: CapabilityKind }).kind].category]} />
      </ReactFlow>
    </div>
  );
}

export function ArchitectureCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
