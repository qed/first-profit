/**
 * The suggestions wire shape and its defensive parse.
 *
 * Its own module so the tab component file exports a component and nothing
 * else (react-refresh/only-export-components), and so the parse is unit
 * testable without mounting anything.
 *
 * Contract: 200 {ok:true, suggestions:[{id, kind:'task'|'app', taskId,
 * username, body, createdAt}]} newest-first (cap 200).
 */
import type { FeedbackKind } from "../../lib/sync";

export interface StaffSuggestion {
  id: string;
  kind: FeedbackKind;
  taskId: string;
  username: string;
  body: string;
  createdAt: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** A malformed entry is skipped, never a crash; a malformed body is empty. */
export function parseSuggestions(raw: unknown): StaffSuggestion[] {
  if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.suggestions)) return [];
  const rows: StaffSuggestion[] = [];
  for (const r of raw.suggestions) {
    if (
      isRecord(r) &&
      typeof r.id === "string" &&
      (r.kind === "task" || r.kind === "app") &&
      typeof r.taskId === "string" &&
      typeof r.username === "string" &&
      typeof r.body === "string" &&
      typeof r.createdAt === "string"
    ) {
      rows.push({
        id: r.id,
        kind: r.kind,
        taskId: r.taskId,
        username: r.username,
        body: r.body,
        createdAt: r.createdAt,
      });
    }
  }
  return rows;
}
