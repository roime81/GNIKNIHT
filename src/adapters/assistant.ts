import { z } from 'zod';
import { graphSchema, type Overlay, type ValidationFinding } from '../domain/types';
import { STARTER_EDGES, STARTER_NODES } from '../fixtures/customerNotifications';

export const assistantProposalSchema = z.object({
  kind: z.enum(['graph', 'overlays', 'unsupported']),
  title: z.string(),
  summary: z.string(),
  graph: graphSchema.optional(),
  overlayChanges: z.object({ enable: z.array(z.string()), disable: z.array(z.string()) }).optional(),
});
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export interface AssistantContext {
  overlays: Overlay[];
}

/** Seam for a future LLM provider. Implementations return proposals only and never mutate project state. */
export interface ArchitectureAssistantProvider {
  generateArchitecture(prompt: string, context: AssistantContext): Promise<AssistantProposal>;
  explainFinding(finding: ValidationFinding, context: AssistantContext): Promise<string>;
  suggestOverlay(prompt: string, context: AssistantContext): Promise<AssistantProposal>;
}

export const SUGGESTED_PROMPTS = [
  'Create a customer notification platform with an API, event bus, worker and PostgreSQL database.',
  'Make this architecture production-ready.',
  'Apply restricted data requirements.',
  'Reduce the architecture cost for development.',
];

const UNSUPPORTED: AssistantProposal = {
  kind: 'unsupported',
  title: 'Not supported',
  summary: 'This demo assistant only supports architecture templates and a small set of overlay suggestions.',
};

const EXPLANATIONS: Record<string, string> = {
  OVERLAY_CONFLICT: 'Two enabled overlays set the same property to different values. GNIKNIHT never picks a winner silently. Disable one overlay, or mark the higher-priority overlay as an override with a reason.',
  HA_UNSUPPORTED: 'The mock implementation only offers high availability on medium or large database tiers. Raise the tier or turn high availability off.',
  PROD_REPLICAS: 'Production requires redundancy for stateless compute. Set min replicas to 2 or more.',
  PROD_DB_BACKUP: 'Production databases must keep backups so that recovery objectives can be met.',
  EDGE_INVALID_RELATION: 'This relationship type does not fit the capabilities it connects. publishes/subscribes need an event bus or queue and calls_model needs a model endpoint.',
  RESTRICTED_PUBLIC: 'Restricted data must not be reachable from the public internet. Use private networking.',
  MODEL_RESTRICTED_PRIVATE: 'Restricted data may only reach AI inference through a private endpoint on an approved provider profile.',
  POLICY_NO_PUBLIC_DATASTORE: 'Organisation policy forbids public data store endpoints. It cannot be overridden by overlays.',
};

export const DemoAssistantProvider: ArchitectureAssistantProvider = {
  async generateArchitecture(prompt) {
    const p = prompt.toLowerCase();
    if (p.includes('notification')) {
      return {
        kind: 'graph',
        title: 'Customer notification starter',
        summary: 'Replaces the current graph with an API, event bus, worker, PostgreSQL database, archive and AI classifier. You can undo after applying.',
        graph: { nodes: STARTER_NODES, edges: STARTER_EDGES },
      };
    }
    return UNSUPPORTED;
  },
  async explainFinding(finding) {
    return EXPLANATIONS[finding.code] ?? finding.remediation ?? 'This is a deterministic MVP architecture check. See the message for the affected element.';
  },
  async suggestOverlay(prompt, ctx) {
    const p = prompt.toLowerCase();
    const id = (name: string) => ctx.overlays.find((o) => o.name.toLowerCase() === name)?.id;
    const pick = (names: string[]) => names.map(id).filter((x): x is string => Boolean(x));
    if (p.includes('production')) {
      return { kind: 'overlays', title: 'Enable Production', summary: 'Enables Production and disables Development so their replica and availability settings do not conflict.', overlayChanges: { enable: pick(['production']), disable: pick(['development']) } };
    }
    if (p.includes('restricted')) {
      return { kind: 'overlays', title: 'Enable Restricted Data', summary: 'Enables private networking, encryption and private AI endpoints for data-bearing capabilities.', overlayChanges: { enable: pick(['restricted data']), disable: [] } };
    }
    if (p.includes('cost') || p.includes('development')) {
      return { kind: 'overlays', title: 'Reduce cost', summary: 'Enables Development and Budget Guardrail and disables Production.', overlayChanges: { enable: pick(['development', 'budget guardrail']), disable: pick(['production']) } };
    }
    return UNSUPPORTED;
  },
};

export async function askAssistant(provider: ArchitectureAssistantProvider, prompt: string, ctx: AssistantContext): Promise<AssistantProposal> {
  const p = prompt.toLowerCase();
  const raw = /production|restricted|cost|development/.test(p) && !p.includes('notification')
    ? await provider.suggestOverlay(prompt, ctx)
    : await provider.generateArchitecture(prompt, ctx);
  const parsed = assistantProposalSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...UNSUPPORTED, summary: 'The assistant returned an invalid proposal and it was discarded.' };
}
