import { simulatePlan, type DeploymentRun, type SimulationOptions } from '../domain/simulate';
import { buildPlan, type DeploymentPlan } from '../domain/plan';
import { resolveProject } from '../domain/resolver';
import { validateProject } from '../domain/validate';
import { CATALOG } from '../domain/catalog';
import type { GnikProject, ResolvedProject } from '../domain/types';

export interface ImplementationMapping {
  logicalNodeId: string;
  implementation: string;
}

export interface ProviderAdapter {
  id: string;
  displayName: string;
  resolve(input: ResolvedProject): Promise<ImplementationMapping[]>;
  createPlan(project: GnikProject, generatedAt: string): Promise<DeploymentPlan>;
  execute?(plan: DeploymentPlan, startedAt: string, options?: SimulationOptions): Promise<DeploymentRun>;
}

/** Predictable in-memory adapter. Performs no network calls and creates no resources. */
export const MockPaaSAdapter: ProviderAdapter = {
  id: 'mock-paas',
  displayName: 'Mock PaaS (simulation)',
  async resolve(input) {
    return input.effectiveNodes.map((n) => ({ logicalNodeId: n.node.id, implementation: CATALOG[n.node.kind].implementation }));
  },
  async createPlan(project, generatedAt) {
    const resolved = resolveProject(project);
    return buildPlan(project, resolved, validateProject(project, resolved), generatedAt, 'mock-paas');
  },
  async execute(plan, startedAt, options) {
    return simulatePlan(plan, startedAt, options);
  },
};

// Extension point: implement ProviderAdapter for a real provider (e.g. AzurePaaSAdapter).
// The MVP intentionally ships no real provisioning, credentials or cloud SDK calls.
