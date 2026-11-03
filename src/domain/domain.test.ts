import { describe, expect, it } from 'vitest';
import { createStarterProject } from '../fixtures/customerNotifications';
import { resolveProject } from './resolver';
import { validateProject } from './validate';
import { buildPlan } from './plan';
import { simulatePlan } from './simulate';
import { parseProject, serializeProject } from '../adapters/persistence';
import type { GnikProject } from './types';

const enable = (p: GnikProject, ...ids: string[]): GnikProject => ({
  ...p,
  overlays: p.overlays.map((o) => ({ ...o, enabled: ids.includes(o.id) })),
});
const run = (p: GnikProject) => {
  const r = resolveProject(p);
  return { r, f: validateProject(p, r) };
};

describe('resolver', () => {
  it('applies overlays with provenance and never mutates the base graph', () => {
    const base = enable(createStarterProject(), 'ov-production');
    const before = JSON.stringify(base.graph);
    const { r } = run(base);
    const api = r.effectiveNodes.find((n) => n.node.id === 'n-api')!;
    expect(api.config.replicasMin).toBe(2);
    expect(api.config.replicasMax).toBe(8);
    expect(api.provenance.replicasMin).toMatchObject({ source: 'overlay', id: 'ov-production' });
    expect(api.provenance.cpu.source).toBe('base');
    expect(api.provenance.region.source).toBe('platform');
    expect(JSON.stringify(base.graph)).toBe(before);
    expect(base.graph.nodes.find((n) => n.id === 'n-api')!.config.replicasMin).toBe(1);
  });

  it('is deterministic', () => {
    const p = enable(createStarterProject(), 'ov-production', 'ov-restricted');
    expect(JSON.stringify(resolveProject(p))).toBe(JSON.stringify(resolveProject(p)));
  });

  it('merges compatible overlays', () => {
    const { r } = run(enable(createStarterProject(), 'ov-production', 'ov-restricted'));
    const db = r.effectiveNodes.find((n) => n.node.id === 'n-db')!;
    expect(db.config).toMatchObject({ highAvailability: true, networkExposure: 'private', dataClassification: 'restricted' });
    expect(r.conflicts).toHaveLength(0);
  });

  it('reports conflicts instead of picking a winner', () => {
    const { r } = run(enable(createStarterProject(), 'ov-development', 'ov-production'));
    expect(r.conflicts.length).toBeGreaterThan(0);
    const api = r.effectiveNodes.find((n) => n.node.id === 'n-api')!;
    expect(api.config.replicasMin).toBe(1);
  });

  it('allows an explicit override with a reason', () => {
    const p = enable(createStarterProject(), 'ov-development', 'ov-production');
    p.overlays = p.overlays.map((o) => (o.id === 'ov-production' ? { ...o, settings: { ...o.settings, override: true } } : o));
    const { r } = run(p);
    expect(r.conflicts).toHaveLength(0);
    expect(r.effectiveNodes.find((n) => n.node.id === 'n-api')!.config.replicasMin).toBe(2);
  });

  it('fingerprint changes with graph/overlay inputs but not positions', () => {
    const p = createStarterProject();
    const f0 = resolveProject(p).fingerprint;
    const moved = { ...p, graph: { ...p.graph, nodes: p.graph.nodes.map((n) => ({ ...n, position: { x: 1, y: 1 } })) } };
    expect(resolveProject(moved).fingerprint).toBe(f0);
    expect(resolveProject(enable(p, 'ov-development', 'ov-budget')).fingerprint).not.toBe(f0);
  });
});

