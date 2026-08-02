# Scarpar — Build Conventions (BINDING for every slice)

Read docs/architecture.md and docs/design-system.md first. Deviations are bugs.

## Data access
- Admin pages/components: server components using `getServerClient()` (cookie session, RLS enforced).
  NEVER query Supabase from the browser with the anon key in admin. Client components receive data as props
  or call server actions.
- Storefront reads: server components with `getAnonClient()`. Storefront writes (place order, inquiry):
  server actions using `getAdminClient()` (service role) with explicit org scoping + zod validation +
  server-side price recomputation. Never trust client totals.
- `src/lib/supabase/`: `server.ts` (getServerClient — createServerClient from @supabase/ssr, cookies()),
  `admin.ts` (getAdminClient — service role, server-only import), `client.ts` (browser client, used ONLY
  for auth forms + realtime if needed), `anon.ts` (getAnonClient for public pages). All read env via
  `src/lib/env.ts` which falls back to `https://placeholder.supabase.co` / `placeholder-key` so `next build`
  succeeds without credentials.

## Pages
- EVERY page under (admin), (store), (print): `export const dynamic = 'force-dynamic'`.
- Admin page skeleton: `const ctx = await requireOrg(); requireModule(ctx.org, 'catalog');` then queries.
- Page files stay thin; UI lives in `src/modules/<key>/components/*` (client comps marked 'use client').
- Loading: use skeleton components; wrap slow lists in <Suspense> where trivial, else plain await.

## Server actions
- Location: `src/modules/<key>/actions.ts` with `'use server'` at top.
- Shape: `export async function xAction(input: XInput): Promise<ActionResult<T>>` where
  `ActionResult<T> = { ok: true; data?: T } | { ok: false; error: string }` (type in src/lib/types.ts).
- First lines: `const ctx = await requireOrg()` (+ `requireRole(ctx,'manager')` for sensitive ops).
- Validate with zod schema from `src/modules/<key>/schemas.ts`. try/catch everything; return errors, don't throw.
- Mutations on orders/payments/settings/staff/deliveries: append `audit(ctx, action, entity, id, before, after)`
  (src/lib/audit.ts) and `revalidatePath(...)` after write.

## Money & formatting
- DB bigint paisa (smallest-unit convention; column/function names kept for stability, currency is now DZD)
  → TS `number`. `formatMoney(amount)` → "دج 1,234.50" (src/lib/money.ts), `toPaisa()`,
  `moneyToWords(amount)` (French word-numbering — used for receipt amount-in-words). Money table cells:
  right-aligned + `tabular-nums`.
- Dates: date-fns, format 'd MMM yyyy' / 'd MMM, h:mm a'. Timezone = org.timezone display only.

## UI
- Import primitives from `@/components/ui/*` (shadcn-style). DataTable wrapper for all lists
  (`@/components/ui/data-table` — TanStack, props: columns, data, searchKey?, toolbar?).
- Status badges: ALWAYS via `<StatusBadge kind="order" value={status}/>` backed by `src/lib/status.ts`
  maps (label + variant per entity: order, payment, delivery, product, return, job, listing, review).
- Icons: lucide-react, 16px (`className="size-4"`). Page layout: `<PageHeader title actions>` + content.
- Empty states: `<EmptyState icon title description action?>`. Forms: RHF + zodResolver + ui/form helpers,
  32px inputs, labels above. Follow docs/design-system.md tokens; never hardcode hex colors.

## Modules
- `src/modules/<key>/module.config.ts` exports `const config: ModuleDef` (see architecture §2). No side effects.
- Never edit `src/modules/registry.ts`, shared libs, ui primitives, or another slice's files. If a shared
  change seems needed, note it in your report instead.

## Misc
- No new npm dependencies. No `any` unless unavoidable (prefer precise types from src/types/db/*).
- Doc numbers via `next_doc_number` RPC only. IDs in URLs are uuids. Files kebab-case, components PascalCase.
- i18n: storefront copy via `t(key, lang)` in `src/lib/i18n.ts` (`Lang = 'ar' | 'fr'`, Arabic is RTL);
  admin stays English. `.font-arabic` class for Arabic text rendering; storefront root sets `dir="rtl"`
  when `localization.language === 'ar'`.
- Notifications: fire `notify(orgId, event, payload)` per architecture §10 from relevant actions.
- Print pages: bare layout, load src/styles/print.css, `<PrintButton/>` client comp calling window.print().
