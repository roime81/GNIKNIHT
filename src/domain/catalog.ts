import type { CapabilityKind, ConfigValue, NodeConfig, Relation } from './types';

export type Category = 'Compute' | 'Data' | 'Integration' | 'AI' | 'Security' | 'Platform' | 'External';

export interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select' | 'text';
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

export interface CapabilityDef {
  kind: CapabilityKind;
  label: string;
  category: Category;
  description: string;
  defaults: NodeConfig;
  fields: FieldDef[];
  implementation: string;
  stateless: boolean;
  dataBearing: boolean;
  baseCost: number;
}

const replicas: FieldDef[] = [
  { key: 'replicasMin', label: 'Min replicas', type: 'number', min: 0, max: 100, help: 'Lowest instance count kept running.' },
  { key: 'replicasMax', label: 'Max replicas', type: 'number', min: 1, max: 100, help: 'Upper bound for autoscaling.' },
  { key: 'cpu', label: 'CPU (cores)', type: 'number', min: 0.1, max: 16 },
  { key: 'memoryGiB', label: 'Memory (GiB)', type: 'number', min: 0.25, max: 64 },
];
const ingress: FieldDef = { key: 'ingress', label: 'Ingress', type: 'select', options: ['public', 'internal'] };

export const CATALOG: Record<CapabilityKind, CapabilityDef> = {
  web_app: {
    kind: 'web_app', label: 'Web app', category: 'Compute', description: 'User-facing web application',
    defaults: { replicasMin: 1, replicasMax: 3, cpu: 0.5, memoryGiB: 1, ingress: 'public', auth: 'required' },
    fields: [...replicas, ingress, { key: 'auth', label: 'Authentication', type: 'select', options: ['required', 'optional', 'none'] }],
    implementation: 'Managed Web App', stateless: true, dataBearing: false, baseCost: 30,
  },
  api_service: {
    kind: 'api_service', label: 'API service', category: 'Compute', description: 'Request/response business API',
    defaults: { replicasMin: 1, replicasMax: 3, cpu: 0.5, memoryGiB: 1, ingress: 'internal', auth: 'required' },
    fields: [...replicas, ingress, { key: 'auth', label: 'Authentication', type: 'select', options: ['required', 'optional', 'none'] }],
    implementation: 'Managed API Service', stateless: true, dataBearing: false, baseCost: 30,
  },
  worker: {
    kind: 'worker', label: 'Worker', category: 'Compute', description: 'Background event/queue consumer',
    defaults: { replicasMin: 1, replicasMax: 5, cpu: 0.5, memoryGiB: 1, concurrency: 10 },
    fields: [...replicas, { key: 'concurrency', label: 'Concurrency', type: 'number', min: 1, max: 1000 }],
    implementation: 'Managed Background Worker', stateless: true, dataBearing: false, baseCost: 25,
  },
  function: {
    kind: 'function', label: 'Function', category: 'Compute', description: 'Event-driven serverless function',
    defaults: { maxConcurrency: 20, timeoutSeconds: 30, trigger: 'event' },
    fields: [
      { key: 'maxConcurrency', label: 'Max concurrency', type: 'number', min: 1, max: 1000 },
      { key: 'timeoutSeconds', label: 'Timeout (s)', type: 'number', min: 1, max: 900 },
      { key: 'trigger', label: 'Trigger', type: 'select', options: ['event', 'http', 'schedule'] },
    ],
    implementation: 'Serverless Function', stateless: true, dataBearing: false, baseCost: 8,
  },
  postgres: {
    kind: 'postgres', label: 'PostgreSQL', category: 'Data', description: 'Relational database',
    defaults: { tier: 'small', storageGiB: 32, highAvailability: false, backup: true, encryptionAtRest: true, publicAccess: false },
    fields: [
      { key: 'tier', label: 'Tier', type: 'select', options: ['small', 'medium', 'large'], help: 'High availability requires medium or large in the mock adapter.' },
      { key: 'storageGiB', label: 'Storage (GiB)', type: 'number', min: 1, max: 16384 },
      { key: 'highAvailability', label: 'High availability', type: 'boolean' },
      { key: 'backup', label: 'Backups', type: 'boolean' },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public endpoint', type: 'boolean' },
    ],
    implementation: 'Managed PostgreSQL', stateless: false, dataBearing: true, baseCost: 60,
  },
  object_storage: {
    kind: 'object_storage', label: 'Object storage', category: 'Data', description: 'Blob and file storage',
    defaults: { tier: 'standard', versioning: true, encryptionAtRest: true, publicAccess: false, retentionDays: 30 },
    fields: [
      { key: 'tier', label: 'Tier', type: 'select', options: ['standard', 'cool', 'archive'] },
      { key: 'versioning', label: 'Versioning', type: 'boolean' },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public access', type: 'boolean' },
      { key: 'retentionDays', label: 'Retention (days)', type: 'number', min: 1, max: 3650 },
    ],
    implementation: 'Managed Object Storage', stateless: false, dataBearing: true, baseCost: 10,
  },
  cache: {
    kind: 'cache', label: 'Cache', category: 'Data', description: 'In-memory key/value cache',
    defaults: { tier: 'small', persistence: false, encryptionInTransit: true, publicAccess: false },
    fields: [
      { key: 'tier', label: 'Tier', type: 'select', options: ['small', 'medium', 'large'] },
      { key: 'persistence', label: 'Persistence', type: 'boolean' },
      { key: 'encryptionInTransit', label: 'Encryption in transit', type: 'boolean' },
      { key: 'publicAccess', label: 'Public access', type: 'boolean' },
    ],
    implementation: 'Managed Cache', stateless: false, dataBearing: true, baseCost: 20,
  },
  event_bus: {
    kind: 'event_bus', label: 'Event bus', category: 'Integration', description: 'Publish/subscribe event backbone',
    defaults: { throughput: 'standard', retentionHours: 24, encryption: true },
    fields: [
      { key: 'throughput', label: 'Throughput', type: 'select', options: ['standard', 'high'] },
      { key: 'retentionHours', label: 'Retention (h)', type: 'number', min: 1, max: 168 },
      { key: 'encryption', label: 'Encryption', type: 'boolean' },
    ],
    implementation: 'Managed Event Bus', stateless: false, dataBearing: false, baseCost: 15,
  },
  queue: {
    kind: 'queue', label: 'Queue', category: 'Integration', description: 'Durable message queue',
    defaults: { delivery: 'at_least_once', visibilityTimeoutSeconds: 30, deadLetterEnabled: true },
    fields: [
      { key: 'delivery', label: 'Delivery', type: 'select', options: ['at_least_once', 'at_most_once'] },
      { key: 'visibilityTimeoutSeconds', label: 'Visibility timeout (s)', type: 'number', min: 1, max: 43200 },
      { key: 'deadLetterEnabled', label: 'Dead-letter queue', type: 'boolean' },
    ],
    implementation: 'Managed Queue', stateless: false, dataBearing: false, baseCost: 6,
  },
  api_gateway: {
    kind: 'api_gateway', label: 'API gateway', category: 'Integration', description: 'Edge entry point and policy boundary',
    defaults: { ingress: 'public', authentication: 'required', rateLimitPerMinute: 600 },
    fields: [
      ingress,
      { key: 'authentication', label: 'Authentication', type: 'select', options: ['required', 'optional', 'none'] },
      { key: 'rateLimitPerMinute', label: 'Rate limit / min', type: 'number', min: 1, max: 1000000 },
    ],
    implementation: 'Managed API Gateway', stateless: true, dataBearing: false, baseCost: 20,
  },
  model_endpoint: {
    kind: 'model_endpoint', label: 'Model endpoint', category: 'AI', description: 'AI model inference endpoint',
    defaults: { modelFamily: 'general', dataSensitivity: 'internal', privateEndpoint: true, maxTokens: 2048 },
    fields: [
      { key: 'modelFamily', label: 'Model family', type: 'select', options: ['general', 'classifier', 'embedding'] },
      { key: 'dataSensitivity', label: 'Data sensitivity', type: 'select', options: ['public', 'internal', 'restricted'] },
      { key: 'privateEndpoint', label: 'Private endpoint', type: 'boolean' },
      { key: 'maxTokens', label: 'Max tokens', type: 'number', min: 1, max: 200000 },
    ],
    implementation: 'Private Model Endpoint', stateless: false, dataBearing: true, baseCost: 80,
  },
  sqlite: {
    kind: 'sqlite', label: 'SQLite / libSQL', category: 'Data', description: 'Lightweight embedded open-source RDBMS',
    defaults: { engine: 'sqlite', storageGiB: 5, backup: true, encryptionAtRest: true, publicAccess: false },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['sqlite', 'libsql', 'mariadb'] },
      { key: 'storageGiB', label: 'Storage (GiB)', type: 'number', min: 1, max: 1024 },
      { key: 'backup', label: 'Backups', type: 'boolean' },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public endpoint', type: 'boolean' },
    ],
    implementation: 'Lightweight Relational DB', stateless: false, dataBearing: true, baseCost: 8,
  },
  analytics_db: {
    kind: 'analytics_db', label: 'Analytics DB', category: 'Data', description: 'Open-source OLAP store (DuckDB / ClickHouse)',
    defaults: { engine: 'duckdb', tier: 'small', storageGiB: 50, encryptionAtRest: true, publicAccess: false },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['duckdb', 'clickhouse'] },
      { key: 'tier', label: 'Tier', type: 'select', options: ['small', 'medium', 'large'] },
      { key: 'storageGiB', label: 'Storage (GiB)', type: 'number', min: 1, max: 16384 },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public endpoint', type: 'boolean' },
    ],
    implementation: 'Managed Analytics DB', stateless: false, dataBearing: true, baseCost: 35,
  },
  vector_store: {
    kind: 'vector_store', label: 'Vector store', category: 'AI', description: 'Embedding index for RAG (pgvector / Qdrant)',
    defaults: { engine: 'pgvector', dimensions: 768, storageGiB: 10, encryptionAtRest: true, publicAccess: false },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['pgvector', 'qdrant', 'chroma'] },
      { key: 'dimensions', label: 'Dimensions', type: 'number', min: 8, max: 4096 },
      { key: 'storageGiB', label: 'Storage (GiB)', type: 'number', min: 1, max: 4096 },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public endpoint', type: 'boolean' },
    ],
    implementation: 'Managed Vector Store', stateless: false, dataBearing: true, baseCost: 25,
  },
  rag_service: {
    kind: 'rag_service', label: 'RAG service', category: 'AI', description: 'Retrieval-augmented generation pipeline',
    defaults: { replicasMin: 1, replicasMax: 3, cpu: 1, memoryGiB: 2, topK: 5, chunkSize: 512, ingress: 'internal' },
    fields: [...replicas,
      { key: 'topK', label: 'Top-K', type: 'number', min: 1, max: 100 },
      { key: 'chunkSize', label: 'Chunk size (tokens)', type: 'number', min: 64, max: 8192 },
      ingress],
    implementation: 'Managed RAG Pipeline', stateless: true, dataBearing: false, baseCost: 30,
  },
  mcp_server: {
    kind: 'mcp_server', label: 'MCP server', category: 'AI', description: 'Model Context Protocol tool/resource server',
    defaults: { replicasMin: 1, replicasMax: 3, cpu: 0.5, memoryGiB: 1, transport: 'http', authentication: 'required', ingress: 'internal' },
    fields: [...replicas,
      { key: 'transport', label: 'Transport', type: 'select', options: ['http', 'sse', 'stdio'] },
      { key: 'authentication', label: 'Authentication', type: 'select', options: ['required', 'optional', 'none'] },
      ingress],
    implementation: 'Managed MCP Server', stateless: true, dataBearing: false, baseCost: 20,
  },
  api_management: {
    kind: 'api_management', label: 'API management', category: 'Integration', description: 'APIM: keys, quotas, versions, portal (Kong / Tyk)',
    defaults: { engine: 'kong', ingress: 'public', authentication: 'required', rateLimitPerMinute: 1000, developerPortal: true },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['kong', 'tyk', 'apisix'] },
      ingress,
      { key: 'authentication', label: 'Authentication', type: 'select', options: ['required', 'optional', 'none'] },
      { key: 'rateLimitPerMinute', label: 'Rate limit / min', type: 'number', min: 1, max: 1000000 },
      { key: 'developerPortal', label: 'Developer portal', type: 'boolean' },
    ],
    implementation: 'Managed API Management', stateless: true, dataBearing: false, baseCost: 25,
  },
  identity_provider: {
    kind: 'identity_provider', label: 'SSO / Identity', category: 'Security', description: 'SSO and authentication (Keycloak / Authentik)',
    defaults: { engine: 'keycloak', protocol: 'oidc', mfa: true, tier: 'small' },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['keycloak', 'authentik', 'zitadel'] },
      { key: 'protocol', label: 'Protocol', type: 'select', options: ['oidc', 'saml'] },
      { key: 'mfa', label: 'Require MFA', type: 'boolean' },
      { key: 'tier', label: 'Tier', type: 'select', options: ['small', 'medium', 'large'] },
    ],
    implementation: 'Managed Identity Provider', stateless: false, dataBearing: false, baseCost: 20,
  },
  key_vault: {
    kind: 'key_vault', label: 'Key Vault', category: 'Security', description: 'Secrets and key management (OpenBao / Vault)',
    defaults: { engine: 'openbao', autoUnseal: true, rotationDays: 90, encryptionAtRest: true, publicAccess: false },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['openbao', 'vault', 'infisical'] },
      { key: 'autoUnseal', label: 'Auto-unseal', type: 'boolean' },
      { key: 'rotationDays', label: 'Rotation (days)', type: 'number', min: 1, max: 365 },
      { key: 'encryptionAtRest', label: 'Encryption at rest', type: 'boolean' },
      { key: 'publicAccess', label: 'Public endpoint', type: 'boolean' },
    ],
    implementation: 'Managed Key Vault', stateless: false, dataBearing: true, baseCost: 15,
  },
  iac_pipeline: {
    kind: 'iac_pipeline', label: 'IaC pipeline', category: 'Platform', description: 'Infrastructure as code runner (OpenTofu / Pulumi)',
    defaults: { engine: 'opentofu', stateBackend: 'object_storage', driftDetection: true, policyChecks: true },
    fields: [
      { key: 'engine', label: 'Engine', type: 'select', options: ['opentofu', 'pulumi', 'ansible'] },
      { key: 'stateBackend', label: 'State backend', type: 'select', options: ['object_storage', 'postgres', 'local'] },
      { key: 'driftDetection', label: 'Drift detection', type: 'boolean' },
      { key: 'policyChecks', label: 'Policy checks', type: 'boolean' },
    ],
    implementation: 'IaC Pipeline Runner', stateless: true, dataBearing: false, baseCost: 5,
  },
  external_system: {
    kind: 'external_system', label: 'External system', category: 'External', description: 'Third-party or on-prem dependency',
    defaults: { systemName: 'External system', trustBoundary: 'external', protocol: 'https' },
    fields: [
      { key: 'systemName', label: 'System name', type: 'text' },
      { key: 'trustBoundary', label: 'Trust boundary', type: 'select', options: ['external', 'partner', 'on_prem'] },
      { key: 'protocol', label: 'Protocol', type: 'select', options: ['https', 'amqp', 'tcp'] },
    ],
    implementation: 'External Dependency (no provision action)', stateless: false, dataBearing: false, baseCost: 0,
  },
};

