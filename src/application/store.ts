import { create } from 'zustand';
import { CATALOG, inferRelation } from '../domain/catalog';
import { parseOverlaySettings } from '../domain/overlaySettings';
import type { DeploymentPlan } from '../domain/plan';
import type { DeploymentRun, SimulationOptions } from '../domain/simulate';
import type {
  ArchitectureEdge,
  CapabilityKind,
  CapabilityNode,
  ConfigValue,
  GnikProject,
  Overlay,
  OverlayKind,
} from '../domain/types';
import { MockPaaSAdapter } from '../adapters/MockPaaSAdapter';
import { clearLocal, loadLocal, saveLocal } from '../adapters/persistence';
import type { AssistantProposal } from '../adapters/assistant';
import { createStarterProject } from '../fixtures/customerNotifications';
import { resolveProject } from '../domain/resolver';

export type Mode = 'design' | 'overlays' | 'plan';
export type DrawerTab = 'validation' | 'activity' | 'plan';
export type RightPanel = 'inspector' | 'assistant';
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface Snapshot {
  name: string;
  graph: GnikProject['graph'];
  overlays: Overlay[];
}

export interface Selection {
  nodeIds: string[];
  edgeId?: string;
  overlayId?: string;
}

export interface ActivityEntry {
  id: number;
  time: string;
  message: string;
}

interface State {
  project: GnikProject;
  past: Snapshot[];
  future: Snapshot[];
  lastCoalesce?: { key: string; at: number };

  selection: Selection;
  mode: Mode;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  rightPanel: RightPanel;
  paletteOpen: boolean;
  saveStatus: SaveStatus;
  plan: DeploymentPlan | null;
  runs: DeploymentRun[];
  simOptions: SimulationOptions;
  activity: ActivityEntry[];
  notice?: { kind: 'error' | 'info'; text: string };

  setMode(m: Mode): void;
  setDrawer(open: boolean, tab?: DrawerTab): void;
  setRightPanel(p: RightPanel): void;
  setPaletteOpen(open: boolean): void;
  setSimOptions(o: SimulationOptions): void;
  setNotice(n?: State['notice']): void;
  log(message: string): void;

  select(sel: Partial<Selection>): void;
  focusFinding(nodeIds: string[], overlayId?: string): void;

  setProjectName(name: string): void;
  addNode(kind: CapabilityKind, position?: { x: number; y: number }): void;
  beginMove(): void;
  moveNodes(positions: Record<string, { x: number; y: number }>): void;
  updateNode(id: string, patch: { name?: string; description?: string; config?: Record<string, ConfigValue> }): void;
  addEdge(source: string, target: string): boolean;
  updateEdge(id: string, patch: Partial<Pick<ArchitectureEdge, 'relation' | 'description'>>): void;
  deleteSelection(): void;
  duplicateSelection(): void;

  addOverlay(kind: OverlayKind): void;
  updateOverlay(id: string, patch: Partial<Pick<Overlay, 'name' | 'enabled' | 'target' | 'settings'>>): string | undefined;
  deleteOverlay(id: string): void;
  moveOverlay(id: string, dir: -1 | 1): void;

  undo(): void;
  redo(): void;
  replaceProject(p: GnikProject, message: string): void;
  resetDemo(): void;
  applyProposal(p: AssistantProposal): void;

  generatePlan(): Promise<void>;
  runSimulation(): Promise<void>;
  saveNow(): void;
}

const MAX_HISTORY = 100;
let activitySeq = 0;
const uid = () => crypto.randomUUID().slice(0, 8);
const snapshot = (p: GnikProject): Snapshot => ({ name: p.name, graph: p.graph, overlays: p.overlays });
/** Nudges a new node downward until it no longer overlaps an existing node. */
function freePosition(nodes: CapabilityNode[], start: { x: number; y: number }) {
  const p = { ...start };
  while (nodes.some((n) => Math.abs(n.position.x - p.x) < 250 && Math.abs(n.position.y - p.y) < 120)) p.y += 130;
  return p;
}
const now = () => new Date().toISOString();

const initial = loadLocal() ?? createStarterProject();

