# Scarpar — Template → commercial SaaS conversion plan

Effort tags: **S** = hours, **M** = 1-3 days, **L** = 1+ week. Each item names the existing hook it
builds on and the files it touches. Grounded against the code as of 2026-07-12 (see
`.memory/feature-list.md` for the honesty line on what's built/stubbed/deferred) — do not assume the
spec (`D:\CLAUDE-CODE\scarper\features.md`) is already implemented; it is the north star, not the
current state.

## Ordering rationale

A before D: you cannot sell plans (D, white-label) before you can *charge* for them and *stop* non-
payers (A). B before C: self-serve signup is worthless if abuse fills the org table before there's an
admin surface to police it (C). C before D/E: platform ops (impersonation, usage visibility) is how you
diagnose problems in the custom-domain and trust-hardening phases — build the cockpit before the cockpit
needs instruments. E (trust) is not last because it's optional — it's ordered last because until A-D
exist there is nothing paying and nothing public-facing to protect; a pre-revenue template doesn't need
Sentry or 2FA yet, but the day Phase A ships a real paying org, E's items become blocking, not optional.
F is explicitly deferred — building for >50-org scale before there are 5 paying orgs is waste per the
spec's own tiering (§23 Should/Advanced).

## What NOT to build yet (per phase)

- **A**: no Stripe integration yet (BD-first; intl billing is a real gap but not the first paying
  customer's blocker), no usage-based billing, no annual-plan proration logic.
- **B**: no SSO/SAML, no team-seat billing tiers, no self-serve plan *downgrade* flow (manual for now).
- **C**: no analytics warehouse — computed on read from existing tables, not a new pipeline.
- **D**: no per-org CDN/edge config, no multi-region hosting — Vercel's default is enough at this scale.
- **E**: no SOC2/compliance program, no bug bounty, no dedicated on-call rotation.
- **F**: none of this until org count or query latency actually demands it — see spec §23's own
  Should/Advanced tiering, which times these to >50 orgs / >5k SKUs.

---

## PHASE A — Monetization core

The only hook that currently exists for this is `orgs.plan text default 'free'`
(`supabase/migrations/0001_core.sql`) — it is unenforced free text today; nothing reads it to gate
anything (confirmed: no `plan` reads outside display in `src/app/(admin)/admin/platform/page.tsx` and
`orgs-table.tsx`).

1. **[M] Plans/entitlements table.** Add `supabase/migrations/0005_billing.sql`: a `plans` table
   (`key`, `name`, `price_paisa`, `limits jsonb`, `available_modules text[]`) plus a `feature_flags`
   table shaped like spec §17.1 (`key`, `default_value`, `available_on_plans text[]`). Map flags onto
   the *existing* `enabled_modules text[]` column and `SETTING_DEFS` groups
   (`src/lib/settings/registry.ts`) rather than inventing a parallel config system — a flag either gates
   whether a `ModuleKey` can be enabled for an org, or gates one `SettingDef`. Do not build the spec's
   full three-layer (plan/tenant/user-rollout) system yet — Scarpar has no per-user rollout use case
   today; two layers (plan, org) is enough.
2. **[S] `requirePlan()`/`planAllows()` helper.** New `src/lib/billing/entitlements.ts`, mirroring the
   shape of `requireModule()` (`src/lib/auth.ts` pattern) — `requirePlan(ctx, 'growth')` throws/redirects
   the same way `requireRole` does. Call it from the module-enable action (wherever an admin flips
   `enabled_modules` — currently unrestricted) and from onboarding's vertical picker.
3. **[M] Billing = manual bank transfer first.** Stripe is not the first move for an Algeria-first
   platform. Cheapest path that reuses existing machinery — model a platform subscription charge as an
   `order` against a platform-owned org (reuses `orders`, `payments`, `verifyPayment()` chokepoint in
   `src/modules/orders/actions.ts` — the same manual bank-transfer-verify flow customers already use), OR a
   dedicated `platform_invoices` table if overloading `orders` proves awkward. Either way: manual bank
   transfer verify by a platform admin is the v1 collection mechanism. Stripe/intl is Phase A follow-up, not
   day one.
4. **[S] Subscription state on `orgs`.** Extend `orgs` (migration 0005): `subscription_status`
   (`trialing|active|past_due|suspended`), `current_period_end`, `plan_key` (replaces the free-text
   `plan` or keeps it as display name). Grace logic: a cron/edge function (see Phase F note on job
   infra — until then, a manual/scheduled script) flips `is_active=false` on expiry, which *already*
   blocks admin access and storefront checkout (see `docs/operations.md` "what suspension blocks" —
   verified precisely there) — this is the one entitlement lever that already works end-to-end today.
5. **[S] Platform pricing page.** New public route `src/app/(marketing)/pricing/page.tsx` (or add to the
   existing `(auth)` group) reading the `plans` table server-side. No new component system needed —
   reuse `@/components/ui/*` primitives per `docs/conventions.md`.

## PHASE B — Self-serve hardening

6. **[S] Signup abuse controls.** `src/app/(auth)/signup` — add Supabase rate limiting (built-in
   Auth rate limits, config not code) + turn on "Confirm email" in Supabase Auth settings (currently
   documented in `docs/deployment.md` as optional/off for fastest onboarding — flip the default once
   self-serve is public). Add an org-count-per-user cap in the onboarding server action
   (`src/app/onboarding/actions.ts` equivalent) — reject at N orgs per `auth.users.id` unless platform
   admin.
7. **[M] Onboarding polish.** Existing wizard (`src/app/onboarding/page.tsx`) picks vertical + optional
   demo seed (`src/lib/demo-seed.ts`). Add: plan selection step, org-slug collision-friendly UX (slug
   uniqueness already enforced at the DB level per `orgs.slug unique`).
8. **[S] Empty-plan trial logic.** Free/trial plan = a row in the new `plans` table with a
   `trial_days` field; `current_period_end` set at org creation from it (ties into item 4).
9. **[M] Org deletion/export.** No cascade-delete path exists today (`.memory/decisions.md` doesn't
   address it; nothing in `src/modules/platform/actions.ts` deletes an org). Build: (a) export — a
   server action that dumps every `org_id`-scoped table to CSV/JSON via the same tables listed in
   `docs/architecture.md` §3, reusing the CSV-export pattern already in
   `src/app/api/export/[report]/route.ts`; (b) delete — cascade order matters because FKs aren't
   `on delete cascade` everywhere (verify per-table before writing the migration); document the manual
   order in `docs/operations.md` (already done there) and automate it as a platform-admin-only action.
10. **[M] Quota enforcement.** Per-plan limits in `plans.limits jsonb` (e.g. `{max_products, max_orders_per_month,
    max_storage_mb}`). Enforce with a count check at the top of the relevant `actions.ts` create function —
    e.g. `src/modules/catalog/actions.ts` product-create checks `count(products) < limit` before insert.
    Storage quota needs a running total; cheapest v1 is a scheduled count against the `media` table
    (`size int` column already exists per `docs/architecture.md` §3) rather than a live counter.

## PHASE C — Platform operations

Builds directly on `/admin/platform` (`src/app/(admin)/admin/platform/page.tsx`) and
`src/modules/platform/{actions.ts,components/orgs-table.tsx}` — today this page does exactly two
things: lists orgs with member/order counts, and toggles `is_active` via `OrgActiveSwitch`
(`src/modules/platform/actions.ts` line ~53). Everything below extends that same page and module.

11. **[M] Usage metrics per org.** Add columns/queries to `orgsTable`/`PlatformOrgRow` alongside the
    existing `membersCount`/`ordersCount` pattern (same `head:true` count-query style already used in
    `platform/page.tsx` lines 30-43): orders/mo (date-filtered count), storage (sum of `media.size`),
    plan (`plan_key` from Phase A).
12. **[L] Impersonation with audit trail + banner.** No impersonation exists today. Add a
    platform-admin-only server action that mints a session/cookie scoped to a target org (reuse the
    `scarpar-org` cookie mechanism in `src/lib/auth.ts` + `middleware.ts`, gated by `is_platform_admin()`
    RPC which already exists in `0001_core.sql`), writes an `audit_log` row (existing table, existing
    `audit()` helper per `docs/conventions.md`), and renders a persistent "Impersonating {org}" banner in
    `(admin)/layout.tsx`.
13. **[S] Plan assignment UI.** Add a plan-select column to `OrgsTable` (same component pattern as the
    existing `isActive` switch column) calling a new `updateOrgPlan` action in
    `src/modules/platform/actions.ts`, audit-logged like `toggleOrgActive` already is.
14. **[M] Platform-level analytics.** Cross-org aggregates (total GMV, active-org trend, churn) — SQL-
    in-server-component like the existing per-org `reports` module (`src/modules/reports/`), just scoped
    platform-wide instead of `org_id`-scoped. Reuses the "no chart lib, hand-rolled SVG mini-chart"
    convention (`docs/architecture.md` §11, `src/components/ui/mini-chart.tsx`).
15. **[S] Announcement broadcast to org admins.** The `notifications` table + `notify()` machinery
    already exists and works for in-app notifications (`docs/architecture.md` §10 — `inapp` channel is
    "WORKING", not stubbed). A platform broadcast is a loop over orgs calling `notify(orgId, 'platform_announcement',
    payload)` with a new `NotifyEvent` value — this is close to free given the existing interface.

## PHASE D — Custom domains + white-label

`docs/deployment.md` already sketches the exact steps under "Custom domain per org (documented future —
not built)" — this phase executes that sketch.

16. **[L] Middleware host→org mapping table.** New `custom_domains` table (`org_id`, `hostname` unique,
    `verified bool`). Extend `middleware.ts` (currently only handles admin-auth redirect + org-cookie
    check, ~60 lines) to read `request.headers.get('host')`, look up the org, and rewrite `/` →
    `/s/[org-slug]` for storefront requests — the admin-auth logic in the same file is unaffected and
    should not be touched.
17. **[M] Vercel wildcard/domains API.** Attach verified domains via Vercel's Domains API from a
    platform-admin action; DNS instructions surfaced to the org admin in a new `/admin/storefront/domain`
    page (extends the existing `storefront` module, which already owns `/admin/storefront` theme
    settings).
18. **[M] Per-org theming beyond `primary_color`.** `storefront.primary_color` already exists in
    `SETTING_DEFS` (`src/lib/settings/registry.ts`) and is read by the storefront theme. Add
    `storefront.logo_media_id` (reuse `media` table) and `storefront.font` (select from a fixed list, not
    arbitrary font upload — keeps the "no Puppeteer/heavy deps" mandate). Both are new `SettingDef`
    entries — no new subsystem, same registry pattern documented in `docs/extending.md`.
19. **[S] Remove "Powered by Scarpar" per plan.** Whatever footer branding exists in the storefront
    layout — gate its render on `planAllows(org, 'white_label')` (Phase A's helper).

## PHASE E — Production trust

`.memory/decisions.md` #11 and #18 already flag test framework and monitoring as deferred-by-budget, not
oversight — this phase is where that debt gets paid, timed to when it starts mattering (see ordering
rationale above).

20. **[M] Webhook hardening + chokepoint wiring.** The courier webhook route EXISTS as a guarded stub
    (`src/app/api/webhooks/courier/route.ts` — appends a `delivery_events` note but deliberately never
    mutates status). There is no payment webhook in v1 (payments are COD-only, no online gateway — the
    former UddoktaPay webhook route was removed). This item is the hardening pass for the courier route:
    add per-courier signature/HMAC verification before it's allowed to change `deliveries.status`, and
    add replay-attack + idempotency guards. If/when a payment gateway is added (see item 3), it must wire
    its webhook to `verifyPaymentAction` (the chokepoint) from day one — never bypass it. Overlaps next-steps
    item 3.4.
21. **[M] 2FA for owner role.** Supabase Auth supports TOTP MFA natively — enable it in Auth settings,
    add an enrollment flow gated to `role='owner'` in `/admin/settings` (or a new `/admin/security`
    page), enforce via a `requireMfa()` check alongside the existing `requireRole()` pattern.
22. **[M] Sentry + structured logging.** Nothing is wired today beyond `console.error`
    (`.memory/next-steps.md` §5 confirms this explicitly). Add `@sentry/nextjs`, wrap the existing error
    boundaries, replace ad hoc `console.error` calls in `actions.ts` files incrementally (not a
    blocking rewrite).
23. **[S] Uptime checks.** External (Better Uptime / UptimeRobot / Vercel's own) — no code change,
    config only. Hit `/` and one authenticated admin route.
24. **[M] Automated Supabase backups + restore drill.** `docs/operations.md` covers the mechanics
    (PITR is plan-gated, manual `pg_dump` is the fallback) — this item is *scheduling* that manual
    recipe (cron via a GitHub Action or Supabase's own scheduled backups on a paid plan) and actually
    running one restore drill to prove the recipe works, not just documenting it.
25. **[M] Rate limiting (per-tenant buckets, spec §D8).** No rate limiting exists anywhere in
    `middleware.ts` today. Add an edge-compatible limiter (Upstash Redis or Vercel's own) keyed on
    `org_id` for storefront write paths (checkout, inquiries) — protects against one noisy org's
    checkout script from degrading others, per the spec's explicit tenant-isolation architectural
    decision (§D8).
26. **[L] SMS/email providers live.** The adapter seam already exists and is real, not aspirational:
    `src/lib/notify.ts`'s `ChannelAdapter` type is implemented for `sms`/`email` with a `console.log`
    stub driver (confirmed "STUBBED" not "missing" per `.memory/feature-list.md`). Wire one BD SMS
    provider (BulkSMSBD/AlphaSMS per spec §19) and one email provider (Resend/SES) behind that same
    interface — no new abstraction needed.
27. **[S] Status page.** Static page or a hosted status-page product (Instatus/Better Uptime) pointed at
    the uptime checks from item 23 — no app code.

## PHASE F — Scale-outs (defer until >50 orgs)

Per the spec's own maturity tiers (`scarper/features.md` §23), these are Should/Advanced tier and
explicitly tied to scale thresholds the template hasn't hit yet — do not build ahead of the trigger.

28. **[L] Meilisearch per-tenant indexes (spec §D11).** Trigger: >5k SKUs on any single org (the spec's
    own stated threshold for when Postgres `ILIKE` search — the current, deliberate v1 choice per
    `.memory/decisions.md` — stops being "fine"). One index per org (`products_{org_id}`), not a shared
    index filtered by org — the spec calls this out explicitly as cheaper and leak-proof (§D11).
29. **[M] Background job queue (pg_cron / Edge Functions).** Trigger: Phase A's grace-period cron (item
    4) and Phase E's backup scheduling (item 24) currently assumed as "a script someone runs" — once
    there are enough orgs that manual scheduling is error-prone, formalize into `pg_cron` (Supabase-
    native, no new infra) or Supabase Edge Functions for anything needing external API calls a SQL cron
    can't make.
30. **[M] JWT claim caching of flags (spec §17.1 note).** Only worth doing once entitlement checks
    (`requirePlan`/`requireModule`, Phase A) show up as a real query-volume cost — the spec's own caveat
    (features.md line ~706) is explicit that this trades a DB round trip for a token-refresh-staleness
    problem, and recommends short TTL (5-15 min) or a hybrid re-check for security-sensitive flags. Do
    not add this speculatively.
31. **[L] Read replicas / regional split (spec §D12).** Trigger: real EU/IN/multi-region merchants, per
    spec's own phrasing ("when EU/IN merchants arrive, regional clusters become a routing decision, not
    a rewrite" — §D12). Nothing to build now beyond keeping `orgs` free of region-coupled logic, which
    is already true (no region field exists or is needed yet).
