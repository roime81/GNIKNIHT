import { useMemo } from 'react';
import { useStore } from './store';
import { resolveProject } from '../domain/resolver';
import { validateProject } from '../domain/validate';

/** Resolved architecture and findings are always recomputed from project inputs. */
export function useDerived() {
  const project = useStore((s) => s.project);
  const plan = useStore((s) => s.plan);
  return useMemo(() => {
    const resolved = resolveProject(project);
    const findings = validateProject(project, resolved);
    const planStale = plan ? plan.inputFingerprint !== resolved.fingerprint : false;
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    return { project, resolved, findings, plan, planStale, errors, warnings };
  }, [project, plan]);
}
