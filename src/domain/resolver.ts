import { patchOf, UNIVERSAL_KEYS } from './overlaySettings';
import type {
  ArchitectureGraph,
  CapabilityNode,
  ConfigValue,
  GnikProject,
  NodeConfig,
  Overlay,
  Provenance,
  ResolutionConflict,
  ResolvedChange,
  ResolvedNode,
  ResolvedProject,
  ValidationFinding,
} from './types';
import { CATALOG } from './catalog';

export const CATALOG_VERSION = 'catalog-1';
export const POLICY_VERSION = 'policy-1';

export const PLATFORM_DEFAULTS: NodeConfig = { region: 'region-a', provider: 'mock-paas' };
export const POLICY_ENFORCED: NodeConfig = { minTlsVersion: '1.2' };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** cyrb53 string hash, rendered as hex. Stable across runs. */
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Hash of everything that affects the plan. Node positions and disabled overlays are excluded. */
export function computeFingerprint(graph: ArchitectureGraph, overlays: Overlay[]): string {
  const input = {
    catalog: CATALOG_VERSION,
    policy: POLICY_VERSION,
    nodes: graph.nodes.map(({ id, kind, name, config }) => ({ id, kind, name, config })),
    edges: graph.edges,
    overlays: overlays
      .filter((o) => o.enabled)
      .map(({ id, name, kind, priority, target, settings }) => ({ id, name, kind, priority, target, settings })),
  };
  return hash(JSON.stringify(canonical(input)));
}

export function overlayTargets(overlay: Overlay, node: CapabilityNode): boolean {
  const t = overlay.target;
  if (t.mode === 'all') return true;
  if (t.mode === 'nodeIds') return t.nodeIds.includes(node.id);
  return t.kinds.includes(node.kind);
}

export function activeOverlays(overlays: Overlay[]): Overlay[] {
  return overlays
    .filter((o) => o.enabled)
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
}

function applicable(node: CapabilityNode, key: string): boolean {
  return key in node.config || UNIVERSAL_KEYS.includes(key);
}

/** Pure and deterministic: never mutates the project. */
export function resolveProject(project: GnikProject): ResolvedProject {
  const active = activeOverlays(project.overlays.map((o) => o));
  const changes: ResolvedChange[] = [];
  const conflicts: ResolutionConflict[] = [];
  const policyFindings: ValidationFinding[] = [];

  const effectiveNodes: ResolvedNode[] = project.graph.nodes.map((node) => {
    const config: NodeConfig = { ...node.config };
    const provenance: Record<string, Provenance> = {};
    const base: Provenance = { source: 'base', id: 'base', label: 'Base architecture' };
    for (const k of Object.keys(config)) provenance[k] = base;
    const touching = new Set<string>();

    const keys = new Set<string>();
    const targeting = active.filter((o) => overlayTargets(o, node));
    for (const o of targeting) for (const k of Object.keys(patchOf(o.settings))) if (applicable(node, k)) keys.add(k);

    for (const key of [...keys].sort()) {
      const contribs = targeting.filter((o) => key in patchOf(o.settings));
      contribs.forEach((o) => touching.add(o.id));
      const values = [...new Set(contribs.map((o) => patchOf(o.settings)[key]))];
      const winner = contribs[contribs.length - 1];
      let value: ConfigValue | undefined;
      let source = winner;
      if (values.length === 1) {
        value = values[0];
      } else if (winner.settings.override === true) {
        value = patchOf(winner.settings)[key];
      } else {
        conflicts.push({
          nodeId: node.id,
          key,
          overlayIds: contribs.map((o) => o.id),
          values: contribs.map((o) => patchOf(o.settings)[key]),
          message: `"${key}" on ${node.name} is set differently by ${contribs.map((o) => `${o.name} (${String(patchOf(o.settings)[key])})`).join(' and ')}. Disable one overlay or mark the higher-priority patch as an override with a reason.`,
        });
        continue;
      }
      source = values.length === 1 ? contribs[0] : winner;
      const prov: Provenance = {
        source: 'overlay',
        id: source.id,
        label: source.name,
        reason: typeof source.settings.reason === 'string' ? source.settings.reason : undefined,
      };
      if (config[key] !== value) {
        changes.push({ nodeId: node.id, key, from: config[key], to: value, source: prov });
      }
      config[key] = value;
      provenance[key] = prov;
    }

    for (const [key, value] of Object.entries(PLATFORM_DEFAULTS)) {
      if (!(key in config)) {
        config[key] = value;
        provenance[key] = { source: 'platform', id: 'platform-defaults', label: 'Platform default' };
      }
    }
    for (const [key, value] of Object.entries(POLICY_ENFORCED)) {
      config[key] = value;
      provenance[key] = { source: 'policy', id: 'POL-TLS', label: 'Org policy POL-TLS', reason: 'Minimum TLS version is non-overridable.' };
    }

    if (CATALOG[node.kind].dataBearing && config.publicAccess === true) {
      policyFindings.push({
        id: `policy-no-public-datastore-${node.id}`,
        severity: 'error',
        code: 'POLICY_NO_PUBLIC_DATASTORE',
        message: `${node.name}: organisation policy POL-DATA forbids public endpoints on data stores.`,
        nodeIds: [node.id],
        remediation: 'Turn off public access. This guardrail cannot be overridden by overlays.',
      });
    }

    return { node, config, provenance, overlayIds: [...touching] };
  });

  return {
    projectId: project.id,
    baseGraph: project.graph,
    activeOverlayIds: active.map((o) => o.id),
    effectiveNodes,
    effectiveEdges: project.graph.edges,
    changes,
    conflicts,
    policyFindings,
    fingerprint: computeFingerprint(project.graph, project.overlays),
  };
}
