import { CATALOG } from '../domain/catalog';
import type { ArchitectureEdge, CapabilityKind, CapabilityNode, GnikProject, Overlay } from '../domain/types';

const STAMP = '2025-01-01T00:00:00.000Z';

function node(id: string, kind: CapabilityKind, name: string, x: number, y: number, description?: string): CapabilityNode {
  return { id, kind, name, description, position: { x, y }, config: { ...CATALOG[kind].defaults } };
}

export const STARTER_NODES: CapabilityNode[] = [
  node('n-api', 'api_service', 'Public API', 0, 180, 'Receives notification requests.'),
  node('n-bus', 'event_bus', 'Notification Events', 300, 180, 'Fan-out of notification events.'),
  node('n-worker', 'worker', 'Notification Worker', 600, 180, 'Processes and delivers notifications.'),
  node('n-db', 'postgres', 'Customer Database', 900, 20, 'Customer profiles and preferences.'),
  node('n-archive', 'object_storage', 'Message Archive', 900, 180, 'Archive of delivered messages.'),
  node('n-model', 'model_endpoint', 'AI Message Classifier', 900, 340, 'Classifies message intent.'),
];

export const STARTER_EDGES: ArchitectureEdge[] = [
  { id: 'e-api-bus', source: 'n-api', target: 'n-bus', relation: 'publishes' },
  { id: 'e-worker-bus', source: 'n-worker', target: 'n-bus', relation: 'subscribes' },
  { id: 'e-worker-db', source: 'n-worker', target: 'n-db', relation: 'reads' },
  { id: 'e-worker-archive', source: 'n-worker', target: 'n-archive', relation: 'writes' },
  { id: 'e-worker-model', source: 'n-worker', target: 'n-model', relation: 'calls_model' },
];

export function starterOverlays(now = STAMP): Overlay[] {
  const base = { createdAt: now, updatedAt: now };
  return [
    {
      id: 'ov-development', name: 'Development', kind: 'environment', enabled: true, priority: 10, target: { mode: 'all' }, ...base,
      settings: { replicasMin: 1, replicasMax: 2, highAvailability: false, retentionDays: 7, reason: 'Low-cost development profile' },
    },
    {
      id: 'ov-production', name: 'Production', kind: 'environment', enabled: false, priority: 20, target: { mode: 'all' }, ...base,
      settings: { replicasMin: 2, replicasMax: 8, highAvailability: true, backup: true, reason: 'Production availability profile' },
    },
    {
      id: 'ov-restricted', name: 'Restricted Data', kind: 'security', enabled: false, priority: 30, ...base,
      target: { mode: 'capabilityKinds', kinds: ['postgres', 'object_storage', 'cache', 'model_endpoint', 'event_bus', 'queue'] },
      settings: {
        networkExposure: 'private', dataClassification: 'restricted', dataSensitivity: 'restricted',
        encryptionAtRest: true, encryptionInTransit: true, publicAccess: false, privateEndpoint: true,
        reason: 'Restricted data must stay on private networking',
      },
    },
    {
      id: 'ov-budget', name: 'Budget Guardrail', kind: 'cost', enabled: false, priority: 40, target: { mode: 'all' }, ...base,
      settings: { replicasMax: 4, monthlyBudgetUsd: 400, reason: 'Conservative scaling limits' },
    },
  ];
}

export function createStarterProject(now = STAMP): GnikProject {
  return {
    schemaVersion: 1,
    id: 'project-customer-notifications',
    name: 'Customer Notifications',
    description: 'Starter architecture: API → events → worker → data, archive and AI classification.',
    createdAt: now,
    updatedAt: now,
    graph: { nodes: STARTER_NODES.map((n) => ({ ...n, config: { ...n.config } })), edges: STARTER_EDGES.map((e) => ({ ...e })) },
    overlays: starterOverlays(now),
    policyProfileId: 'policy-1',
    providerProfileId: 'mock-paas',
  };
}

/** Second demo: an open-source "secure AI knowledge platform" built from the platform kit. */
export function createPlatformKitProject(now = STAMP): GnikProject {
  const nodes: CapabilityNode[] = [
    node('p-web', 'web_app', 'Knowledge Portal', 0, 160, 'End-user UI.'),
    node('p-sso', 'identity_provider', 'SSO (Keycloak)', 0, 0, 'OIDC single sign-on and MFA.'),
    node('p-apim', 'api_management', 'API Management', 300, 160, 'Keys, quotas and developer portal.'),
    node('p-rag', 'rag_service', 'RAG Service', 600, 160, 'Retrieval-augmented answers.'),
    node('p-mcp', 'mcp_server', 'MCP Tools Server', 600, 320, 'Exposes tools to AI agents.'),
    node('p-vec', 'vector_store', 'Vector Index', 900, 60, 'Document embeddings.'),
    node('p-model', 'model_endpoint', 'LLM Endpoint', 900, 200, 'Answer generation.'),
    node('p-sql', 'sqlite', 'App Metadata DB', 900, 340, 'Lightweight relational metadata.'),
    node('p-olap', 'analytics_db', 'Usage Analytics', 900, 480, 'DuckDB analytics on usage.'),
    node('p-vault', 'key_vault', 'Key Vault (OpenBao)', 300, 0, 'Secrets and keys.'),
    node('p-iac', 'iac_pipeline', 'IaC (OpenTofu)', 300, 340, 'Provisions the platform.'),
  ];
  const e = (s: string, t: string, relation: ArchitectureEdge['relation']): ArchitectureEdge => ({ id: `e-${s}-${t}`, source: s, target: t, relation });
  return {
    schemaVersion: 1,
    id: 'project-platform-kit',
    name: 'Secure AI Knowledge Platform',
    description: 'Open-source platform kit: SSO, APIM, RAG, MCP, vector + SQL + analytics stores, vault and IaC.',
    createdAt: now,
    updatedAt: now,
    graph: {
      nodes,
      edges: [
        e('p-web', 'p-apim', 'request'), e('p-web', 'p-sso', 'depends_on'), e('p-apim', 'p-rag', 'request'),
        e('p-apim', 'p-mcp', 'request'), e('p-rag', 'p-vec', 'reads'), e('p-rag', 'p-model', 'calls_model'),
        e('p-mcp', 'p-sql', 'reads'), e('p-mcp', 'p-olap', 'reads'), e('p-rag', 'p-vault', 'depends_on'),
        e('p-iac', 'p-vault', 'depends_on'),
      ],
    },
    overlays: starterOverlays(now),
    policyProfileId: 'policy-1',
    providerProfileId: 'mock-paas',
  };
}
