import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useStore } from '../application/store';
import { useDerived } from '../application/derived';
import { CATALOG } from '../domain/catalog';
import { ALLOWED_KEYS, NON_PATCH_KEYS, SETTING_TYPES } from '../domain/overlaySettings';
import { overlayTargets } from '../domain/resolver';
import { CAPABILITY_KINDS, OVERLAY_KINDS, type CapabilityKind, type Overlay, type OverlayKind } from '../domain/types';
import { ConfigField } from './ConfigField';
import { OVERLAY_ICON } from './icons';
import type { FieldDef } from '../domain/catalog';

function fieldFor(key: string): FieldDef {
  const t = SETTING_TYPES[key];
  if (t === 'number') return { key, label: key, type: 'number' };
  if (t === 'boolean') return { key, label: key, type: 'boolean' };
  return { key, label: key, type: 'select', options: t.enum };
}

function defaultFor(key: string): string | number | boolean {
  const t = SETTING_TYPES[key];
  return t === 'number' ? 1 : t === 'boolean' ? true : t.enum[0];
}

export function OverlayList() {
  const { project, resolved } = useDerived();
  const { select, selection, updateOverlay, moveOverlay, addOverlay } = useStore();
  const sorted = [...project.overlays].sort((a, b) => a.priority - b.priority);
  const [kind, setKind] = useState<OverlayKind>('environment');
  return (
    <aside className="panel palette" aria-label="Overlay layers">
      <div className="panel-title">Overlay layers</div>
      <p className="hint top">Applied bottom-up in priority order on top of the base architecture. Base is never modified.</p>
      <div className="palette-scroll">
        {sorted.map((o, i) => {
          const Icon = OVERLAY_ICON[o.kind];
          const count = project.graph.nodes.filter((n) => overlayTargets(o, n)).length;
          return (
            <div key={o.id} className={`layer${selection.overlayId === o.id ? ' selected' : ''}${o.enabled ? ' on' : ''}`}>
              <button className="layer-main" onClick={() => select({ overlayId: o.id })} aria-label={`Open overlay ${o.name}`}>
                <span className="palette-icon"><Icon size={16} /></span>
                <span><b>{o.name}</b><small>{o.kind} · {count} target{count === 1 ? '' : 's'}{resolved.conflicts.some((c) => c.overlayIds.includes(o.id)) ? ' · conflict' : ''}</small></span>
              </button>
              <div className="layer-actions">
                <button className="icon-btn" aria-label={`Move ${o.name} up`} disabled={i === 0} onClick={() => moveOverlay(o.id, -1)}><ArrowUp size={13} /></button>
                <button className="icon-btn" aria-label={`Move ${o.name} down`} disabled={i === sorted.length - 1} onClick={() => moveOverlay(o.id, 1)}><ArrowDown size={13} /></button>
                <label className="switch" title={o.enabled ? 'Enabled' : 'Disabled'}>
                  <input type="checkbox" checked={o.enabled} aria-label={`Enable ${o.name}`} onChange={(e) => updateOverlay(o.id, { enabled: e.target.checked })} />
                  <span className="slider" />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="add-overlay">
        <select value={kind} onChange={(e) => setKind(e.target.value as OverlayKind)} aria-label="New overlay category">
          {OVERLAY_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <button className="btn" onClick={() => addOverlay(kind)}><Plus size={14} /> Add overlay</button>
      </div>
    </aside>
  );
}

function TargetEditor({ overlay }: { overlay: Overlay }) {
  const { project } = useDerived();
  const update = useStore((s) => s.updateOverlay);
  const t = overlay.target;
  return (
    <div className="field">
      <label htmlFor="ov-target">Targets</label>
      <select id="ov-target" value={t.mode} onChange={(e) => {
        const m = e.target.value;
        update(overlay.id, { target: m === 'all' ? { mode: 'all' } : m === 'nodeIds' ? { mode: 'nodeIds', nodeIds: [] } : { mode: 'capabilityKinds', kinds: [] } });
      }}>
        <option value="all">All nodes</option><option value="nodeIds">Selected nodes</option><option value="capabilityKinds">Capability kinds</option>
      </select>
      {t.mode === 'nodeIds' && (
        <div className="checks">
          {project.graph.nodes.map((n) => (
            <label key={n.id}><input type="checkbox" checked={t.nodeIds.includes(n.id)}
              onChange={(e) => update(overlay.id, { target: { mode: 'nodeIds', nodeIds: e.target.checked ? [...t.nodeIds, n.id] : t.nodeIds.filter((x) => x !== n.id) } })} /> {n.name}</label>
          ))}
        </div>
      )}
      {t.mode === 'capabilityKinds' && (
        <div className="checks">
          {CAPABILITY_KINDS.map((k: CapabilityKind) => (
            <label key={k}><input type="checkbox" checked={t.kinds.includes(k)}
              onChange={(e) => update(overlay.id, { target: { mode: 'capabilityKinds', kinds: e.target.checked ? [...t.kinds, k] : t.kinds.filter((x) => x !== k) } })} /> {CATALOG[k].label}</label>
          ))}
        </div>
      )}
    </div>
  );
}

export function OverlayEditor({ overlayId }: { overlayId: string }) {
  const { project, resolved } = useDerived();
  const { updateOverlay, deleteOverlay, moveOverlay } = useStore();
  const [error, setError] = useState<string>();
  const overlay = project.overlays.find((o) => o.id === overlayId);
  if (!overlay) return null;
  const sorted = [...project.overlays].sort((a, b) => a.priority - b.priority);
  const order = sorted.findIndex((o) => o.id === overlay.id) + 1;
  const keys = Object.keys(overlay.settings).filter((k) => !['override', 'reason'].includes(k));
  const free = ALLOWED_KEYS[overlay.kind].filter((k) => !(k in overlay.settings));
  const conflicts = resolved.conflicts.filter((c) => c.overlayIds.includes(overlay.id));
  const others = [...new Set(conflicts.flatMap((c) => c.overlayIds).filter((id) => id !== overlay.id))];
  const targets = project.graph.nodes.filter((n) => overlayTargets(overlay, n)).length;

  const setSettings = (settings: Record<string, unknown>) => setError(updateOverlay(overlay.id, { settings }));

  return (
    <>
      <div className="insp-head"><div><h3>{overlay.name}</h3><small>{overlay.kind} overlay · priority #{order}</small></div></div>
      <div className="insp-body">
        <div className="field"><label htmlFor="ov-name">Name</label>
          <input id="ov-name" value={overlay.name} onChange={(e) => updateOverlay(overlay.id, { name: e.target.value || overlay.name })} /></div>
        <div className="field inline"><label htmlFor="ov-enabled">Enabled</label>
          <label className="switch"><input id="ov-enabled" type="checkbox" checked={overlay.enabled} onChange={(e) => updateOverlay(overlay.id, { enabled: e.target.checked })} /><span className="slider" /></label></div>
        <div className="row">
          <button className="btn" onClick={() => moveOverlay(overlay.id, -1)} disabled={order === 1}><ArrowUp size={14} /> Lower priority</button>
          <button className="btn" onClick={() => moveOverlay(overlay.id, 1)} disabled={order === sorted.length}><ArrowDown size={14} /> Higher priority</button>
        </div>
        <TargetEditor overlay={overlay} />
        <h4 className="group-title">Settings</h4>
        {keys.length === 0 && <p className="muted">No settings yet.</p>}
        {keys.map((k) => (
          <div key={k} className="setting-row">
            <ConfigField id={`ov-${k}`} field={fieldFor(k)} value={overlay.settings[k] as string | number | boolean} onChange={(v) => setSettings({ ...overlay.settings, [k]: v })} />
            <button className="icon-btn" aria-label={`Remove ${k}`} onClick={() => { const { [k]: _gone, ...rest } = overlay.settings; void _gone; setSettings(rest); }}><Trash2 size={13} /></button>
          </div>
        ))}
        {free.length > 0 && (
          <div className="row">
            <select aria-label="Add setting" value="" onChange={(e) => e.target.value && setSettings({ ...overlay.settings, [e.target.value]: defaultFor(e.target.value) })}>
              <option value="">+ Add setting…</option>
              {free.map((k) => <option key={k} value={k}>{k}{NON_PATCH_KEYS.includes(k) ? ' (project-level)' : ''}</option>)}
            </select>
          </div>
        )}
        {error && <div className="field-error" role="alert">{error}</div>}
        <div className="field inline"><label htmlFor="ov-override">Override conflicts</label>
          <label className="switch"><input id="ov-override" type="checkbox" checked={overlay.settings.override === true} onChange={(e) => setSettings({ ...overlay.settings, override: e.target.checked })} /><span className="slider" /></label></div>
        <div className="field"><label htmlFor="ov-reason">Reason</label>
          <input id="ov-reason" value={typeof overlay.settings.reason === 'string' ? overlay.settings.reason : ''} onChange={(e) => setSettings({ ...overlay.settings, reason: e.target.value })} />
          <div className="field-help">Required context when overriding a lower-priority overlay.</div></div>

        <h4 className="group-title">Impact</h4>
        <p className="muted">{overlay.enabled ? `Affects ${targets} node(s).` : 'Disabled — no effect on the resolved architecture.'}</p>
        {conflicts.length > 0 && (
          <div className="conflict-box" role="alert">
            <b><AlertTriangle size={14} /> {conflicts.length} conflict(s)</b>
            <ul>{conflicts.slice(0, 4).map((c) => <li key={c.nodeId + c.key}>{c.message}</li>)}</ul>
            <div className="row">
              {others.map((id) => {
                const o = project.overlays.find((x) => x.id === id);
                return o ? <button key={id} className="btn" onClick={() => updateOverlay(id, { enabled: false })}>Disable {o.name}</button> : null;
              })}
              <button className="btn" onClick={() => updateOverlay(overlay.id, { enabled: false })}>Disable {overlay.name}</button>
            </div>
          </div>
        )}
        <button className="btn danger" onClick={() => deleteOverlay(overlay.id)}><Trash2 size={14} /> Delete overlay</button>
      </div>
    </>
  );
}

export function ResolvedPreview() {
  const { resolved, project } = useDerived();
  const names = new Map(project.graph.nodes.map((n) => [n.id, n.name]));
  return (
    <div className="insp-body">
      <h3>Resolved preview</h3>
      <p className="hint">Effective settings after active overlays. Base graph is unchanged.</p>
      {resolved.conflicts.length > 0 && (
        <div className="conflict-box" role="alert"><b><AlertTriangle size={14} /> {resolved.conflicts.length} unresolved conflict(s)</b>
          <p>Select an overlay and disable one of the conflicting layers, or set an override with a reason.</p></div>
      )}
      {resolved.changes.length === 0 && <p className="muted">No overlay changes yet. Enable an overlay to see what changes.</p>}
      <ul className="changes">
        {resolved.changes.map((c) => (
          <li key={c.nodeId + c.key}><b>{names.get(c.nodeId)}</b> · {c.key}: <s>{c.from === undefined ? '—' : String(c.from)}</s> → <b>{String(c.to)}</b><span className="src overlay">{c.source.label}</span></li>
        ))}
      </ul>
    </div>
  );
}
