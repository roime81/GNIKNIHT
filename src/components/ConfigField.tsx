import { useEffect, useState } from 'react';
import type { FieldDef } from '../domain/catalog';
import type { ConfigValue } from '../domain/types';

interface Props {
  field: FieldDef;
  value: ConfigValue | undefined;
  onChange(v: ConfigValue): void;
  id: string;
}

export function ConfigField({ field, value, onChange, id }: Props) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => setDraft(String(value ?? '')), [value]);

  let control;
  let error: string | undefined;
  if (field.type === 'boolean') {
    control = (
      <label className="switch">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider" />
      </label>
    );
  } else if (field.type === 'select') {
    control = (
      <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (field.type === 'number') {
    const n = Number(draft);
    if (draft.trim() === '' || Number.isNaN(n)) error = 'Enter a number.';
    else if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) error = `Must be between ${field.min} and ${field.max}.`;
    control = (
      <input
        id={id} type="number" value={draft} min={field.min} max={field.max} step="any" aria-invalid={Boolean(error)}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && !Number.isNaN(v)) onChange(v);
        }}
      />
    );
  } else {
    control = <input id={id} type="text" value={draft} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} />;
  }

  return (
    <div className={`field${field.type === 'boolean' ? ' inline' : ''}`}>
      <label htmlFor={id}>{field.label}</label>
      {control}
      {error && <div className="field-error" role="alert">{error}</div>}
      {field.help && !error && <div className="field-help">{field.help}</div>}
    </div>
  );
}
