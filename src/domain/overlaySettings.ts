import { z } from 'zod';
import type { OverlayKind } from './types';

export type SettingType = 'number' | 'boolean' | { enum: string[] };

export const SETTING_TYPES: Record<string, SettingType> = {
  replicasMin: 'number',
  replicasMax: 'number',
  concurrency: 'number',
  maxConcurrency: 'number',
  rateLimitPerMinute: 'number',
  cpu: 'number',
  memoryGiB: 'number',
  retentionDays: 'number',
  highAvailability: 'boolean',
  backup: 'boolean',
  encryptionAtRest: 'boolean',
  encryptionInTransit: 'boolean',
  publicAccess: 'boolean',
  privateEndpoint: 'boolean',
  networkExposure: { enum: ['private', 'public'] },
  dataClassification: { enum: ['public', 'internal', 'restricted'] },
  dataSensitivity: { enum: ['public', 'internal', 'restricted'] },
  region: { enum: ['region-a', 'region-b', 'on-prem'] },
  provider: { enum: ['mock-paas', 'on-prem'] },
  monthlyBudgetUsd: 'number',
};

/** Keys that may appear on every node even when the base config does not declare them. */
export const UNIVERSAL_KEYS = ['networkExposure', 'dataClassification', 'region', 'provider'];

export const ALLOWED_KEYS: Record<OverlayKind, string[]> = {
  environment: ['replicasMin', 'replicasMax', 'highAvailability', 'backup', 'retentionDays'],
  security: ['networkExposure', 'dataClassification', 'dataSensitivity', 'encryptionAtRest', 'encryptionInTransit', 'publicAccess', 'privateEndpoint'],
  performance: ['replicasMin', 'replicasMax', 'concurrency', 'maxConcurrency', 'rateLimitPerMinute'],
  resilience: ['highAvailability', 'backup', 'retentionDays', 'replicasMin'],
  cost: ['replicasMax', 'cpu', 'memoryGiB', 'monthlyBudgetUsd'],
  placement: ['region', 'provider'],
};

export const META_KEYS = ['override', 'reason'];
/** Settings that are project-level constraints rather than node patches. */
export const NON_PATCH_KEYS = [...META_KEYS, 'monthlyBudgetUsd'];

function keySchema(t: SettingType): z.ZodType {
  if (t === 'number') return z.number().finite();
  if (t === 'boolean') return z.boolean();
  return z.enum(t.enum as [string, ...string[]]);
}

export function overlaySettingsSchema(kind: OverlayKind) {
  const shape: Record<string, z.ZodType> = {
    override: z.boolean().optional(),
    reason: z.string().optional(),
  };
  for (const k of ALLOWED_KEYS[kind]) shape[k] = keySchema(SETTING_TYPES[k]).optional();
  return z.object(shape).strict();
}

export function parseOverlaySettings(kind: OverlayKind, settings: unknown) {
  return overlaySettingsSchema(kind).safeParse(settings);
}

export function patchOf(settings: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (NON_PATCH_KEYS.includes(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
