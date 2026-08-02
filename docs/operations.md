# Scarpar — Production runbook

Companion to `docs/deployment.md` (initial setup) — this covers running Scarpar after it's live.
Grounded against the code as of 2026-07-12; where behavior is "verified precisely" below it was traced
in the actual source, not assumed from the architecture spec.

## Migration discipline going forward

Current state: 4 migrations (`supabase/migrations/0001_core.sql` → `0004_storefront_public_org_read.sql`),
applied in order via SQL Editor or `supabase db push`, no rollback tooling, no migration-runner CI step.

- **One file per change, numbered sequentially** (`0005_*.sql`, `0006_*.sql`, ...). Never renumber or
  reorder — apply order is the filename order, and anyone who already ran `0001`-`0004` must be able to
  apply only the new file.
- **Never edit an applied migration file.** If `0001_core.sql` needs a fix after it's live anywhere,
  write `0005_fix_x.sql` with the correction (e.g. `alter table` / backfill), even if it feels like the
  "real" fix belongs in `0001`. Editing history breaks anyone who already applied it and breaks the
  "apply in order" contract for new deployments.
- **Apply order**: SQL Editor, paste-and-run in numeric order, or `supabase link && supabase db push`
  (the CLI path — respects filename order automatically). RLS is `ON` for every new table by default
  (per `docs/architecture.md` §3's standing pattern) — do not ship a migration that skips it.
- **Staging first.** There is no staging Supabase project wired today (single project, single `.env.local`
  target per `docs/deployment.md`). Before this repo carries real paying orgs: stand up a second Supabase
  project as staging, apply new migrations there first, smoke-test (`docs/deployment.md`'s post-deploy
  checklist), then apply to production. Until that exists, treat every migration as production-bound and
  review it accordingly.
- **Every table still needs**: `org_id uuid not null references orgs`, `created_at timestamptz default
  now()`, RLS with the `user_org_ids()` / `is_org_member()` / `has_org_role()` SECURITY DEFINER helper
  pattern already established in `0001_core.sql` — new migrations should reuse those helpers, not
  redefine tenancy checks inline.

## Tenant lifecycle

### Create
Self-serve via `/signup` → `/onboarding` (vertical picker + optional demo seed via
`src/lib/demo-seed.ts`). No platform-admin action creates an org today — `/admin/platform`
(`src/app/(admin)/admin/platform/page.tsx`) is read + `is_active` toggle only, per
`src/modules/platform/components/orgs-table.tsx` and `src/modules/platform/actions.ts`.

### Suspend (`orgs.is_active = false`)
Flip via the `OrgActiveSwitch` on `/admin/platform` → `toggleOrgActive` action
(`src/modules/platform/actions.ts` ~line 53), which is audit-logged (`before`/`after` on `is_active`).
**What this precisely blocks today** (traced in code, not assumed):
- **Admin app access**: `requireOrg()` (`src/lib/auth.ts` ~line 66) queries `orgs` with
  `.eq('is_active', true)`. When the org is inactive the query returns no row, and `requireOrg()`
  **redirects to `/onboarding`** — not a "your account is suspended" message. A suspended org's admin
  users land on the onboarding wizard with no explanation. This is a real UX gap worth fixing before
  suspension is used punitively rather than just as an internal kill switch (see Phase B, "org deletion/
  export" area of `docs/saas-roadmap.md` for the related quota/lifecycle work — a dedicated
  "suspended" screen is a good `[S]` add-on there).
- **Storefront**: `getStoreOrg()` (`src/components/store/get-store-org.ts`) filters
  `.eq('is_active', true)`; a suspended org's storefront pages call the caller's `notFound()` → a plain
  Next.js 404, again with no "this store is currently unavailable" messaging.
- **Storefront checkout**: `src/modules/storefront/actions.ts` (~line 58) re-checks `is_active` before
  placing an order — belt-and-braces against a cached/stale page still showing a checkout form.
- **Invite acceptance**: `src/app/(auth)/invite/[token]/page.tsx` checks the org's `is_active` before
  letting a new staff member accept an invite to it.
- **What it does NOT block**: existing Supabase Auth sessions aren't revoked, and RLS itself does not
  check `is_active` — RLS policies check `org_id in (select user_org_ids())`, which is membership, not
  activity. A suspended org's data is still fully queryable via direct RLS-scoped access (e.g. a
  hypothetical public API) — the `is_active` gate lives in app-layer queries (`requireOrg`, `getStoreOrg`,
  checkout), not in the database policies. **Do not treat `is_active=false` as a security boundary** —
  it's a UX/routing gate, not an RLS-enforced lockout. If suspension needs to be tamper-proof against a
  future public API or webhook surface, that's new RLS work, not already covered.

