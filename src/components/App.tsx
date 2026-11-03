import { useEffect } from 'react';
import { useStore } from '../application/store';
import { Rail, ErrorBoundary } from './Rail';
import { TopBar } from './TopBar';
import { Palette } from './Palette';
import { OverlayList } from './OverlayPanel';
import { ArchitectureCanvas } from './ArchitectureCanvas';
import { Inspector } from './Inspector';
import { Assistant } from './Assistant';
import { PlanView } from './PlanView';
import { Drawer } from './Drawer';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); s.redo(); }
      else if (mod && k === 'd') { e.preventDefault(); s.duplicateSelection(); }
      else if (mod && k === 's') { e.preventDefault(); s.saveNow(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { s.deleteSelection(); }
      else if (e.key === 'Escape') { s.select({}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useShortcuts();
  const { mode, rightPanel, paletteOpen, notice, setNotice } = useStore();
  return (
    <ErrorBoundary>
      <div className="app">
        <Rail />
        <div className="main">
          <TopBar />
          {notice && (
            <div className={`toast ${notice.kind}`} role="status">{notice.text}<button className="link" onClick={() => setNotice(undefined)}>Dismiss</button></div>
          )}
          <div className="workspace">
            {mode === 'design' && paletteOpen && <Palette />}
            {mode === 'overlays' && <OverlayList />}
            <main className="center">
              {mode === 'plan' ? <PlanView /> : <ArchitectureCanvas />}
            </main>
            {mode !== 'plan' && (rightPanel === 'assistant' ? <Assistant /> : <Inspector />)}
          </div>
          <Drawer />
        </div>
      </div>
    </ErrorBoundary>
  );
}
