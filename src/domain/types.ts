import { z } from 'zod';

export const CAPABILITY_KINDS = [
  'web_app',
  'api_service',
  'worker',
  'function',
  'postgres',
  'object_storage',
  'cache',
  'event_bus',
  'queue',
  'api_gateway',
  'model_endpoint',
  'external_system',
  'sqlite',
  'analytics_db',
  'vector_store',
  'rag_service',
  'mcp_server',
  'api_management',
  'identity_provider',
  'key_vault',
  'iac_pipeline',
] as const;
export const capabilityKindSchema = z.enum(CAPABILITY_KINDS);
export type CapabilityKind = z.infer<typeof capabilityKindSchema>;

export const RELATIONS = ['request', 'publishes', 'subscribes', 'reads', 'writes', 'depends_on', 'calls_model'] as const;
export const relationSchema = z.enum(RELATIONS);
export type Relation = z.infer<typeof relationSchema>;

export const configValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type ConfigValue = z.infer<typeof configValueSchema>;
export type NodeConfig = Record<string, ConfigValue>;

export const capabilityNodeSchema = z.object({
  id: z.string().min(1),
  kind: capabilityKindSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), configValueSchema),
});
export type CapabilityNode = z.infer<typeof capabilityNodeSchema>;

export const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relation: relationSchema,
  description: z.string().optional(),
});
export type ArchitectureEdge = z.infer<typeof edgeSchema>;

export const graphSchema = z.object({ nodes: z.array(capabilityNodeSchema), edges: z.array(edgeSchema) });
export type ArchitectureGraph = z.infer<typeof graphSchema>;

export const OVERLAY_KINDS = ['environment', 'security', 'performance', 'resilience', 'cost', 'placement'] as const;
export const overlayKindSchema = z.enum(OVERLAY_KINDS);
export type OverlayKind = z.infer<typeof overlayKindSchema>;

export const overlayTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('nodeIds'), nodeIds: z.array(z.string()) }),
  z.object({ mode: z.literal('capabilityKinds'), kinds: z.array(capabilityKindSchema) }),
]);
export type OverlayTarget = z.infer<typeof overlayTargetSchema>;

export const overlaySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: overlayKindSchema,
  enabled: z.boolean(),
  priority: z.number(),
  target: overlayTargetSchema,
  settings: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Overlay = z.infer<typeof overlaySchema>;

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  graph: graphSchema,
  overlays: z.array(overlaySchema),
  policyProfileId: z.string(),
  providerProfileId: z.string(),
});
export type GnikProject = z.infer<typeof projectSchema>;

export type Severity = 'error' | 'warning' | 'info';
export interface ValidationFinding {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  nodeIds: string[];
  overlayId?: string;
  remediation?: string;
}

export type ProvenanceSource = 'base' | 'overlay' | 'platform' | 'policy';
export interface Provenance {
  source: ProvenanceSource;
  id: string;
  label: string;
  reason?: string;
}

export interface ResolvedNode {
  node: CapabilityNode;
  config: NodeConfig;
  provenance: Record<string, Provenance>;
  overlayIds: string[];
}

export interface ResolvedChange {
  nodeId: string;
  key: string;
  from: ConfigValue | undefined;
  to: ConfigValue;
  source: Provenance;
}

export interface ResolutionConflict {
  nodeId: string;
  key: string;
  overlayIds: string[];
  values: ConfigValue[];
  message: string;
}

export interface ResolvedProject {
  projectId: string;
  baseGraph: ArchitectureGraph;
  activeOverlayIds: string[];
  effectiveNodes: ResolvedNode[];
  effectiveEdges: ArchitectureEdge[];
  changes: ResolvedChange[];
  conflicts: ResolutionConflict[];
  policyFindings: ValidationFinding[];
  fingerprint: string;
}