describe('validation', () => {
  it('passes the starter project', () => {
    expect(run(createStarterProject()).f.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('flags conflicting overlays as errors', () => {
    expect(run(enable(createStarterProject(), 'ov-development', 'ov-production')).f.some((x) => x.code === 'OVERLAY_CONFLICT')).toBe(true);
  });

  it('requires a supported tier for HA in production', () => {
    const { f } = run(enable(createStarterProject(), 'ov-production'));
    expect(f.some((x) => x.code === 'HA_UNSUPPORTED')).toBe(true);
    const p = enable(createStarterProject(), 'ov-production');
    p.graph.nodes = p.graph.nodes.map((n) => (n.id === 'n-db' ? { ...n, config: { ...n.config, tier: 'medium' } } : n));
    expect(run(p).f.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('flags invalid edges, self-links and bad ranges', () => {
    const p = enable(createStarterProject());
    p.graph.edges = [
      { id: 'x1', source: 'n-db', target: 'n-api', relation: 'publishes' },
      { id: 'x2', source: 'n-api', target: 'n-api', relation: 'request' },
      { id: 'x3', source: 'n-api', target: 'n-db', relation: 'calls_model' },
    ];
    p.graph.nodes = p.graph.nodes.map((n) => (n.id === 'n-api' ? { ...n, config: { ...n.config, replicasMin: 5, replicasMax: 2 } } : n));
    const codes = run(p).f.map((x) => x.code);
    expect(codes).toContain('EDGE_INVALID_RELATION');
    expect(codes).toContain('EDGE_SELF_LINK');
    expect(codes).toContain('REPLICAS_RANGE');
  });

  it('flags restricted data with public exposure and non-positive budgets', () => {
    const p = enable(createStarterProject(), 'ov-restricted', 'ov-budget');
    p.graph.nodes = p.graph.nodes.map((n) => (n.id === 'n-model' ? { ...n, config: { ...n.config, privateEndpoint: false } } : n));
    p.overlays = p.overlays.map((o) => (o.id === 'ov-budget' ? { ...o, settings: { ...o.settings, monthlyBudgetUsd: 0 } } : o));
    const codes = run(p).f.map((x) => x.code);
    expect(codes).toContain('BUDGET_NOT_POSITIVE');
  });

  it('warns on stale overlay targets', () => {
    const p = createStarterProject();
    p.overlays = p.overlays.map((o) => (o.id === 'ov-development' ? { ...o, target: { mode: 'nodeIds' as const, nodeIds: ['ghost'] } } : o));
    expect(run(p).f.some((x) => x.code === 'OVERLAY_STALE_TARGET')).toBe(true);
  });
});

describe('planning and simulation', () => {
  const plan = (p: GnikProject) => {
    const { r, f } = run(p);
    return buildPlan(p, r, f, '2025-01-01T00:00:00.000Z');
  };

  it('is deterministic and ready for the starter project', () => {
    const a = plan(createStarterProject());
    expect(a.status).toBe('ready');
    expect(a.items).toHaveLength(6);
    expect(JSON.stringify(a)).toBe(JSON.stringify(plan(createStarterProject())));
    expect(a.summary.estimatedMonthlyCost.max).toBeGreaterThan(a.summary.estimatedMonthlyCost.min);
  });

  it('is blocked by errors and cannot be simulated', () => {
    const blocked = plan(enable(createStarterProject(), 'ov-development', 'ov-production'));
    expect(blocked.status).toBe('blocked');
    expect(() => simulatePlan(blocked, 't')).toThrow();
  });

  it('simulates success and injected failure', () => {
    const ok = simulatePlan(plan(createStarterProject()), 't');
    expect(ok.status).toBe('succeeded');
    expect(ok.events.at(-1)?.message).toBe('Simulation completed.');
    const bad = simulatePlan(plan(createStarterProject()), 't', { failAt: 'provisioning' });
    expect(bad.status).toBe('failed');
    expect(bad.events.some((e) => e.level === 'error')).toBe(true);
  });
});

describe('import/export', () => {
  it('round-trips', () => {
    const p = createStarterProject();
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.project).toEqual(p);
  });
  it('rejects invalid input without throwing', () => {
    expect(parseProject('{nope').ok).toBe(false);
    expect(parseProject('{"schemaVersion":2}').ok).toBe(false);
  });
});
