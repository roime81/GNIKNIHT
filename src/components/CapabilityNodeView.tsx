import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import { CATALOG, summaryChips } from '../domain/catalog';
import type { CapabilityKind, NodeConfig } from '../domain/types';
import { CATEGORY_COLOR, KIND_ICON } from './icons';

export type CapabilityNodeData = {
  kind: CapabilityKind;
  name: string;
  config: NodeConfig;
  status: 'valid' | 'warning' | 'error';
  overlayNames: string[];
} & Record<string, unknown>;

export type CapabilityFlowNode = Node<CapabilityNodeData, 'capability'>;

const STATUS_LABEL = { valid: 'Valid', warning: 'Has warnings', error: 'Has errors' };

export function CapabilityNodeView({ data, selected }: NodeProps<CapabilityFlowNode>) {
  const def = CATALOG[data.kind];
  const Icon = KIND_ICON[data.kind];
  const color = CATEGORY_COLOR[def.category];
  return (
    <div className={`cap-node${selected ? ' selected' : ''}`} style={{ ['--accent' as string]: color }} data-testid={`node-${data.name}`}>
      <Handle id="l" type="target" position={Position.Left} />
      <div className="cap-node-head">
        <span className="cap-node-icon"><Icon size={18} /></span>
        <div className="cap-node-titles">
          <div className="cap-node-name">{data.name}</div>
          <div className="cap-node-kind">{def.label} · {def.category}</div>
        </div>
        <span className={`dot ${data.status}`} title={STATUS_LABEL[data.status]} role="img" aria-label={STATUS_LABEL[data.status]} />
      </div>
      <div className="chips">
        {summaryChips(data.kind, data.config).map((c) => <span className="chip" key={c}>{c}</span>)}
        {data.overlayNames.length > 0 && (
          <span className="chip overlay" title={`Affected by: ${data.overlayNames.join(', ')}`}>
            <Layers size={11} /> {data.overlayNames.length}
          </span>
        )}
      </div>
      <Handle id="r" type="source" position={Position.Right} />
    </div>
  );
}
