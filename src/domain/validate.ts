import { CATALOG, relationProblem } from './catalog';
import { overlayTargets } from './resolver';
import { parseOverlaySettings } from './overlaySettings';
import type { GnikProject, Overlay, ResolvedProject, ValidationFinding } from './types';

export function isProductionActive(overlays: Overlay[]): boolean {
  return overlays.some((o) => o.enabled && o.kind === 'environment' && /production/i.test(o.name));
}

export function supportsHighAvailability(tier: unknown): boolean {
  return tier === 'medium' || tier === 'large';
}

export function hasBlockingFindings(findings: ValidationFinding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}

/** MVP architecture checks. Not a complete security assessment. */
export function validateProject(project: GnikProject, resolved: ResolvedProject): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const add = (f: Omit<ValidationFinding, 'id'> & { idSuffix?: string }) => {
    const { idSuffix, ...rest } = f;
    out.push({ ...rest, id: `${f.code}:${idSuffix ?? f.nodeIds.join(',')}${f.overlayId ? ':' + f.overlayId : ''}` });
  };
  const nodes = new Map(project.graph.nodes.map((n) => [n.id, n]));
  const prod = isProductionActive(project.overlays);

  for (const e of project.graph.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t) {
      add({ severity: 'error', code: 'EDGE_DANGLING', message: `Connection ${e.id} refers to a node that no longer exists.`, nodeIds: [], idSuffix: e.id });
      continue;
    }
    if (e.source === e.target) {
      add({ severity: 'error', code: 'EDGE_SELF_LINK', message: `${s.name} is connected to itself.`, nodeIds: [s.id], idSuffix: e.id, remediation: 'Delete the self-link.' });
      continue;
    }
    const problem = relationProblem(e.relation, s.kind, t.kind);
    if (problem) {
      add({
        severity: 'error', code: 'EDGE_INVALID_RELATION',
        message: `${s.name} → ${t.name} (${e.relation}): ${problem}`,
        nodeIds: [s.id, t.id], idSuffix: e.id,
        remediation: 'Change the relationship type in the inspector or delete the connection.',
      });
    }
  }

  for (const rn of resolved.effectiveNodes) {
    const { node, config: c } = rn;
    const def = CATALOG[node.kind];
    const num = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : undefined);

    for (const f of def.fields) {
      if (f.type !== 'number') continue;
      const v = num(f.key);
      if (v === undefined || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) {
        add({
          severity: 'error', code: 'VALUE_OUT_OF_RANGE',
          message: `${node.name}: ${f.label} must be between ${f.min} and ${f.max}.`,
          nodeIds: [node.id], idSuffix: `${node.id}:${f.key}`,
        });
      }
    }
    const min = num('replicasMin');
    const max = num('replicasMax');
    if (min !== undefined && max !== undefined && min > max) {
      add({ severity: 'error', code: 'REPLICAS_RANGE', message: `${node.name}: min replicas (${min}) exceeds max replicas (${max}).`, nodeIds: [node.id], remediation: 'Lower min or raise max.' });
    }

    const restricted = c.dataClassification === 'restricted' || c.dataSensitivity === 'restricted';
    if (def.dataBearing && restricted && (c.networkExposure === 'public' || c.publicAccess === true)) {
      add({ severity: 'error', code: 'RESTRICTED_PUBLIC', message: `${node.name} handles restricted data but is publicly exposed.`, nodeIds: [node.id], remediation: 'Use private networking and disable public access.' });
    }
    if (restricted && c.ingress === 'public' && !project.graph.nodes.some((n) => n.kind === 'api_gateway')) {
      add({ severity: 'error', code: 'RESTRICTED_PUBLIC_INGRESS', message: `${node.name} is restricted but has public ingress without an API gateway boundary.`, nodeIds: [node.id], remediation: 'Set ingress to internal or add an API gateway.' });
    }
    if (node.kind === 'model_endpoint' && c.dataSensitivity === 'restricted' && (c.privateEndpoint !== true || c.provider !== 'mock-paas')) {
      add({ severity: 'error', code: 'MODEL_RESTRICTED_PRIVATE', message: `${node.name} handles restricted data and requires a private endpoint on an approved provider profile.`, nodeIds: [node.id], remediation: 'Enable the private endpoint and use the mock-paas provider.' });
    }

    if (prod) {
      if (def.stateless && min !== undefined && min < 2 && c.productionExempt !== true) {
        add({ severity: 'error', code: 'PROD_REPLICAS', message: `${node.name}: Production requires at least 2 replicas (currently ${min}).`, nodeIds: [node.id], remediation: 'Raise min replicas to 2 or more.' });
      }
      if (node.kind === 'postgres') {
        if (c.backup !== true) add({ severity: 'error', code: 'PROD_DB_BACKUP', message: `${node.name}: production databases must have backups enabled.`, nodeIds: [node.id], remediation: 'Enable backups.' });
      }
    }
    if (node.kind === 'postgres' && c.highAvailability === true && !supportsHighAvailability(c.tier)) {
      add({ severity: 'error', code: 'HA_UNSUPPORTED', message: `${node.name}: high availability is not supported on the "${String(c.tier)}" tier by the selected implementation.`, nodeIds: [node.id], remediation: 'Change the tier to medium or large, or disable high availability.' });
    }
  }

  for (const o of project.overlays) {
    if (!o.enabled) continue;
    const parsed = parseOverlaySettings(o.kind, o.settings);
    if (!parsed.success) {
      add({ severity: 'error', code: 'OVERLAY_SETTINGS_INVALID', message: `Overlay "${o.name}" has invalid settings.`, nodeIds: [], overlayId: o.id });
    }
    if (o.kind === 'cost' && typeof o.settings.monthlyBudgetUsd === 'number' && o.settings.monthlyBudgetUsd <= 0) {
      add({ severity: 'error', code: 'BUDGET_NOT_POSITIVE', message: `Overlay "${o.name}": the budget ceiling must be greater than zero.`, nodeIds: [], overlayId: o.id });
    }
    if (o.target.mode === 'nodeIds') {
      const missing = o.target.nodeIds.filter((id) => !nodes.has(id));
      if (missing.length) {
        add({ severity: 'warning', code: 'OVERLAY_STALE_TARGET', message: `Overlay "${o.name}" targets ${missing.length} node(s) that no longer exist.`, nodeIds: [], overlayId: o.id, remediation: 'Edit the overlay targets.' });
      }
    } else if (!project.graph.nodes.some((n) => overlayTargets(o, n))) {
      add({ severity: 'info', code: 'OVERLAY_NO_TARGETS', message: `Overlay "${o.name}" currently matches no nodes.`, nodeIds: [], overlayId: o.id });
    }
  }

  for (const c of resolved.conflicts) {
    add({
      severity: 'error', code: 'OVERLAY_CONFLICT', message: c.message, nodeIds: [c.nodeId], overlayId: c.overlayIds[0],
      idSuffix: `${c.nodeId}:${c.key}`,
      remediation: 'Disable one of the conflicting overlays, or set override with a reason on the higher-priority overlay.',
    });
  }
  out.push(...resolved.policyFindings);

  return out.sort((a, b) => rank(a.severity) - rank(b.severity) || (a.id < b.id ? -1 : 1));
}

function rank(s: ValidationFinding['severity']): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2;
}
