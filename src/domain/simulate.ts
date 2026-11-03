import type { DeploymentPlan } from './plan';

export type SimulationStep = 'provisioning' | 'configuring' | 'health';

export interface RunEvent {
  seq: number;
  offsetMs: number;
  phase: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

export interface DeploymentRun {
  id: string;
  planId: string;
  startedAt: string;
  status: 'succeeded' | 'failed';
  simulated: true;
  failAt?: SimulationStep;
  events: RunEvent[];
}

export interface SimulationOptions {
  failAt?: SimulationStep;
}

/** Deterministic simulation. Creates no resources; only produces an event timeline. */
export function simulatePlan(plan: DeploymentPlan, startedAt: string, options: SimulationOptions = {}): DeploymentRun {
  if (plan.status !== 'ready') throw new Error('Only a ready plan can be simulated.');
  const provisionable = plan.items.filter((i) => i.action !== 'no-op');
  const events: RunEvent[] = [];
  const push = (phase: string, message: string, level: RunEvent['level'] = 'info') =>
    events.push({ seq: events.length + 1, offsetMs: events.length * 800, phase, level, message });

  push('queued', 'Run accepted (simulation only — no cloud resources are created).');
  push('validating', `Input fingerprint ${plan.inputFingerprint} verified.`);
  push('validating', 'Preflight passed.');
  push('validating', `Resource mapping prepared for ${provisionable.length} resources.`);

  let failed: SimulationStep | undefined;
  for (const item of provisionable) {
    if (options.failAt === 'provisioning' && item === provisionable[provisionable.length - 1]) {
      push('provisioning', `Simulated failure while provisioning ${item.logicalName} (${item.implementation}).`, 'error');
      failed = 'provisioning';
      break;
    }
    push('provisioning', `Simulating provisioning of ${item.logicalName} → ${item.implementation}.`);
  }
  if (!failed) {
    if (options.failAt === 'configuring') {
      push('configuring', 'Simulated failure while applying configuration.', 'error');
      failed = 'configuring';
    } else {
      push('configuring', 'Simulating configuration of all resources.');
    }
  }
  if (!failed) {
    if (options.failAt === 'health') {
      push('failed', 'Simulated health check failure.', 'error');
      failed = 'health';
    } else {
      push('healthy', 'Health checks passed.', 'success');
      push('healthy', 'Simulation completed.', 'success');
    }
  } else {
    push('failed', 'Simulation stopped. Project intent was not changed.', 'error');
  }

  return {
    id: `run-${plan.inputFingerprint}-${options.failAt ?? 'ok'}`,
    planId: plan.id,
    startedAt,
    status: failed ? 'failed' : 'succeeded',
    simulated: true,
    failAt: failed,
    events,
  };
}
