/**
 * The 49 reserved handles — the ONE first-profit copy (Unit 3 review, fix 6b).
 *
 * Source of truth is the120: RESERVED_HANDLES in
 * `app/fp/lib/fp-public-site-rules.ts`, seeded into `fp_reserved_handles` by
 * `supabase/migrations/20260907120000_fp_public_sites.sql` (the original 48)
 * plus one migration per later addition — `20260916120000_fp_reserved_handle_auth.sql`
 * added `auth` (v3 Unit 6). A the120-side parity test pins the UNION of every
 * migration's seed ⟷ that TS list. This module is the manual cross-repo sync
 * point: A NEW HANDLE NEEDS ALL THREE — the120's TS list, a the120 migration
 * seeding it, and this list — in the same change. (Unit 6 review, FIX 1: `auth`
 * shipped here and in vercel.json but NOT in the seed, so the DB, which is the
 * real claim authority, would still have let a learner claim it.)
 * Inside first-profit it is enforced twice:
 *   - `api/_lib/__tests__/vercelConfig.test.ts` pins vercel.json's
 *     negative-lookahead alternation against exactly this list;
 *   - `decideSiteRequest` refuses reserved handles before any RPC
 *     (defense-in-depth for direct /api/site invocations that bypass the
 *     rewrite's exclusions — the DB reserved guard would return zero rows
 *     anyway, but we never spend an RPC learning that).
 */
export const RESERVED_HANDLES = [
  // routes (single-segment paths on firstprofit.school)
  "signup",
  "login",
  "logout",
  "verify",
  // The handoff sign-in entry point lives at /auth/enter (v3 Unit 6). The route
  // is multi-segment so it needs no rewrite change — but `auth` is reserved
  // anyway so no kid's public site can sit ONE SEGMENT ABOVE a sign-in surface
  // on the same origin.
  "auth",
  "app",
  "parent",
  "admin",
  "account",
  "settings",
  // serving infrastructure
  "api",
  "assets",
  "static",
  "public",
  "index",
  "home",
  "site",
  "sites",
  "www",
  "root",
  "status",
  "health",
  "robots",
  "sitemap",
  "favicon",
  // brand / ops / impersonation
  "firstprofit",
  "first-profit",
  "the120",
  "school",
  "about",
  "contact",
  "help",
  "support",
  "staff",
  "official",
  "security",
  "abuse",
  "terms",
  "privacy",
  "legal",
  "mail",
  "email",
  "blog",
  "docs",
  "news",
  "shop",
  "store",
  // marketing placeholder URLs: src/screens/Landing.tsx renders the literal
  // URLs firstprofit.school/your-name (hero mockup) and
  // firstprofit.school/their-name (steps copy) — neither may ever become a
  // real child's page (Unit 7; reserved before claiming is enabled anywhere).
  "your-name",
  "their-name",
] as const;

export const RESERVED_HANDLE_SET: ReadonlySet<string> = new Set(RESERVED_HANDLES);
