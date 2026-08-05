/**
 * StaffWatchtower — the flow-board tab of the staff page.
 *
 * PLACEHOLDER (Unit 3). What exists here is the seam: the tab mounts under the
 * shell's session, takes the shell's tab props like the Suggestions tab does,
 * and owns its own data view-states when it has any. Units 4-5 fill it with the
 * aggregate flow board — per unit task: throughput, median cycle time, and WIP
 * split into active and stalled — scoped to one phase and one criterion at a
 * time. It is aggregate-only; a username appears only inside the WIP
 * drill-down.
 *
 * The cache slot is wired NOW and keyed by criterion (watchtowerCache.ts), so
 * Unit 5 has somewhere to put data and a criterion change invalidates exactly
 * its own entry.
 */
import { STAFF_COPY } from "./staffCopy";
import { STAFF_PANEL_TITLE_ID, type StaffTabProps } from "./staffTypes";
import { watchtowerCacheKey } from "./watchtowerCache";

export function StaffWatchtower({ cache, criterionId }: StaffTabProps) {
  // Unit 5 reads its criterion's entry here; today nothing writes one.
  const pending = cache.read(watchtowerCacheKey(criterionId)) === undefined;
  return (
    <div className="mt-6">
      <h2 id={STAFF_PANEL_TITLE_ID} className="text-lg font-bold text-[hsl(25_34%_20%)]">
        {STAFF_COPY.watchtowerTitle}
      </h2>
      {pending ? <p className="mt-3 text-sm text-ink/60">{STAFF_COPY.watchtowerPending}</p> : null}
    </div>
  );
}