export const useStore = create<State>((set, get) => {
  /** Applies an immutable edit to the project and records undo history. */
  const commit = (mutate: (p: GnikProject) => GnikProject, coalesceKey?: string) => {
    const s = get();
    const t = Date.now();
    const coalesce = coalesceKey && s.lastCoalesce?.key === coalesceKey && t - s.lastCoalesce.at < 1500;
    const next = { ...mutate(s.project), updatedAt: now() };
    set({
      project: next,
      past: coalesce ? s.past : [...s.past, snapshot(s.project)].slice(-MAX_HISTORY),
      future: [],
      saveStatus: 'unsaved',
      lastCoalesce: coalesceKey ? { key: coalesceKey, at: t } : undefined,
    });
  };

  return {
    project: initial,
    past: [],
    future: [],
    selection: { nodeIds: [] },
    mode: 'design',
    drawerOpen: false,
    drawerTab: 'validation',
    rightPanel: 'inspector',
    paletteOpen: true,
    saveStatus: 'saved',
    plan: null,
    runs: [],
    simOptions: {},
    activity: [],

    setMode: (mode) => set({ mode, selection: { nodeIds: [] }, rightPanel: 'inspector' }),
    setDrawer: (drawerOpen, tab) => set((s) => ({ drawerOpen, drawerTab: tab ?? s.drawerTab })),
    setRightPanel: (rightPanel) => set({ rightPanel }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    setSimOptions: (simOptions) => set({ simOptions }),
    setNotice: (notice) => set({ notice }),
    log: (message) =>
      set((s) => ({ activity: [{ id: ++activitySeq, time: new Date().toLocaleTimeString(), message }, ...s.activity].slice(0, 200) })),

    select: (sel) =>
      set((s) => {
        const any = Boolean(sel.nodeIds?.length || sel.edgeId || sel.overlayId);
        return { selection: { nodeIds: [], ...sel }, rightPanel: any ? 'inspector' : s.rightPanel };
      }),
    focusFinding: (nodeIds, overlayId) => {
      if (overlayId) set({ mode: 'overlays', selection: { nodeIds: [], overlayId }, rightPanel: 'inspector' });
      else if (nodeIds.length) set({ mode: 'design', selection: { nodeIds }, rightPanel: 'inspector' });
    },

    setProjectName: (name) => commit((p) => ({ ...p, name }), 'project-name'),

    addNode: (kind, position) => {
      const s = get();
      const def = CATALOG[kind];
      const count = s.project.graph.nodes.filter((n) => n.kind === kind).length;
      const index = s.project.graph.nodes.length;
      const node: CapabilityNode = {
        id: `n-${kind}-${uid()}`,
        kind,
        name: count === 0 ? def.label : `${def.label} ${count + 1}`,
        position: freePosition(s.project.graph.nodes, position ?? { x: 340 + (index % 3) * 40, y: 520 }),
        config: { ...def.defaults },
      };
      commit((p) => ({ ...p, graph: { ...p.graph, nodes: [...p.graph.nodes, node] } }));
      set({ selection: { nodeIds: [node.id] }, rightPanel: 'inspector' });
      get().log(`Added ${node.name}`);
    },

    beginMove: () => {
      const s = get();
      set({ past: [...s.past, snapshot(s.project)].slice(-MAX_HISTORY), future: [], lastCoalesce: undefined });
    },
    moveNodes: (positions) =>
      set((s) => ({
        project: {
          ...s.project,
          graph: { ...s.project.graph, nodes: s.project.graph.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)) },
        },
        saveStatus: 'unsaved',
      })),

    updateNode: (id, patch) =>
      commit(
        (p) => ({
          ...p,
          graph: {
            ...p.graph,
            nodes: p.graph.nodes.map((n) =>
              n.id === id
                ? { ...n, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}), config: { ...n.config, ...patch.config } }
                : n,
            ),
          },
        }),
        `node-${id}`,
      ),

    addEdge: (source, target) => {
      const { nodes, edges } = get().project.graph;
      const s = nodes.find((n) => n.id === source);
      const t = nodes.find((n) => n.id === target);
      if (!s || !t || source === target) {
        get().setNotice({ kind: 'error', text: 'A capability cannot be connected to itself.' });
        return false;
      }
      const relation = inferRelation(s.kind, t.kind);
      if (edges.some((e) => e.source === source && e.target === target && e.relation === relation)) {
        get().setNotice({ kind: 'info', text: 'That connection already exists.' });
        return false;
      }
      const edge: ArchitectureEdge = { id: `e-${uid()}`, source, target, relation };
      commit((p) => ({ ...p, graph: { ...p.graph, edges: [...p.graph.edges, edge] } }));
      set({ selection: { nodeIds: [], edgeId: edge.id }, rightPanel: 'inspector' });
      get().log(`Connected ${s.name} → ${t.name} (${relation})`);
      return true;
    },
    updateEdge: (id, patch) =>
      commit((p) => ({ ...p, graph: { ...p.graph, edges: p.graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) } }), `edge-${id}`),

    deleteSelection: () => {
      const { selection, project } = get();
      if (selection.overlayId) return;
      const ids = new Set(selection.nodeIds);
      if (!ids.size && !selection.edgeId) return;
      commit((p) => ({
        ...p,
        graph: {
          nodes: p.graph.nodes.filter((n) => !ids.has(n.id)),
          edges: p.graph.edges.filter((e) => e.id !== selection.edgeId && !ids.has(e.source) && !ids.has(e.target)),
        },
      }));
      set({ selection: { nodeIds: [] } });
      get().log(selection.edgeId ? 'Deleted connection' : `Deleted ${ids.size} node(s) from ${project.name}`);
    },

    duplicateSelection: () => {
      const { selection, project } = get();
      const originals = project.graph.nodes.filter((n) => selection.nodeIds.includes(n.id));
      if (!originals.length) return;
      const copies = originals.map((n) => ({
        ...n,
        id: `n-${n.kind}-${uid()}`,
        name: `${n.name} copy`,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        config: { ...n.config },
      }));
      commit((p) => ({ ...p, graph: { ...p.graph, nodes: [...p.graph.nodes, ...copies] } }));
      set({ selection: { nodeIds: copies.map((c) => c.id) } });
      get().log(`Duplicated ${copies.length} node(s)`);
    },

    addOverlay: (kind) => {
      const t = now();
      const overlay: Overlay = {
        id: `ov-${uid()}`,
        name: `New ${kind} overlay`,
        kind,
        enabled: false,
        priority: Math.max(0, ...get().project.overlays.map((o) => o.priority)) + 10,
        target: { mode: 'all' },
        settings: {},
        createdAt: t,
        updatedAt: t,
      };
      commit((p) => ({ ...p, overlays: [...p.overlays, overlay] }));
      set({ selection: { nodeIds: [], overlayId: overlay.id }, rightPanel: 'inspector' });
      get().log(`Added overlay ${overlay.name}`);
    },

    updateOverlay: (id, patch) => {
      const current = get().project.overlays.find((o) => o.id === id);
      if (!current) return undefined;
      if (patch.settings) {
        const parsed = parseOverlaySettings(current.kind, patch.settings);
        if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Invalid settings';
      }
      commit(
        (p) => ({ ...p, overlays: p.overlays.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: now() } : o)) }),
        patch.enabled === undefined ? `overlay-${id}` : undefined,
      );
      if (patch.enabled !== undefined) get().log(`${patch.enabled ? 'Enabled' : 'Disabled'} overlay ${current.name}`);
      return undefined;
    },

    deleteOverlay: (id) => {
      commit((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== id) }));
      set({ selection: { nodeIds: [] } });
      get().log('Deleted overlay');
    },

    moveOverlay: (id, dir) => {
      const sorted = [...get().project.overlays].sort((a, b) => a.priority - b.priority);
      const i = sorted.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      const a = sorted[i];
      const b = sorted[j];
      commit((p) => ({
        ...p,
        overlays: p.overlays.map((o) => (o.id === a.id ? { ...o, priority: b.priority } : o.id === b.id ? { ...o, priority: a.priority } : o)),
      }));
    },

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        project: { ...s.project, ...prev, updatedAt: now() },
        past: s.past.slice(0, -1),
        future: [snapshot(s.project), ...s.future],
        saveStatus: 'unsaved',
        selection: { nodeIds: [] },
        lastCoalesce: undefined,
      });
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        project: { ...s.project, ...next, updatedAt: now() },
        past: [...s.past, snapshot(s.project)],
        future: s.future.slice(1),
        saveStatus: 'unsaved',
        selection: { nodeIds: [] },
        lastCoalesce: undefined,
      });
    },

    replaceProject: (project, message) => {
      set({ project, past: [], future: [], selection: { nodeIds: [] }, plan: null, runs: [], saveStatus: 'unsaved', mode: 'design', lastCoalesce: undefined });
      get().log(message);
    },
    resetDemo: () => {
      clearLocal();
      get().replaceProject(createStarterProject(), 'Reset to the Customer Notifications demo');
    },

    applyProposal: (proposal) => {
      if (proposal.kind === 'graph' && proposal.graph) {
        const graph = proposal.graph;
        commit((p) => ({ ...p, graph: { nodes: graph.nodes.map((n) => ({ ...n, config: { ...n.config } })), edges: graph.edges.map((e) => ({ ...e })) } }));
        set({ selection: { nodeIds: [] } });
      } else if (proposal.kind === 'overlays' && proposal.overlayChanges) {
        const { enable, disable } = proposal.overlayChanges;
        commit((p) => ({
          ...p,
          overlays: p.overlays.map((o) => (enable.includes(o.id) ? { ...o, enabled: true } : disable.includes(o.id) ? { ...o, enabled: false } : o)),
        }));
      } else return;
      get().log(`Applied assistant proposal: ${proposal.title}`);
    },

    generatePlan: async () => {
      const project = get().project;
      const plan = await MockPaaSAdapter.createPlan(project, now());
      set({ plan, mode: 'plan', selection: { nodeIds: [] } });
      get().log(`Generated plan ${plan.id} (${plan.status}, ${plan.summary.logicalResources} resources)`);
    },

    runSimulation: async () => {
      const { plan, project } = get();
      if (!plan || plan.status !== 'ready' || plan.inputFingerprint !== resolveProject(project).fingerprint) return;
      const run = await MockPaaSAdapter.execute!(plan, now(), get().simOptions);
      set((s) => ({ runs: [run, ...s.runs], mode: 'plan' }));
      get().log(`Simulation ${run.status}: ${run.id}`);
    },

    saveNow: () => {
      const ok = saveLocal(get().project);
      set({ saveStatus: ok ? 'saved' : 'error' });
    },
  };
});

let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project || s.saveStatus === 'saved' || s.saveStatus === 'error') return;
  if (s.saveStatus === 'unsaved') {
    useStore.setState({ saveStatus: 'saving' });
    clearTimeout(timer);
    timer = setTimeout(() => useStore.getState().saveNow(), 400);
  }
});
