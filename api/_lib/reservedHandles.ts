/**
 * The 46 reserved handles — the ONE first-profit copy (Unit 3 review, fix 6b).
 *
 * Source of truth is the120: RESERVED_HANDLES in
 * `app/fp/lib/fp-public-site-rules.ts`, seeded as `fp_reserved_handles` by
 * migration `supabase/migrations/20260907120000_fp_public_sites.sql` (a
 * the120-side parity test pins seed ⟷ that TS list). This module is the
 * manual cross-repo sync point: change the seed and this list in the same
 * change. Inside first-profit it is enforced twice:
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
] as const;

export const RESERVED_HANDLE_SET: ReadonlySet<string> = new Set(RESERVED_HANDLES);