### Delete
**No automated delete path exists today.** Manual cascade order (derive from FK dependency direction in
`docs/architecture.md` §3 — child tables first, `orgs` row last):
1. Delete rows scoped by `org_id` from every leaf table with a foreign key elsewhere pointing at it —
   in practice this means everything except `orgs` and `profiles` (which is keyed by `auth.users`, not
   `org_id`). Concretely: `order_items`, `order_events`, `payments`, `return_items`, `returns`,
   `inventory_movements`, `product_images`, `product_variants`, `delivery_events`, `cod_settlements`,
   `cms_revisions`, `enrollments`, `lessons`, `appointments`, `inquiries` — then their parents:
   `products`, `orders`, `deliveries`, `cms_pages`, `courses`, `service_jobs`, `listings`, `categories`,
   `customers`, `discounts`, `reviews`, `blocklist`, `menus`, `expenses`, `delivery_zones`, `riders`,
   `courier_accounts`, `doc_sequences`, `org_settings`, `audit_log`, `notifications`, `media`.
2. Delete `org_members` and `invitations` rows for the org.
3. Delete `orgs` storage objects under the `media` bucket's `{org_id}/...` prefix (Supabase Storage —
   not covered by SQL cascade).
4. Delete the `orgs` row itself.
5. **Before doing this manually, verify actual FK `on delete` behavior per table** — the schema listing
   in `docs/architecture.md` §3 does not document cascade rules explicitly; some of the above may already
   cascade automatically via Postgres FK constraints and this list may be over-cautious. Check
   `information_schema.referential_constraints` against the live schema before writing the delete script.
6. This is exactly the gap `docs/saas-roadmap.md` Phase B item 9 (org deletion/export) is scoped to
   close — building an automated, audited version of the above, plus a pre-delete export.

## Backup / restore

- **Supabase PITR (point-in-time recovery)** is a paid-plan feature — confirm the project's plan before
  assuming it's on (`.memory/next-steps.md` §5 flags this as unconfirmed). Free-tier projects have no
  automatic backup.
- **Manual `pg_dump` recipe** (works on any plan): `pg_dump "$SUPABASE_DB_URL" -Fc -f scarpar_backup_$(date +%Y%m%d).dump`
  using the connection string from Supabase dashboard → Project Settings → Database → Connection string
  (use the "direct connection", not the pooler, for `pg_dump`). Restore: `pg_restore -d "$SUPABASE_DB_URL" --clean --if-exists scarpar_backup_*.dump`.
  Run this on a schedule (cron / GitHub Action) until Phase F's job-queue infra exists — see
  `docs/saas-roadmap.md` Phase E item 24 for making this recurring and actually drilling a restore.
- **Storage** (`media` bucket) is not covered by `pg_dump` — back it up separately (`supabase storage`
  CLI or direct S3-compatible sync) if org media matters for DR.

## Env / secret rotation

- Three env vars carry real secrets (`docs/deployment.md`): `NEXT_PUBLIC_SUPABASE_URL` (not secret),
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design, RLS-protected), `SUPABASE_SERVICE_ROLE_KEY`
  (server-only, bypasses RLS entirely — the one that actually matters for rotation).
- **Service-role key rotation**: Supabase dashboard → Project Settings → API → regenerate the
  `service_role` key. Immediately update the Vercel env var (`vercel env` or dashboard) and redeploy —
  every server action using `getAdminClient()` (`src/lib/supabase/admin.ts`) breaks the instant the old
  key is revoked, so this is a "update env, redeploy, confirm, then revoke old key" sequence, not
  "revoke then update."
