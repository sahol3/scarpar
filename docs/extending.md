# Scarpar — Developer extension guide

This is the **repo-local source of truth** for extending Scarpar — the `scarpar-builder` skill
(`~/.claude/skills/scarpar-builder/`) defers to this file rather than duplicating it. Read
`docs/architecture.md` (binding contract) and `docs/conventions.md` (binding build rules) first; this
doc is recipes on top of those, not a replacement.

## 10-minute codebase tour

Read in this order for a new dev or a new AI session:

1. **`CLAUDE.md`** (repo root) — the fast-path invariants: money=paisa, `verifyPayment()` chokepoint,
   order-item snapshots, the module-add checklist, page/action skeletons.
2. **`docs/architecture.md`** — the full binding contract: route map (§1), module system (§2), the
   entire SQL schema (§3), CMS block model (§4), settings engine (§5), auth/tenancy (§6), payments/fraud
   (§7), couriers (§8), receipts (§9), notifications (§10), reports (§11), storefront (§12), and — most
   important for not inventing fake features — §13 "what is stubbed vs. working."
3. **`docs/conventions.md`** — the concrete file-shape rules: where server actions live, the
   `ActionResult<T>` return shape, zod validation, money formatting, `<StatusBadge>`/`<DataTable>`
   usage, the module folder shape.
4. **`.memory/feature-list.md`** — ground truth on what's actually built vs. config-only vs. deferred,
   verified against the code, not the spec. Read this before claiming any feature exists.
5. **`src/modules/types.ts` + `src/modules/registry.ts` + `src/modules/verticals.ts`** — the three files
   that define the module system's shape; skim them once, they rarely change.
6. **One real module end-to-end** as a template — `src/modules/expenses/` is the smallest complete
   example (see recipe 1 below).

For SaaS/platform work specifically (billing, plans, custom domains, platform ops), start at
`docs/saas-roadmap.md` instead — it's now the canonical plan for that surface; this file's recipes are
for extending the product itself (modules, blocks, verticals, adapters, settings, widgets).

---

## Recipe: add a module

**Smallest example to copy: `src/modules/expenses/`** (4 files, one nav item, one dashboard widget — the
whole surface area a module needs at minimum).

1. **Add the key.** `src/modules/types.ts` — add your key to the `ModuleKey` union.
2. **Write `module.config.ts`.** New `src/modules/<key>/module.config.ts`:
   ```ts
   import type { ModuleDef } from '@/modules/types'
   export const config: ModuleDef = {
     key: '<key>',
     name: '<Display Name>',
     description: '<one line>',
     nav: [{ label: '<Nav Label>', href: '/admin/<route>', icon: '<lucide-icon-name>' }],
     dashboardWidgets: ['<widget-id>'], // omit if none
   }
   ```
   No side effects in this file — it's statically imported by `registry.ts` at build time.
3. **Register it.** `src/modules/registry.ts` — import your `module.config.ts`, add it to `MODULES` and
   `MODULE_LIST`. Then `src/modules/verticals.ts` — add the key to every `VERTICAL_PRESETS[...].modules`
   array that should ship with it (a new module isn't live for any org until it's in at least one
   vertical's array, or an org's `enabled_modules` is edited directly).
4. **RLS + migration.** New tables need a new migration file (`supabase/migrations/000N_<name>.sql`,
   next unused number — see `docs/operations.md` "Migration discipline") with `org_id uuid not null
   references orgs`, `created_at timestamptz default now()`, and RLS following the existing
   `user_org_ids()`/`has_org_role()` SECURITY DEFINER pattern in `0001_core.sql` — do not write ad hoc
   RLS predicates.
5. **Types.** Add the row shape to `src/types/db/*.ts` (grouped by migration file, e.g. `commerce.ts`,
   `delivery.ts`) matching the new table exactly.
6. **Build the module folder**: `actions.ts` (`'use server'`, `ActionResult<T>` returns, `requireOrg()` +
   `requireRole()` first lines, zod-validated, `audit()`-logged for sensitive mutations), `schemas.ts`
   (zod), `components/*` (client comps for anything interactive).
7. **Build routes.** `src/app/(admin)/admin/<route>/` — thin page files, `export const dynamic =
   'force-dynamic'`, `const ctx = await requireOrg(); requireModule(ctx.org, '<key>')` as the first line
   of every page.
8. **Never edit** `src/modules/registry.ts`'s existing entries, shared libs, or another module's files
   while doing this — `docs/conventions.md`'s Modules section is explicit about that boundary.

## Recipe: add a CMS block type

**Smallest example to copy: `faq`** (2 fields, no media, no conditional rendering — the plainest block
in the 11-type set defined in `docs/architecture.md` §4).

Four touchpoints, all required or the block silently can't be added/edited/rendered:

1. **Type.** `src/types/db/cms.ts` — add the new variant to the `CmsBlock` discriminated union
   (`_key: string; _type: '<name>'; ...props`).
2. **Registry.** `src/modules/cms/components/block-meta.ts` — add to `BLOCK_TYPES` (makes it choosable
   in the "add block" menu), `BLOCK_LABELS` (display name), a case in `blockSummary()` (the one-line
   summary shown on the block's card in the editor's left column), and a case in `createBlock()` (the
   default/empty shape when a user adds one).
3. **Editor form.** `src/modules/cms/components/block-form.tsx` — add the per-type edit form (fields for
   whatever props the block needs).
4. **Storefront render.** `src/components/store/blocks/render-blocks.tsx` — add the switch case that
   actually renders the block on the public storefront.

