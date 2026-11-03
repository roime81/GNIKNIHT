import { useState } from 'react';
import { Search } from 'lucide-react';
import { CATALOG, CATEGORIES } from '../domain/catalog';
import { CAPABILITY_KINDS } from '../domain/types';
import { useStore } from '../application/store';
import { CATEGORY_COLOR, KIND_ICON } from './icons';
import { canvasApi, DRAG_MIME } from './ArchitectureCanvas';

export function Palette() {
  const [q, setQ] = useState('');
  const addNode = useStore((s) => s.addNode);
  const term = q.trim().toLowerCase();
  return (
    <aside className="panel palette" aria-label="Capability palette">
      <div className="panel-title">Capabilities</div>
      <label className="search">
        <Search size={14} />
        <input placeholder="Find a capability…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a capability" />
      </label>
      <div className="palette-scroll">
        {CATEGORIES.map((cat) => {
          const items = CAPABILITY_KINDS.filter((k) => CATALOG[k].category === cat && (!term || `${CATALOG[k].label} ${CATALOG[k].description}`.toLowerCase().includes(term)));
          if (!items.length) return null;
          return (
            <section key={cat}>
              <h4 className="group-title">{cat}</h4>
              {items.map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <button
                    key={k} className="palette-item" draggable title={`${CATALOG[k].description} — click to add or drag onto the canvas`}
                    onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, k); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => addNode(k, canvasApi.center?.())}
                    style={{ ['--accent' as string]: CATEGORY_COLOR[cat] }}
                  >
                    <span className="palette-icon"><Icon size={16} /></span>
                    <span><b>{CATALOG[k].label}</b><small>{CATALOG[k].description}</small></span>
                  </button>
                );
              })}
            </section>
          );
        })}
        {term && !CAPABILITY_KINDS.some((k) => `${CATALOG[k].label} ${CATALOG[k].description}`.toLowerCase().includes(term)) && <p className="muted pad">No capability matches “{q}”.</p>}
      </div>
      <p className="hint">Values are demo defaults, not production recommendations.</p>
    </aside>
  );
}
