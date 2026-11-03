import { useRef, useState } from 'react';
import { CheckCircle2, Download, FilePlus2, MoreHorizontal, PanelLeft, Play, Redo2, ShieldCheck, Undo2, Upload, RotateCcw, FileText } from 'lucide-react';
import { useStore, type Mode } from '../application/store';
import { useDerived } from '../application/derived';
import { parseProject, serializeProject } from '../adapters/persistence';
import { SIM_LABEL } from './PlanView';

const MODES: [Mode, string][] = [['design', 'Design'], ['overlays', 'Overlays'], ['plan', 'Plan & Run']];
const SAVE_TEXT = { saved: 'Saved locally', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed (storage unavailable)' };

export function exportProject() {
  const { project } = useStore.getState();
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}.gnikniht.json`;
  a.click();
  URL.revokeObjectURL(url);
  useStore.getState().log('Exported project JSON');
}

export function TopBar() {
  const { project, errors, warnings, plan, planStale } = useDerived();
  const s = useStore();
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canDeploy = Boolean(plan && plan.status === 'ready' && !planStale);

  const onImport = async (file?: File) => {
    if (!file) return;
    const result = parseProject(await file.text());
    if (result.ok) {
      s.replaceProject(result.project, `Imported ${file.name}`);
      s.setNotice({ kind: 'info', text: `Imported “${result.project.name}”.` });
    } else {
      s.setNotice({ kind: 'error', text: `Import failed — current project kept. ${result.error}` });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <header className="topbar">
      <div className="brand"><span className="logo">G</span><b>GNIKNIHT</b></div>
      <div className="crumb">
        <input className="project-name" aria-label="Project name" value={project.name} onChange={(e) => s.setProjectName(e.target.value)} />
        <span className={`save ${s.saveStatus}`} role="status">{SAVE_TEXT[s.saveStatus]}</span>
      </div>
      <nav className="mode-tabs" aria-label="Mode">
        {MODES.map(([m, label]) => <button key={m} className={s.mode === m ? 'active' : ''} aria-pressed={s.mode === m} onClick={() => s.setMode(m)}>{label}</button>)}
      </nav>
      <div className="actions">
        <button className="icon-btn show-narrow" aria-label="Toggle capability palette" onClick={() => s.setPaletteOpen(!s.paletteOpen)}><PanelLeft size={16} /></button>
        <button className="icon-btn" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={!s.past.length} onClick={s.undo}><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label="Redo" title="Redo (Ctrl/⌘ ⇧ Z)" disabled={!s.future.length} onClick={s.redo}><Redo2 size={16} /></button>
        <button className="btn" onClick={() => { s.setDrawer(true, 'validation'); s.log(`Validated: ${errors} error(s), ${warnings} warning(s)`); }}><ShieldCheck size={14} /> Validate</button>
        <button className="btn" onClick={s.generatePlan}><FileText size={14} /> Generate plan</button>
        <div className="deploy-wrap">
          <button className="btn primary" disabled={!canDeploy} onClick={s.runSimulation} title={canDeploy ? SIM_LABEL : 'Generate a valid plan first'}><Play size={14} /> Deploy simulation</button>
          <small className="sim-note">Simulation only — no cloud resources are created</small>
        </div>
        <div className="menu-wrap">
          <button className="icon-btn" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={16} /></button>
          {menu && (
            <div className="menu" role="menu" onClick={() => setMenu(false)}>
              <button role="menuitem" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import JSON…</button>
              <button role="menuitem" onClick={exportProject}><Download size={14} /> Export JSON</button>
              <button role="menuitem" onClick={() => setConfirmReset(true)}><RotateCcw size={14} /> Reset demo project</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import project JSON" onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
      </div>
      {confirmReset && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm reset">
          <div className="modal">
            <h3><FilePlus2 size={16} /> Reset demo project?</h3>
            <p>This replaces your current project with the Customer Notifications starter. Export first if you want to keep your work.</p>
            <div className="row end">
              <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn danger" onClick={() => { s.resetDemo(); setConfirmReset(false); }}><CheckCircle2 size={14} /> Reset</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