Draft edits live in `cms_pages.draft_blocks`; Publish copies `draft_blocks` → `blocks`, stamps
`published_at`, and snapshots into `cms_revisions` (last 20 kept) — none of that needs touching for a
new block type, it's generic over the `blocks jsonb` array.

## Recipe: add a vertical preset

1. **Type.** `Vertical` union — find it via `src/types/db/*` (checked in `orgs.vertical` — a Postgres
   `check` constraint in `0001_core.sql`, so a new vertical also needs a migration to widen that
   constraint).
2. **Preset entry.** `src/modules/verticals.ts` `VERTICAL_PRESETS` — add `{ name, description, modules:
   ModuleKey[], icon }`. The `modules` array is the entire definition of what that vertical enables; no
   other file decides this.
3. **Demo seed.** `src/lib/demo-seed.ts` — add a case to `makeMiddleBlock(vertical)` (the CMS home page's
   vertical-specific block, e.g. `productGrid` for ecommerce, `listingsGrid` for realestate) and to the
   switch in the seed dispatcher (~line 347) that seeds sample rows for the vertical's flagship module
   (mirror the smallest existing case — `services` is the leanest: 2 `service_jobs` + 1 `appointment` + 1
   demo customer).
4. **Onboarding UI.** The vertical picker in `src/app/onboarding/` reads `VERTICAL_PRESETS` directly, so
   step 2 alone makes it selectable — no separate onboarding-UI edit needed.

## Recipe: add a courier adapter / payment provider / SMS channel

All three follow the same shape: **a typed interface + a guarded adapter that throws
`ConfigRequiredError` until an org has filled in its config**, per `.memory/decisions.md` #6. This is
what lets the system ship "usable day one" (the `manual` courier / manual-MFS-verify paths) while real
integrations are config-gated, not code-gated.

- **Courier adapter.** Interface: `src/lib/couriers/types.ts` (`CourierAdapter { key, createOrder(),
  getStatus(), zones?() }`). **Smallest example to copy: `src/lib/couriers/manual.ts`** (no config, no
  `ConfigRequiredError` — the trivial case) for the interface shape; **`yalidine.ts`** for a real
  config-gated example (reads `courier_accounts.config`, throws `ConfigRequiredError` if `!is_active`).
  Register in `src/lib/couriers/index.ts`.
- **Payment provider.** No online gateway is wired in v1 — payments are cash-on-delivery only (see
  architecture §7); `src/modules/orders/actions.ts`'s `verifyPayment()` is still the only chokepoint that
  may flip a `payments` row to `verified`. Any new payment path (a future online gateway) must still funnel
  through it — never write directly to `payments.status`. Follow the same `ConfigRequiredError`-guarded
  shape as the courier adapters above for a new provider's config-read pattern.
- **SMS / email channel.** `src/lib/notify.ts` — `ChannelAdapter = (orgId, event, payload) =>
  Promise<void>`. The `sms` and `email` channels currently exist as real adapters with a `console.log` +
  audit-trail v1 driver (per `.memory/feature-list.md`, this is "stubbed execution," not "missing
  interface"). Swap the driver body for a real provider call (e.g. an Algerian SMS gateway for `sms`,
  Resend for `email`); the dispatch/fan-out logic in `notify()` doesn't change.
- **Settings**: every one of these needs config keys — see the next recipe. Don't invent a parallel
  config store; `org_settings` via the registry is the only place org-level config lives.

## Recipe: add a settings key

Single touchpoint, auto-wired everywhere else:

1. Add a `SettingDef` entry to `src/lib/settings/registry.ts`'s `SETTING_DEFS` array: `{ key: '<group>.<name>',
   group: '<one of the 10 SettingGroup values>', label, help?, type: 'boolean'|'number'|'text'|'select'|'json',
   options?, default, roles? }`.
2. That's it for the UI — `/admin/settings` auto-renders every def grouped by `group`, using `type` to
   pick the input control. No component to write.
3. Read it in code via `getSetting<T>(orgId, key)` or the batch `getOrgSettings(orgId)`
   (`src/lib/settings/index.ts`, both `React.cache()`'d) — never read `org_settings` directly.
4. Changes are audit-logged automatically by the settings save action — no extra `audit()` call needed
   in your feature code.
5. `roles` (optional) restricts who can view/edit the key in the UI (e.g. API keys default to
   `['owner','admin']` — see any `courier_accounts.config` field for the pattern). Omit it for anything
   any admin-side role should see.

## Recipe: add a dashboard widget

Four touchpoints:

1. **Widget id.** `src/modules/types.ts` — add the id to the `DashboardWidgetId` union.
2. **Component.** `src/components/admin/widgets/<name>.tsx` — a server component (or client if it needs
   interactivity) that queries its own data (`requireOrg()` for org context) and renders a card. Copy the
   shape of `expenses-month.tsx` for the simplest example (one aggregate query, one `StatCard`-style
   render).
3. **Wire it into the dashboard.** `src/app/(admin)/admin/page.tsx`: add a case to the `renderWidget()`
   switch (returns your component), an entry in `DISPLAY_ORDER` (controls grid position — independent of
   module registration order, tuned for scannability), and a `WIDGET_SPAN` entry (`col-span-*` Tailwind
   classes for its grid cell).
4. **Module config.** Add the widget id to the owning module's `module.config.ts` `dashboardWidgets`
   array — this is what makes `widgetsForOrg()` (`src/lib/modules.ts`) include it for orgs that have that
   module enabled. A widget with no module opted into it never renders, even if steps 1-3 are done.
