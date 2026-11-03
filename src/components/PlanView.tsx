import { Play, FileWarning, ShieldAlert, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useStore } from '../application/store';
import { useDerived } from '../application/derived';
import type { SimulationStep } from '../domain/simulate';

export const SIM_LABEL = 'Simulation only — no cloud resources are created';

export function PlanView() {
  const { plan, planStale, project } = useDerived();
  const { generatePlan, runSimulation, runs, simOptions, setSimOptions, focusFinding } = useStore();
  const run = runs[0];
  const canRun = Boolean(plan && plan.status === 'ready' && !planStale);

  return (
    <div className="plan-view" data-testid="plan-view">
      <div className="plan-head">
        <div><h2>Plan &amp; Run</h2><p className="muted">Resolved architecture → implementation plan → simulated run.</p></div>
        <button className="btn" onClick={generatePlan}>{plan ? 'Regenerate plan' : 'Generate plan'}</button>
      </div>

      {!plan && <div className="card empty-card"><FileWarning size={20} /><div><b>No plan yet</b><p className="muted">Generate a plan to see how “{project.name}” maps to implementation resources.</p></div></div>}
      {plan && planStale && <div className="banner warn" role="status"><Clock size={16} /> This plan is stale — the graph or active overlays changed after it was generated. Regenerate to simulate.</div>}
      {plan && !planStale && plan.status === 'blocked' && (
        <div className="banner error" role="alert"><ShieldAlert size={16} /> Plan blocked by {plan.summary.errors} error(s). Fix these before simulating:
          <ul>{plan.findings.filter((f) => f.severity === 'error').slice(0, 6).map((f) => (
            <li key={f.id}>{f.message} <button className="link" onClick={() => focusFinding(f.nodeIds, f.overlayId)}>Focus</button></li>
          ))}</ul>
        </div>
      )}

      {plan && (
        <>
          <section className="card" aria-label="Plan summary">
            <h3>Plan summary <span className={`pill ${planStale ? 'warn' : plan.status}`}>{planStale ? 'stale' : plan.status}</span></h3>
            <div className="stats">
              <div><small>Provider profile</small><b>{plan.summary.providerProfile}</b></div>
              <div><small>Logical resources</small><b>{plan.summary.logicalResources}</b></div>
              <div><small>Create / update / replace / delete</small><b>{plan.summary.counts.create} / {plan.summary.counts.update} / {plan.summary.counts.replace} / {plan.summary.counts.delete}</b></div>
              <div><small>Risk</small><b className={`risk ${plan.summary.risk}`}>{plan.summary.risk}</b></div>
              <div><small>Warnings</small><b>{plan.summary.warnings}</b></div>
              <div><small>Illustrative estimate / month</small><b>${plan.summary.estimatedMonthlyCost.min}–${plan.summary.estimatedMonthlyCost.max}</b></div>
            </div>
            <p className="hint">Cost is an illustrative estimate from a simple deterministic demo formula, not live cloud pricing. Fingerprint <code>{plan.inputFingerprint}</code></p>
          </section>

          <section className="card" aria-label="Change list">
            <h3>Change list</h3>
            <table className="plan-table">
              <thead><tr><th>Action</th><th>Capability</th><th>Implementation</th><th>Rationale</th><th>Overlays</th><th>Risk</th><th>Est. $/mo*</th></tr></thead>
              <tbody>
                {plan.items.map((i) => (
                  <tr key={i.id}>
                    <td><span className={`pill action-${i.action}`}>{i.action}</span></td>
                    <td><b>{i.logicalName}</b><small>{i.capabilityKind}</small></td>
                    <td>{i.implementation}</td><td>{i.rationale}</td>
                    <td>{i.affectedOverlayNames.join(', ') || '—'}</td>
                    <td><span className={`risk ${i.risk}`}>{i.risk}</span></td>
                    <td>{i.estimatedMonthlyCost ? `${i.estimatedMonthlyCost.min}–${i.estimatedMonthlyCost.max}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">*Illustrative estimate only.</p>
          </section>
        </>
      )}

      <section className="card" aria-label="Simulation">
        <h3>Simulation <span className="pill sim">mock adapter</span></h3>
        <p className="sim-label">{SIM_LABEL}</p>
        <div className="row">
          <label className="inline-label">Simulation options
            <select value={simOptions.failAt ?? ''} onChange={(e) => setSimOptions({ failAt: (e.target.value || undefined) as SimulationStep | undefined })}>
              <option value="">No failure</option><option value="provisioning">Fail at provisioning</option><option value="configuring">Fail at configuring</option><option value="health">Fail at health check</option>
            </select>
          </label>
          <button className="btn primary" disabled={!canRun} onClick={runSimulation} title={canRun ? SIM_LABEL : 'Requires a ready, non-stale plan'}><Play size={14} /> Deploy simulation</button>
        </div>
        {!canRun && <p className="hint">Disabled until a valid, current plan exists.</p>}
        {run && (
          <div className="timeline" data-testid="timeline">
            <div className={`run-status ${run.status}`}>{run.status === 'succeeded' ? <CheckCircle2 size={16} /> : <XCircle size={16} />} Simulated run {run.status} <small>{run.id}</small></div>
            <ol>
              {run.events.map((e) => <li key={e.seq} className={e.level}><span className="phase">{e.phase}</span> {e.message}<small>+{e.offsetMs}ms</small></li>)}
            </ol>
            <p className="hint">{SIM_LABEL}. Project intent was not modified by this run.</p>
          </div>
        )}
        {runs.length > 1 && <p className="hint">{runs.length - 1} earlier simulated run(s) this session.</p>}
      </section>
    </div>
  );
}
