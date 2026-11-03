import { useState } from 'react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Bot, LayoutDashboard, Library, PlayCircle, Settings, X } from 'lucide-react';
import { useStore } from '../application/store';
import { clearLocal } from '../adapters/persistence';

export function Rail() {
  const s = useStore();
  const [settings, setSettings] = useState(false);
  const item = (label: string, Icon: typeof Bot, active: boolean, onClick: () => void) => (
    <button className={`rail-btn${active ? ' active' : ''}`} aria-label={label} title={label} aria-pressed={active} onClick={onClick}><Icon size={20} /></button>
  );
  return (
    <nav className="rail" aria-label="Primary">
      {item('Workspace', LayoutDashboard, s.mode === 'design' || s.mode === 'overlays', () => s.setMode('design'))}
      {item('Catalog', Library, s.paletteOpen && s.mode === 'design', () => { s.setMode('design'); s.setPaletteOpen(!s.paletteOpen); })}
      {item('Assistant', Bot, s.rightPanel === 'assistant', () => s.setRightPanel(s.rightPanel === 'assistant' ? 'inspector' : 'assistant'))}
      {item('Runs', PlayCircle, s.mode === 'plan', () => s.setMode('plan'))}
      <div className="rail-spacer" />
      {item('Settings', Settings, settings, () => setSettings(true))}
      {settings && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="modal">
            <div className="row between"><h3>Settings</h3><button className="icon-btn" aria-label="Close settings" onClick={() => setSettings(false)}><X size={16} /></button></div>
            <p className="muted">GNIKNIHT stores your project in this browser’s local storage only. No accounts, credentials or cloud connections are used.</p>
            <div className="row">
              <button className="btn danger" onClick={() => { clearLocal(); s.resetDemo(); setSettings(false); }}>Clear local data &amp; reset demo</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal">
        <h2>Something went wrong</h2>
        <p>{this.state.error.message}</p>
        <button className="btn" onClick={() => this.setState({ error: undefined })}>Try again</button>
        <button className="btn danger" onClick={() => { clearLocal(); location.reload(); }}>Clear local data &amp; reload</button>
      </div>
    );
  }
}