export const CATEGORIES: Category[] = ['Compute', 'Data', 'Integration', 'AI', 'Security', 'Platform', 'External'];

export const PRODUCER_KINDS: CapabilityKind[] = ['web_app', 'api_service', 'worker', 'function', 'rag_service', 'mcp_server', 'external_system'];
export const BROKER_KINDS: CapabilityKind[] = ['event_bus', 'queue'];
export const CONSUMER_KINDS: CapabilityKind[] = ['worker', 'function'];

/** Returns an explanation when the relation is not allowed for this pair, otherwise undefined. */
export function relationProblem(rel: Relation, source: CapabilityKind, target: CapabilityKind): string | undefined {
  switch (rel) {
    case 'publishes':
      if (!PRODUCER_KINDS.includes(source) || !BROKER_KINDS.includes(target))
        return 'publishes must go from a compute, function or external producer to an event bus or queue.';
      return undefined;
    case 'subscribes':
      if (!CONSUMER_KINDS.includes(source) || !BROKER_KINDS.includes(target))
        return 'subscribes must go from a worker or function (consumer) to an event bus or queue.';
      return undefined;
    case 'calls_model':
      return target === 'model_endpoint' ? undefined : 'calls_model must end at a model endpoint.';
    default:
      return undefined;
  }
}

