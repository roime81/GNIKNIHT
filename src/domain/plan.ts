import { CATALOG } from './catalog';
import type { GnikProject, ResolvedProject, ValidationFinding } from './types';
import { hasBlockingFindings } from './validate';

export type PlanAction = 'create' | 'update' | 'replace' | 'delete' | 'no-op';
export type Risk = 'low' | 'medium' | 'high';

export interface PlanItem {
  id: string;
  logicalNodeId: string;
  logicalName: string;
  capabilityKind: string;
  implementation: string;
  action: PlanAction;
  rationale: string;
  affectedOverlayIds: string[];
  affectedOverlayNames: string[];
  risk: Risk;
  estimatedMonthlyCost?: { min: number; max: number; currency: 'USD' };
}

export interface PlanSummary {
  providerProfile: string;
  logicalResources: number;
  counts: Record<PlanAction, number>;
  warnings: number;
  errors: number;
  risk: Risk;
  estimatedMonthlyCost: { min: number; max: number; currency: 'USD' };
}

export interface DeploymentPlan {
  id: string;
  projectId: string;
  generatedAt: string;
  providerAdapterId: string;
  inputFingerprint: string;
  status: 'ready' | 'blocked';
  summary: PlanSummary;
  items: PlanItem[];
  findings: ValidationFinding[];
}

const TIER_FACTOR: Record<string, number> = { small: 1, medium: 2, large: 4, standard: 1, cool: 0.6, archive: 0.3, high: 2 };
const RISK_RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

/** Illustrative, deterministic demo calculation. Not live cloud pricing. */
export function estimateCost(kind: keyof typeof CATALOG, c: Record<string, string | number | boolean>) {
  const def = CATALOG[kind];
  if (def.baseCost === 0) return { min: 0, max: 0, currency: 'USD' as const };
  const tier = TIER_FACTOR[String(c.tier ?? c.throughput ?? 'small')] ?? 1;
  const ha = c.highAvailability === true ? 2 : 1;
  const cpu = typeof c.cpu === 'number' ? c.cpu : 0.5;
  let min = def.baseCost * tier * ha;
  let max = min * 1.3;
  if (typeof c.replicasMin === 'number' && typeof c.replicasMax === 'number') {
    min = def.baseCost * cpu * 2 * Math.max(c.replicasMin, 0.5);
    max = def.baseCost * cpu * 2 * Math.max(c.replicasMax, c.replicasMin) * 0.7;
  }
  if (typeof c.storageGiB === 'number') {
    min += c.storageGiB * 0.1;
    max += c.storageGiB * 0.15;
  }
  return { min: Math.round(min), max: Math.round(Math.max(max, min)), currency: 'USD' as const };
}

export function buildPlan(
  project: GnikProject,
  resolved: ResolvedProject,
  findings: ValidationFinding[],
  generatedAt: string,
  providerAdapterId = 'mock-paas',
): DeploymentPlan {
  const overlayName = new Map(project.overlays.map((o) => [o.id, o.name]));
  const items: PlanItem[] = resolved.effectiveNodes.map((rn) => {
    const def = CATALOG[rn.node.kind];
    const external = rn.node.kind === 'external_system';
    const restricted = rn.config.dataClassification === 'restricted' || rn.config.dataSensitivity === 'restricted';
    let risk: Risk = 'low';
    if (def.dataBearing || rn.overlayIds.length > 0) risk = 'medium';
    if (def.dataBearing && (restricted || rn.config.highAvailability === true)) risk = 'high';
    if (external) risk = 'low';
    const names = rn.overlayIds.map((id) => overlayName.get(id) ?? id);
    return {
      id: `item-${rn.node.id}`,
      logicalNodeId: rn.node.id,
      logicalName: rn.node.name,
      capabilityKind: rn.node.kind,
      implementation: def.implementation,
      action: external ? 'no-op' : 'create',
      rationale: external
        ? 'External dependency is recorded only; nothing is provisioned.'
        : `Map ${def.label.toLowerCase()} to ${def.implementation}${names.length ? `, shaped by ${names.join(', ')}` : ' using base settings'}.`,
      affectedOverlayIds: rn.overlayIds,
      affectedOverlayNames: names,
      risk,
      estimatedMonthlyCost: estimateCost(rn.node.kind, rn.config),
    };
  });

  const counts: Record<PlanAction, number> = { create: 0, update: 0, replace: 0, delete: 0, 'no-op': 0 };
  for (const i of items) counts[i.action]++;
  const cost = items.reduce(
    (a, i) => ({ min: a.min + (i.estimatedMonthlyCost?.min ?? 0), max: a.max + (i.estimatedMonthlyCost?.max ?? 0) }),
    { min: 0, max: 0 },
  );

  const planFindings = [...findings];
  for (const o of project.overlays) {
    const b = o.settings.monthlyBudgetUsd;
    if (o.enabled && o.kind === 'cost' && typeof b === 'number' && b > 0 && cost.max > b) {
      planFindings.push({
        id: `BUDGET_EXCEEDED:${o.id}`, severity: 'warning', code: 'BUDGET_EXCEEDED', overlayId: o.id, nodeIds: [],
        message: `Illustrative maximum ($${cost.max}) exceeds the "${o.name}" ceiling ($${b}).`,
        remediation: 'Lower replica limits or raise the budget.',
      });
    }
  }
  const risk = items.reduce<Risk>((r, i) => (RISK_RANK[i.risk] > RISK_RANK[r] ? i.risk : r), 'low');

  return {
    id: `plan-${resolved.fingerprint}`,
    projectId: project.id,
    generatedAt,
    providerAdapterId,
    inputFingerprint: resolved.fingerprint,
    status: hasBlockingFindings(planFindings) ? 'blocked' : 'ready',
    summary: {
      providerProfile: 'Mock PaaS (simulation)',
      logicalResources: items.length,
      counts,
      warnings: planFindings.filter((f) => f.severity === 'warning').length,
      errors: planFindings.filter((f) => f.severity === 'error').length,
      risk,
      estimatedMonthlyCost: { ...cost, currency: 'USD' },
    },
    items,
    findings: planFindings,
  };
}