- Per-org secrets (courier API keys in `courier_accounts.config jsonb`) live in the database, not env
  vars — rotating those is an org-admin self-service action through the existing settings UI, not a
  platform operation. There is no online payment gateway key to rotate in v1 — payments are
  cash-on-delivery-only (see architecture §7).

## Incident basics

- **Payment-verify stuck** (a bank-transfer advance payment sits `pending` past a reasonable window):
  check `payments` table for the row, confirm `verifyPayment()` (`src/modules/orders/actions.ts`)
  chokepoint wasn't bypassed — it's the *only* code path allowed to flip `status→verified` (binding
  invariant, `CLAUDE.md`). There is no payment webhook in v1 (COD-only, no gateway) — manual admin
  verify through the existing UI is the only verification path. Diagnosis: check `payments.provider_ref`
  (the bank transfer reference the customer entered) against the org's bank statement, then verify via
  the admin verify UI (same chokepoint, same audit trail) rather than writing a one-off SQL update.
- **Webhook flood** (courier/payment webhook retries hammering a route): there is no rate limiting in
  `middleware.ts` today (this is exactly `docs/saas-roadmap.md` Phase E item 25's gap) — a flood is
  currently an availability risk, not just noise. Mitigate ad hoc today by adding a per-source IP block
  at Vercel's edge config until Phase E's real rate limiting lands.
- **RLS misfire symptoms**: a user sees no data / an empty table where they expect rows almost always
  means `org_members` doesn't have their `(org_id, user_id)` row, or the `scarpar-org` cookie points at
  an org they've been removed from — `requireOrg()` (`src/lib/auth.ts`) already handles the "removed"
  case by redirecting to `/onboarding`, so a *silent* empty-table symptom (page loads, no redirect, no
  data) points at a client-side org-context mismatch (stale cookie vs. server state), not RLS itself
  being broken — RLS denies are usually loud (empty result set + no data), not partial. Confirm by
  checking `user_org_ids()` RPC output directly against `auth.uid()` in the SQL editor for the affected
  user.

## Upgrade strategy for template-derived client repos

Every client build (per the workspace's `scarpar-builder` skill NEW/INTEGRATE modes) starts as either a
clone of this repo or a copy-in into an existing Next.js site. Once a client repo has diverged with
custom modules/branding:
- **Cherry-pick** platform-level fixes (a bug in `verifyPayment()`, a settings-registry addition, a new
  courier adapter) via `git cherry-pick` from this repo into the client repo, provided the client repo
  kept the same module/file layout (`src/modules/<key>/`, `src/lib/settings/registry.ts`, etc.) — this
  works cleanly for anything that isn't a modules/registry.ts or verticals.ts edit, since those files are
  explicitly "never edit, note instead" per `docs/conventions.md`'s Modules section, meaning client repos
  are less likely to have diverged on them.
- **Re-clone** (rebuild the client's customizations on a fresh clone of this repo) when: the client's
  customizations are small relative to the platform-level changes accumulated since their fork, or when
  a migration-numbering conflict exists (client added their own `0005_*.sql` that collides with a new
  platform `0005_*.sql` — renumbering after the fact is exactly the kind of history-edit this doc's
  Migration Discipline section says not to do to an *applied* migration, so avoid the collision by
  reserving a numbering block per client in the migration filename, or re-clone instead of resolving it
  by hand).
- There is no automated diff/patch tooling for this today — it's manual `git cherry-pick` /
  `git diff`-and-reapply, tracked per client in that client's own `.memory/` or `STATE.md`.

## Monitoring — today vs. Phase E target

- **Today**: `console.error` calls scattered through `actions.ts` files, nothing aggregated, nothing
  alerting (confirmed explicitly in `.memory/next-steps.md` §5 and `.memory/decisions.md` #11 — this is
  a known, budgeted gap, not an oversight). No uptime checks, no structured logs, no error grouping.
- **Phase E target** (`docs/saas-roadmap.md` items 22-23, 27): Sentry (`@sentry/nextjs`) for error
  aggregation and alerting, external uptime checks against `/` and one authenticated admin route, a
  public status page. None of this is built — treat any incident today as "grep Vercel's function logs
  for the relevant `org_id` or timestamp," which is the only observability that currently exists.