export function inferRelation(source: CapabilityKind, target: CapabilityKind): Relation {
  if (target === 'model_endpoint') return 'calls_model';
  if (target === 'identity_provider' || target === 'key_vault' || target === 'iac_pipeline') return 'depends_on';
  if (BROKER_KINDS.includes(target)) return CONSUMER_KINDS.includes(source) ? 'subscribes' : 'publishes';
  if (CATALOG[target].dataBearing) return source === 'worker' ? 'reads' : 'writes';
  if (CATALOG[source].category === 'Compute' || source === 'api_gateway') return 'request';
  return 'depends_on';
}

export function summaryChips(kind: CapabilityKind, c: NodeConfig): string[] {
  const v = (k: string): ConfigValue | undefined => c[k];
  const chips: string[] = [];
  switch (kind) {
    case 'web_app': case 'api_service': case 'worker':
      chips.push(`min ${v('replicasMin')} / max ${v('replicasMax')}`);
      if (v('ingress')) chips.push(String(v('ingress')));
      break;
    case 'function': chips.push(`${v('maxConcurrency')} concurrent`); break;
    case 'postgres': chips.push(String(v('tier'))); chips.push(v('highAvailability') ? 'HA' : 'single'); break;
    case 'object_storage': chips.push(String(v('tier'))); chips.push(`${v('retentionDays')}d`); break;
    case 'cache': chips.push(String(v('tier'))); break;
    case 'event_bus': chips.push(`${v('retentionHours')}h retention`); break;
    case 'queue': chips.push(String(v('delivery')).replace(/_/g, ' ')); break;
    case 'api_gateway': chips.push(String(v('ingress'))); chips.push(`${v('rateLimitPerMinute')}/min`); break;
    case 'model_endpoint': chips.push(v('privateEndpoint') ? 'Private' : 'Public'); chips.push(String(v('dataSensitivity'))); break;
    case 'external_system': chips.push(String(v('trustBoundary'))); break;
    case 'sqlite': case 'analytics_db': case 'vector_store': case 'api_management': case 'identity_provider': case 'key_vault': case 'iac_pipeline':
      chips.push(String(v('engine'))); break;
    case 'rag_service': chips.push(`top-${v('topK')}`); chips.push(String(v('ingress'))); break;
    case 'mcp_server': chips.push(String(v('transport'))); chips.push(v('authentication') === 'none' ? 'no auth' : 'auth'); break;
  }
  if (c.networkExposure === 'private') chips.push('Private network');
  return chips;
}
