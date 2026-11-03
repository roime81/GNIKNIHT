import { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useStore, type DrawerTab } from '../application/store';
import { useDerived } from '../application/derived';
import { DemoAssistantProvider } from '../adapters/assistant';
import type { ValidationFinding } from '../domain/types';

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };
const TABS: [DrawerTab, string][] = [['validation', 'Validation'], ['activity', 'Activity'], ['plan', 'Plan output']];

function FindingRow({ f }: { f: ValidationFinding }) {
  const { project } = useDerived();
  const focus = useStore((s) => s.focusFinding);
  const [explain, setExplain] = useState<string>();
  const Icon = ICON[f.severity];
  const names = f.nodeIds.map((id) => project.graph.nodes.find((n) => n.id === id)?.name).filter(Boolean);
  const overlay = project.overlays.find((o) => o.id === f.overlayId)?.name;
  return (
    <li className={`finding ${f.severity}`}>
      <Icon size={15} />
      <div className="finding-main">
        <div>{f.message} <code>{f.code}</code></div>
        {(names.length > 0 || overlay) && <small>Affects: {[...names, overlay && `overlay ${overlay}`].filter(Boolean).join(', ')}</small>}
        {f.remediation && <small>Fix: {f.remediation}</small>}
        {explain && <small className="explain">Assistant (demo rules): {explain}</small>}
      </div>
      <div className="finding-actions">
        {(f.nodeIds.length > 0 || f.overlayId) && <button className="btn sm" onClick={() => focus(f.nodeIds, f.overlayId)}>Focus</button>}
        <button className="btn sm" onClick={async () => setExplain(await DemoAssistantProvider.explainFinding(f, { overlays: project.overlays }))}>Explain</button>
      </div>
    </li>
  );
}

export function Drawer() {
  const { drawerOpen, drawerTab, setDrawer, activity } = useStore();
  const { findings, errors, warnings, plan, planStale } = useDerived();
  return (
    <section className={`drawer${drawerOpen ? ' open' : ''}`} aria-label="Output drawer">
      <div className="drawer-bar">
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={drawerTab === id} className={drawerTab === id ? 'active' : ''} onClick={() => setDrawer(true, id)}>
              {label}{id === 'validation' && ` (${errors} errors, ${warnings} warnings)`}
            </button>
          ))}
        </div>
        <span className="muted">MVP architecture checks</span>
        <button className="icon-btn" aria-label={drawerOpen ? 'Collapse drawer' : 'Expand drawer'} onClick={() => setDrawer(!drawerOpen)}>{drawerOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      </div>
      {drawerOpen && (
        <div className="drawer-body">
          {drawerTab === 'validation' && (findings.length === 0 ? <p className="ok-text">No findings. All MVP architecture checks passed.</p> : <ul className="findings">{findings.map((f) => <FindingRow key={f.id} f={f} />)}</ul>)}
          {drawerTab === 'activity' && (activity.length === 0 ? <p className="muted">No activity yet.</p> : <ul className="activity">{activity.map((a) => <li key={a.id}><small>{a.time}</small> {a.message}</li>)}</ul>)}
          {drawerTab === 'plan' && (!plan ? <p className="muted">No plan generated yet.</p> : <><p className="muted">{planStale ? 'Stale plan' : `Plan ${plan.status}`} · {plan.id}</p><pre>{JSON.stringify(plan, null, 2)}</pre></>)}
        </div>
      )}
    </section>
  );
}
