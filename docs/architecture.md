# Scarpar — Architecture (BINDING CONTRACT)

Scarpar is a multi-tenant, module-based CMS + commerce + business-management platform for Algerian
businesses. Next.js 15 (App Router, TS, RSC) + Supabase (Postgres, Auth, Storage, RLS) + Tailwind v4.
One deployment serves many organizations ("orgs" — the spec's "merchant/tenant"). Modules toggle per
org; vertical presets (ecommerce / courses / services / realestate) pick module sets.

Prior art applied: Payload-style config-driven modules & blocks; Sanity-style keyed block arrays for
CMS JSONB; Soover-bd's payment-verify chokepoint + order-item snapshot patterns; spec (scarper/features.md)
§17 settings engine, §18 receipts, §19 Algerian courier/payment layer, §D tenant rules.

## 1. Route map

```
src/app/
  (auth)/login, /signup, /forgot-password, /invite/[token]
  onboarding/                        # create org, pick vertical, seed
  (admin)/admin/                     # shell: sidebar (module-driven) + topbar + cmd-K
    page.tsx                         # dashboard (widgets from enabled modules)
    products/**  categories/  inventory/          # catalog module
    orders/**  returns/**                         # orders module
    pos/                                          # pos module
    customers/**  blocklist/                      # customers module
    discounts/**                                  # discounts module
    deliveries/**  delivery-zones/  riders/  cod/ # delivery module
    receipts/                                     # receipts module (list + settings)
    cms/pages/**  cms/menus/  media/              # cms module (+ media core)
    storefront/                                   # storefront settings
    reports/**  expenses/**                       # reports, expenses modules
    reviews/                                      # reviews module
    courses/**  services/**  listings/**          # vertical modules
    settings/**  staff/  audit/                   # core
    platform/                                     # platform_admins only: org list
  (print)/print/invoice/[orderId], /print/thermal/[orderId], /print/label/[deliveryId]
  (store)/s/[org]/                   # storefront: home(CMS), products, product/[slug],
                                     # cart, checkout, order/[code]
  track/[code]                       # public delivery tracking
  api/webhooks/courier                            # stub, signature-verify pattern
```

## 2. Module system (src/modules/)

`src/modules/types.ts`:
```ts
export type ModuleKey = 'catalog'|'orders'|'pos'|'customers'|'discounts'|'delivery'|'receipts'
  |'cms'|'storefront'|'reports'|'expenses'|'reviews'|'courses'|'services'|'listings'
export interface ModuleDef {
  key: ModuleKey; name: string; description: string
  nav: { label: string; href: string; icon: string }[]     // icon = lucide name
  dashboardWidgets?: string[]                               // widget ids rendered by dashboard
}
```
`src/modules/registry.ts` statically imports every `src/modules/<key>/module.config.ts` and exports
`MODULES: Record<ModuleKey, ModuleDef>` + `CORE_NAV` (dashboard, media, settings, staff, audit — always on).
`src/modules/verticals.ts`:
```
ecommerce:  catalog, orders, pos, customers, discounts, delivery, receipts, cms, storefront, reports, expenses, reviews
courses:    courses, orders, customers, discounts, cms, storefront, receipts, reports, expenses
services:   services, orders, customers, receipts, reports, expenses, cms
realestate: listings, customers, cms, storefront, reports, expenses
```
Orgs store `enabled_modules text[]`. Nav + dashboard render only enabled modules; each admin page calls
`requireModule(org, 'catalog')` (redirects to /admin if disabled). All routes exist at build time.

## 3. Data model (SQL contract — amounts are bigint centimes, 1 dinar (DZD) = 100 centimes)

Every table: `id uuid pk default gen_random_uuid()` unless noted, `org_id uuid not null references orgs`,
`created_at timestamptz default now()`. RLS ON for all. Timeline tables use `id bigint generated always as identity`.

### 0001_core.sql
- orgs: name, slug unique, vertical text check in (ecommerce|courses|services|realestate) default 'ecommerce',
  plan text default 'free', enabled_modules text[] not null default '{}', currency char(3) default 'DZD',
  country char(2) default 'DZ', timezone default 'Africa/Algiers', logo_path, phone, email, address,
  bin_number (13-digit e-BIN, nullable — legacy column name, unused for Algerian orgs), is_active bool default true, updated_at
- profiles: user_id uuid pk refs auth.users on delete cascade, full_name, phone, avatar_path
  (+ trigger: auto-insert on auth.users insert)
- org_members: pk(org_id,user_id), user_id refs auth.users, role text check in (owner|admin|manager|staff|rider|viewer)
- invitations: email, role, token uuid default gen_random_uuid() unique, status check (pending|accepted|revoked)
  default 'pending', invited_by uuid, expires_at default now()+interval '7 days'
- org_settings: pk(org_id,key), key text, value jsonb, updated_at, updated_by
- audit_log: identity id, actor_id, action text, entity text, entity_id text, before jsonb, after jsonb
- notifications: user_id nullable (null = whole org), type text, title, body, link, read_at
- media: path text (storage path `{org_id}/...`), name, mime, size int, width int, height int, alt, folder text default '', created_by
- doc_sequences: pk(org_id,doc_type), prefix text, next_no int default 1, padding int default 5
  + fn `next_doc_number(p_org uuid, p_doc_type text, p_prefix text) returns text` SECURITY DEFINER:
  upsert row, lock (FOR UPDATE), return prefix || lpad(no). Used for: order (SCR-), invoice (INV-),
  delivery (DLV-), return (RET-), job (JOB-).
- platform_admins: user_id uuid pk
- Helpers (SECURITY DEFINER, stable): `user_org_ids() returns setof uuid`;
  `is_org_member(o uuid) bool`; `has_org_role(o uuid, roles text[]) bool`; `is_platform_admin() bool`
- Standard RLS: SELECT for members (`org_id in (select user_org_ids())`); INSERT/UPDATE/DELETE for
  role owner|admin|manager (staff where noted). orgs row: members read, owner/admin update.
- Storage: bucket `media` (public read). Paths always namespaced `{org_id}/…`.

### 0002_commerce.sql
- categories: name, slug, parent_id uuid nullable, sort_order int default 0. unique(org_id,slug)
- products: name, slug, description, brand, category_id, status check (draft|active|archived) default 'draft',
  price bigint not null default 0, compare_at_price bigint, cost_price bigint, sku, barcode, hs_code,
  track_stock bool default true, stock_qty int default 0, low_stock_threshold int default 5,
  allow_backorder bool default false, weight_grams int, tags text[], attributes jsonb default '{}',
  seo jsonb, is_featured bool default false, position int default 0, updated_at. unique(org_id,slug)
- product_variants: product_id, name, sku, price bigint, compare_at_price, stock_qty int default 0,
  options jsonb default '{}', is_default bool default false, position int default 0
- product_images: product_id, variant_id nullable, media_id refs media, position int default 0
- inventory_movements: identity id, product_id, variant_id nullable, qty_delta int, type check
  (purchase|sale|adjustment|return|release), reference text, note, actor_id
  (stock_qty on product/variant is denormalized; every change writes a movement in the same action)
- customers: name, phone, email, notes, tags text[], total_spent bigint default 0, orders_count int default 0,
  last_order_at, is_blocked bool default false. unique(org_id,phone)
- customer_addresses: customer_id, label, recipient, phone, line1, area, district (holds a wilaya name —
  column name kept from the original schema, UI label is "Wilaya"), postcode, is_default bool
- discounts: code text nullable (null = auto-apply), title, type check (percent|fixed|free_shipping),
  value bigint, scope check (all|products|categories) default 'all', product_ids uuid[], category_ids uuid[],
  min_order bigint default 0, max_uses int, used_count int default 0, starts_at, expires_at, is_active bool default true.
  unique(org_id,code)
- orders: order_no text (via next_doc_number 'order','SCR-'), channel check (storefront|pos|manual) default 'manual',
  customer_id nullable, customer_name, customer_phone, customer_email, address jsonb,
  delivery_zone_id uuid, status check (pending|confirmed|packed|dispatched|delivered|completed|cancelled|returned|failed)
  default 'pending', payment_status check (unpaid|advance_paid|paid|refunded|partial_refund) default 'unpaid',
  subtotal bigint, discount_amount bigint default 0, discount_code, delivery_charge bigint default 0,
  tax_amount bigint default 0, total bigint, advance_due bigint default 0, advance_paid bigint default 0,
  payment_method check (cod|bank|cash) default 'cod',
  risk_level check (low|medium|high) nullable, risk_note, tags text[], note_internal, note_customer,
  source_meta jsonb, placed_at default now(), confirmed_at, dispatched_at, delivered_at, cancelled_at, updated_at.
  unique(org_id,order_no). cod_amount = total - advance_paid (computed in app, stored on delivery).
- order_items: order_id, product_id nullable, variant_id nullable, product_name (SNAPSHOT), variant_name,
  sku, image_path, unit_price bigint, qty int, line_total bigint
- order_events: identity id, order_id, type check (status|payment|delivery|note|system), message, data jsonb, actor_id
- payments: order_id, method (same enum as orders.payment_method), kind check (advance|full|balance|refund),
  amount bigint, status check (pending|verified|failed|refunded) default 'pending', provider_ref, sender_number,
  screenshot_media_id, verified_by, verified_at, note
  — CHOKEPOINT RULE: only `verifyPayment()` server action flips status→verified and updates
  orders.payment_status/advance_paid. Webhooks + manual verify both call it. Never trust client amounts.
- returns: order_id, return_no, status check (requested|approved|rejected|received|refunded) default 'requested',
  reason, resolution check (refund|store_credit|exchange) nullable, refund_amount bigint, note, updated_at
- return_items: return_id, order_item_id, qty, condition text
- reviews: product_id, order_id nullable, customer_name, rating int check 1-5, title, body,
  status check (pending|published|rejected) default 'pending', is_verified bool default false
- blocklist: kind check (phone|address|ip), value text, reason, created_by. unique(org_id,kind,value)
- Public (anon) RLS: SELECT on products/product_variants/product_images/categories/reviews where org active
  + status published/active. Order placement from storefront = service-role server action (validates + inserts).

### 0003_delivery_cms_ops.sql
- delivery_zones: name, districts text[] (wilaya names — column name kept from the original schema),
  charge bigint, cod_available bool default true,
  advance_required bool default false, eta_text, is_active bool default true, position int default 0
- riders: user_id nullable refs auth.users, name, phone, vehicle, is_active bool default true,
  cash_on_hand bigint default 0
- deliveries: order_id, delivery_no (next_doc_number 'delivery','DLV-'), method check (rider|courier|pickup),
  rider_id nullable, courier text nullable (yalidine|zr_express|noest_express|guepex|manual), consignment_id, tracking_code,
  status check (pending|assigned|picked_up|in_transit|delivered|failed|returned) default 'pending',
  cod_amount bigint default 0, cod_collected bool default false, cod_collected_at, settlement_id uuid nullable,
  otp_code text (4-digit POD), proof_media_id, recipient_name, recipient_phone, address jsonb, zone_id,
  fee bigint default 0, assigned_at, delivered_at, failed_reason, updated_at. unique(org_id,delivery_no)
- delivery_events: identity id, delivery_id, status, note, location, actor_id
- cod_settlements: rider_id, amount bigint, delivery_ids uuid[], note, settled_by
- courier_accounts: courier text, config jsonb, is_active bool default false. unique(org_id,courier)
- cms_pages: title, slug, type check (page|home|policy) default 'page', blocks jsonb default '[]',
  draft_blocks jsonb nullable, status check (draft|published) default 'draft', seo jsonb, published_at,
  updated_by, updated_at. unique(org_id,slug)
- cms_revisions: identity id, page_id, blocks jsonb, saved_by
- menus: handle text (header|footer), items jsonb default '[]'. unique(org_id,handle)
- expenses: category text, amount bigint, note, spent_at date default current_date, media_id, created_by
- courses: title, slug, description, price bigint default 0, cover_media_id, status check (draft|active|archived)
  default 'draft', updated_at. unique(org_id,slug)
- lessons: course_id, title, content text, video_url, position int default 0, is_free bool default false
- enrollments: course_id, customer_id, order_id nullable, status check (active|completed|revoked) default 'active',
  progress jsonb default '{}', enrolled_at default now()
- service_jobs: job_no (next_doc_number 'job','JOB-'), customer_id, title, description,
  status check (quoted|scheduled|in_progress|done|invoiced|cancelled) default 'quoted', scheduled_at,
  assigned_to uuid nullable, address jsonb, quote_amount bigint, final_amount bigint, updated_at
- appointments: job_id nullable, customer_id nullable, title, starts_at, ends_at, status check
  (booked|done|cancelled|no_show) default 'booked', note
- listings: title, slug, purpose check (sale|rent), property_type check (apartment|house|land|commercial),
  price bigint, area_sqft int, beds int, baths int, address jsonb, description, features text[],
  status check (draft|active|under_offer|sold|rented) default 'draft', media_ids uuid[], updated_at. unique(org_id,slug)
- inquiries: listing_id nullable, product_id nullable, name, phone, email, message,
  status check (new|contacted|closed) default 'new'
- Public RLS: cms_pages/menus published read; listings active read; deliveries row readable by anon
  ONLY via tracking function `get_tracking(p_code text)` SECURITY DEFINER returning limited columns.

### 0005_dz_couriers.sql / 0006_courier_wilaya_rates.sql / 0007_dz_payments_fraud.sql
- Migrated `deliveries.courier` check constraint from the Bangladeshi enum (steadfast|pathao|redx|manual)
  to the Algerian one (yalidine|zr_express|noest_express|guepex|manual); any legacy rows remapped to 'manual'.
- courier_wilaya_rates (new table): org_id, courier text, wilaya_code text, wilaya_name text,
  delivery_type check (home|stopdesk), price bigint, return_price bigint default 0, is_active bool default true.
  unique(org_id, courier, wilaya_code, delivery_type). Per-courier, per-wilaya flat delivery pricing (Algerian
  couriers price by destination wilaya + home-delivery-vs-stopdesk/bureau-pickup, not by zone/weight in v1).
  Managed from Admin → Delivery → Courier Pricing (58-wilaya bulk-edit grid per courier); the new-delivery
  form auto-suggests `delivery_charge` from this table when courier + wilaya + delivery_type are all chosen
  (still manually editable per delivery).
- Migrated `orders.payment_method` / `payments.method` check constraints from
  (cod|bkash|nagad|uddoktapay|sslcommerz|bank|cash) to (cod|bank|cash) — see §7.
- Migrated `orgs` currency/country/timezone defaults from (BDT|BD|Asia/Dhaka) to (DZD|DZ|Africa/Algiers);
  any pre-existing demo/template rows remapped.

## 4. CMS block model (Sanity/Payload hybrid)

`blocks jsonb` = array of `{ _key: string(nanoid8), _type: string, ...props }`. Block types (v1):
`hero` (heading, subheading, image mediaPath, ctaLabel, ctaHref), `richText` (html — sanitized, produced by
a simple textarea/markdown-lite editor), `productGrid` (title, mode: featured|category|manual, categoryId,
productIds[], limit), `banner` (image, href), `imageWithText` (image, heading, body, imageSide),
`faq` (items[{q,a}]), `testimonials` (items[{name, quote}] or mode:'reviews'), `contact` (heading, showForm),
`listingsGrid` (limit — realestate), `coursesGrid` (limit — courses), `html` (raw — admin-only escape hatch).
Editor = block list with add/duplicate/delete/move-up/down + per-type form (no DnD lib). Draft edits go to
`draft_blocks`; Publish copies draft→blocks, stamps published_at, snapshots into cms_revisions (keep 20).
Storefront renders via `src/components/store/blocks/render-blocks.tsx` switch.

## 5. Settings engine (spec §17)

`src/lib/settings/registry.ts`: `SETTING_DEFS: SettingDef[]` — { key, group, label, help?, type:
'boolean'|'number'|'text'|'select'|'json', options?, default, roles? }. Groups: checkout, payments,
delivery, fraud, inventory, notifications, tax, localization, printing, storefront. v1 keys (~30):
`checkout.guest_enabled` t, `checkout.min_order` 0, `payments.cod_enabled` t, `payments.advance_required` f,
`payments.advance_amount` 12000 (centimes), `payments.advance_type` fixed|percent, `payments.methods` json,
`payments.bank_details` text (bank transfer instructions shown at checkout when an advance is required),
`delivery.default_zone_fallback` number, `delivery.free_above` 0,
`fraud.enabled` f, `fraud.provider` select(internal_blocklist|disabled), `fraud.high_risk_action` select,
`inventory.track_stock` t, `inventory.allow_backorder` f, `inventory.low_stock_threshold` 5,
`notifications.events` json (event→channels), `tax.mode` none|inclusive|exclusive, `tax.vat_rate` 19,
`tax.mushak_enabled` f (legacy key name — Bangladeshi VAT-return toggle, unused for Algerian orgs, kept for
schema stability), `localization.language` ar|fr, `printing.invoice_template` a4_default|a4_mushak,
`printing.footer_text`, `storefront.announcement`, `storefront.whatsapp_number`, `storefront.primary_color`.
Accessors in `src/lib/settings/index.ts`: `getOrgSettings(orgId)` (one query, merge defaults, React cache()),
`getSetting<T>(orgId, key)`. Settings UI auto-renders groups from defs. Changes audit-logged.

## 6. Auth, tenancy, roles

Admin auth: Supabase email/password. Active org: cookie `scarpar-org` (uuid), validated against org_members
on every request via `requireOrg()` → `{ user, org, role, settings }` (src/lib/auth.ts, React cache()).
Roles: owner > admin > manager > staff > rider > viewer. `requireRole(ctx, 'manager')` throws/redirects.
Rider role sees only deliveries nav. Storefront: anon; org resolved from `[org]` slug param server-side.
Platform admins (platform_admins table): /admin/platform org list.

## 7. Payments & fraud flow (Algeria model — COD-only)

Checkout: zone fee from wilaya match → advance rule (settings + zone.advance_required + risk) →
cash-on-delivery is the only storefront payment method; when an advance is required the customer sends
a bank transfer and enters a reference + payer name at checkout (`payments.bank_details` shows the
account info), the order is placed `pending` with a `payments` row `pending`, and an admin verifies it
(chokepoint) → `confirmed`. No online payment gateway is wired in v1 (UddoktaPay/bKash/Nagad/SSLCommerz —
all Bangladeshi MFS/gateways — were removed; `payments.methods`/`payments.cod_enabled` keep the door open
for a future gateway without a schema change). Fraud: on order create, check blocklist (phone/address) →
flag risk_level high + settings action (block/require full advance/flag); internal blocklist provider
stubbed (`src/lib/fraud/provider.ts`) with `checkPhone(phone): {successRate, riskLevel}` — no well-documented
external Algerian fraud-scoring API exists today, so this is a self-hosted historical-success-rate check,
not a third-party lookup.

## 8. Courier & local delivery

`src/lib/couriers/types.ts`: `CourierAdapter { key, createOrder(delivery,order): {consignmentId, trackingCode},
getStatus(consignmentId), zones?() }`. Adapters: `manual` (admin types tracking code — fully working),
`yalidine`, `zr_express`, `noest_express`, `guepex` (the four major Algerian last-mile couriers; all
guarded stubs — if no `courier_accounts` config, throw ConfigRequired — no live API integration in v1;
Yalidine's adapter loosely mirrors its public API shape as a starting point for a future real integration,
but is not wired/tested against it). Per-wilaya, per-courier flat delivery pricing lives in
`courier_wilaya_rates` (§3) and is surfaced as an auto-suggested fee on the new-delivery form. Local rider
flow: delivery method=rider → assign rider → status stepper (picked_up→in_transit→delivered w/ OTP check +
COD collected flag) → COD settlements page (rider cash_on_hand → settle batch). Public /track/[code]:
timeline + status.

## 9. Receipts & printing (spec §18)

Print routes render HTML with print.css; window.print → PDF/printer (no Puppeteer). Templates:
A4 invoice (brand header, org address+BIN, customer, items, totals, amount-in-words (French word-numbering
util — Arabic grammatical number-words are complex/gender-agreeing, so French is used for this one printed
line; the rest of the UI is Arabic/French per `localization.language`), advance paid / COD due, QR → track
URL; `a4_mushak` variant name kept from the original schema — adds an HS code column + VAT column, no
Bangladeshi Mushak 6.3 form fields), 80mm thermal (condensed), 4x6 label (courier/rider, consignment/tracking,
Code128 barcode SVG (src/lib/barcode/code128.ts — pure TS), COD amount huge, addresses). Numbering: INV- via
doc_sequences at first print (stored in order_events data). POS (/admin/pos): product search grid + cart +
cash/bank-transfer tender → creates order channel=pos status=completed paid → thermal receipt.

## 10. Notifications

`src/lib/notify.ts`: `notify(orgId, event, payload)` — reads `notifications.events` setting → channels.
Channels: `inapp` (insert notifications rows for org admins — WORKING), `sms`, `email` (adapter interface,
v1 driver = console.log + audit trail; provider adapters documented stubs). Events: order_placed,
payment_received, order_dispatched, order_delivered, low_stock, return_requested, inquiry_received.

## 11. Reports

SQL-in-server-component aggregates (no chart lib; tiny SVG bar/line in components/ui/mini-chart.tsx):
sales by day (30d), orders by status, top products, COD success rate by wilaya, delivery performance
(avg hours, failure rate by rider/courier), expenses by category, simple P&L (revenue − cost_price − expenses).
All exports = CSV via server action.

## 12. Storefront

Lean, fast, Arabic-first (RTL) with French toggle. Home = cms_pages type=home blocks. PLP w/ category filter
+ search (ILIKE v1). PDP: gallery, variant picker, reviews. Cart = localStorage (context). Checkout =
name/phone/address/wilaya → zone fee → cash-on-delivery (+ optional bank-transfer advance) per settings →
place order (server action, service role: validates prices server-side from DB, never trusts client totals)
→ confirmation w/ track link. Announcement bar, WhatsApp float button, header/footer from menus. Theme
accent from `storefront.primary_color`.

## 13. What is stubbed vs working (v1 honesty line)

WORKING end-to-end: all admin CRUD, module toggling, onboarding+seeds, orders lifecycle, manual payment verify
chokepoint (COD + advance bank-transfer), local rider delivery + COD settlement, receipts/labels printing, POS,
CMS editor + storefront, checkout (COD + optional advance), reports, notifications (in-app), audit log, staff
invites, settings engine, per-wilaya/per-courier delivery pricing.
STUBBED (real interfaces + config UI, guarded execution): Yalidine/ZR Express/Noest Express/Guepex API calls,
internal blocklist fraud lookup, SMS/email providers, any online payment gateway (none wired in v1 — COD-only).
