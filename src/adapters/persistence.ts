import { projectSchema, type GnikProject } from '../domain/types';

export const STORAGE_KEY = 'gnikniht.project.v1';

export type ImportResult = { ok: true; project: GnikProject } | { ok: false; error: string };

export function serializeProject(project: GnikProject): string {
  return JSON.stringify(project, null, 2);
}

/** Validates untrusted JSON. Never throws; the caller keeps the current project on failure. */
export function parseProject(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Not a valid GNIKNIHT project: ${issue.path.join('.') || 'root'} — ${issue.message}` };
  }
  const ids = new Set(result.data.graph.nodes.map((n) => n.id));
  if (ids.size !== result.data.graph.nodes.length) return { ok: false, error: 'Not a valid GNIKNIHT project: duplicate node ids.' };
  return { ok: true, project: result.data };
}

export function saveLocal(project: GnikProject): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): GnikProject | undefined {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return undefined;
    const r = parseProject(text);
    return r.ok ? r.project : undefined;
  } catch {
    return undefined;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
