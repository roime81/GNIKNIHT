import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { askAssistant, DemoAssistantProvider, SUGGESTED_PROMPTS, type AssistantProposal } from '../adapters/assistant';
import { useStore } from '../application/store';
import { useDerived } from '../application/derived';

export function Assistant() {
  const { project } = useDerived();
  const applyProposal = useStore((s) => s.applyProposal);
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<AssistantProposal>();
  const [busy, setBusy] = useState(false);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setProposal(await askAssistant(DemoAssistantProvider, text, { overlays: project.overlays }));
    setBusy(false);
  };

  const names = (ids: string[]) => ids.map((id) => project.overlays.find((o) => o.id === id)?.name ?? id);

  return (
    <aside className="panel inspector" aria-label="Architecture assistant">
      <div className="insp-head"><div><h3><Sparkles size={15} /> Assistant</h3><small>Demo assistant — local rules, no LLM connected</small></div></div>
      <div className="insp-body">
        <div className="field"><label htmlFor="ask">Describe what you need</label>
          <textarea id="ask" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Make this architecture production-ready." /></div>
        <button className="btn primary" disabled={busy || !prompt.trim()} onClick={() => ask(prompt)}>Propose</button>
        <h4 className="group-title">Try</h4>
        {SUGGESTED_PROMPTS.map((s) => <button key={s} className="link-row" onClick={() => { setPrompt(s); ask(s); }}>{s}</button>)}

        {proposal && (
          <div className={`card proposal ${proposal.kind}`} data-testid="proposal">
            <h4>{proposal.title}</h4>
            <p>{proposal.summary}</p>
            {proposal.graph && <p className="muted">Preview: {proposal.graph.nodes.length} nodes, {proposal.graph.edges.length} connections ({proposal.graph.nodes.map((n) => n.name).join(', ')}).</p>}
            {proposal.overlayChanges && <p className="muted">Preview: enable {names(proposal.overlayChanges.enable).join(', ') || 'none'}; disable {names(proposal.overlayChanges.disable).join(', ') || 'none'}.</p>}
            {proposal.kind !== 'unsupported' ? (
              <div className="row">
                <button className="btn primary" onClick={() => { applyProposal(proposal); setProposal(undefined); }}>Apply</button>
                <button className="btn" onClick={() => setProposal(undefined)}>Dismiss</button>
              </div>
            ) : <button className="btn" onClick={() => setProposal(undefined)}>Dismiss</button>}
          </div>
        )}
        <p className="hint">The assistant only proposes changes. Nothing changes until you apply, and it can never deploy.</p>
      </div>
    </aside>
  );
}
