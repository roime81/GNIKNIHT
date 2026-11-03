import { useState } from 'react';
import { Copy, Trash2, Layers } from 'lucide-react';
import { useStore } from '../application/store';
import { useDerived } from '../application/derived';
import { CATALOG } from '../domain/catalog';
import { RELATIONS, type Relation } from '../domain/types';
import { relationProblem } from '../domain/catalog';
import { ConfigField } from './ConfigField';
import { OverlayEditor, ResolvedPreview } from './OverlayPanel';
import { CATEGORY_COLOR, KIND_ICON } from './icons';

const TABS = ['Overview', 'Configuration', 'Connections', 'Effective'] as const;

function NodeInspector({ nodeId }: { nodeId: string }) {
  const { project, resolved, findings } = useDerived();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const { updateNode, deleteSelection, duplicateSelection, select } = useStore();
  const node = project.graph.nodes.find((n) => n.id === nodeId);
  const rn = resolved.effectiveNodes.find((n) => n.node.id === nodeId);
  if (!node || !rn) return null;
  const def = CATALOG[node.kind];
  const Icon = KIND_ICON[node.kind];
  const mine = findings.filter((f) => f.nodeIds.includes(node.id));
  const byId = new Map(project.graph.nodes.map((n) => [n.id, n]));
  const incoming = project.graph.edges.filter((e) => e.target === node.id);
  const outgoing = project.graph.edges.filter((e) => e.source === node.id);
  const keys = [...new Set([...Object.keys(node.config), ...Object.keys(rn.config)])];

  return (
    <>
      <div className="insp-head" style={{ ['--accent' as string]: CATEGORY_COLOR[def.category] }}>
        <span className="cap-node-icon"><Icon size={18} /></span>
        <div><h3>{node.name}</h3><small>{def.label} · {def.category}</small></div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="insp-body">
        {tab === 'Overview' && (
          <>
            <div className="field"><label htmlFor="n-name">Name</label>
              <input id="n-name" value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value || node.name })} /></div>
            <div className="field"><label htmlFor="n-desc">Description</label>
              <textarea id="n-desc" rows={3} value={node.description ?? ''} onChange={(e) => updateNode(node.id, { description: e.target.value })} /></div>
            <div className="field"><label>Capability</label><div className="static">{def.label} → {def.implementation}</div></div>
            <div className="field"><label>Status</label>
              {mine.length === 0 ? <div className="ok-text">No findings</div> : mine.map((f) => <div key={f.id} className={`finding-inline ${f.severity}`}>{f.message}</div>)}
            </div>
            <div className="row">
              <button className="btn" onClick={duplicateSelection}><Copy size={14} /> Duplicate</button>
              <button className="btn danger" onClick={deleteSelection}><Trash2 size={14} /> Delete</button>
            </div>
          </>
        )}
        {tab === 'Configuration' && (
          <>
            <p className="hint">Base values. Demo defaults — production values depend on workload and provider.</p>
            {def.fields.map((f) => (
              <ConfigField key={f.key} id={`cfg-${f.key}`} field={f} value={node.config[f.key]} onChange={(v) => updateNode(node.id, { config: { [f.key]: v } })} />
            ))}
            <details className="advanced"><summary>Advanced (JSON)</summary><pre>{JSON.stringify(node.config, null, 2)}</pre></details>
          </>
        )}
        {tab === 'Connections' && (
          <>
            {[['Outgoing', outgoing], ['Incoming', incoming]].map(([label, list]) => (
              <section key={label as string}>
                <h4 className="group-title">{label as string}</h4>
                {(list as typeof outgoing).length === 0 && <p className="muted">None</p>}
                {(list as typeof outgoing).map((e) => {
                  const other = byId.get(label === 'Outgoing' ? e.target : e.source);
                  return <button key={e.id} className="link-row" onClick={() => select({ edgeId: e.id })}><b>{e.relation}</b> {label === 'Outgoing' ? '→' : '←'} {other?.name ?? '(missing)'}</button>;
                })}
              </section>
            ))}
          </>
        )}
        {tab === 'Effective' && (
          <>
            <p className="hint">Read-only result after active overlays, platform defaults and org policy.</p>
            <table className="eff">
              <thead><tr><th>Setting</th><th>Base</th><th>Effective</th><th>Source</th></tr></thead>
              <tbody>
                {keys.map((k) => {
                  const p = rn.provenance[k];
                  const changed = node.config[k] !== rn.config[k];
                  return (
                    <tr key={k} className={changed ? 'changed' : ''}>
                      <td>{k}</td><td>{node.config[k] === undefined ? '—' : String(node.config[k])}</td><td><b>{String(rn.config[k])}</b></td>
                      <td><span className={`src ${p?.source}`} title={p?.reason}>{p?.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rn.overlayIds.length > 0 && <p className="hint"><Layers size={12} /> Touched by {rn.overlayIds.length} overlay(s).</p>}
          </>
        )}
      </div>
    </>
  );
}

function EdgeInspector({ edgeId }: { edgeId: string }) {
  const { project } = useDerived();
  const { updateEdge, deleteSelection } = useStore();
  const edge = project.graph.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const s = project.graph.nodes.find((n) => n.id === edge.source);
  const t = project.graph.nodes.find((n) => n.id === edge.target);
  const problem = s && t ? relationProblem(edge.relation, s.kind, t.kind) : undefined;
  return (
    <>
      <div className="insp-head"><div><h3>Connection</h3><small>{s?.name} → {t?.name}</small></div></div>
      <div className="insp-body">
        <div className="field"><label htmlFor="e-rel">Relationship type</label>
          <select id="e-rel" value={edge.relation} onChange={(e) => updateEdge(edge.id, { relation: e.target.value as Relation })}>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}{s && t && relationProblem(r, s.kind, t.kind) ? ' (invalid here)' : ''}</option>)}
          </select>
        </div>
        {problem && <div className="finding-inline error" role="alert">{problem}</div>}
        <div className="field"><label htmlFor="e-desc">Description</label>
          <input id="e-desc" value={edge.description ?? ''} onChange={(e) => updateEdge(edge.id, { description: e.target.value })} /></div>
        <p className="hint">Direction is source → target. publishes/subscribes both point from the capability to the bus or queue.</p>
        <button className="btn danger" onClick={deleteSelection}><Trash2 size={14} /> Delete connection</button>
      </div>
    </>
  );
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  if (selection.overlayId) return <aside className="panel inspector"><OverlayEditor overlayId={selection.overlayId} /></aside>;
  if (selection.nodeIds.length === 1) return <aside className="panel inspector"><NodeInspector nodeId={selection.nodeIds[0]} /></aside>;
  if (selection.edgeId) return <aside className="panel inspector"><EdgeInspector edgeId={selection.edgeId} /></aside>;
  if (selection.nodeIds.length > 1) {
    return (
      <aside className="panel inspector"><div className="insp-body">
        <h3>{selection.nodeIds.length} nodes selected</h3>
        <div className="row">
          <button className="btn" onClick={() => useStore.getState().duplicateSelection()}><Copy size={14} /> Duplicate</button>
          <button className="btn danger" onClick={() => useStore.getState().deleteSelection()}><Trash2 size={14} /> Delete</button>
        </div>
      </div></aside>
    );
  }
  return (
    <aside className="panel inspector">
      {mode === 'overlays' ? <ResolvedPreview /> : (
        <div className="insp-body empty-insp">
          <h3>Inspector</h3>
          <p className="muted">Select a capability or connection to edit it. Drag from a node’s right edge to another node to connect them.</p>
          <ul className="shortcuts">
            <li><kbd>Del</kbd> delete</li><li><kbd>Ctrl/⌘ Z</kbd> undo</li><li><kbd>Ctrl/⌘ ⇧ Z</kbd> redo</li>
            <li><kbd>Ctrl/⌘ D</kbd> duplicate</li><li><kbd>Ctrl/⌘ S</kbd> save</li><li><kbd>Esc</kbd> clear</li>
          </ul>
        </div>
      )}
    </aside>
  );
}
