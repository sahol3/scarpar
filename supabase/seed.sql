-- =====================================================================
-- Scarpar — combined seed (01_core + 02_commerce + 03_delivery_cms)
-- Generated file: paste into the Supabase SQL editor and run once, in one
-- shot, against a freshly migrated database (supabase/migrations/0001..0004).
-- Source of truth is the three files under supabase/seed/ — regenerate this
-- file if any of them change; do not hand-edit sections independently.
-- =====================================================================

-- =====================================================================
-- SECTION 1 / 3 — 01_core.sql (org, doc sequences, org settings)
-- =====================================================================

-- =====================================================================
-- Scarpar — 01_core.sql (demo seed)
-- Run AFTER supabase/migrations/0001_core.sql. Idempotent (upserts), and
-- inserts ZERO rows that require an auth.users row to exist — no
-- profiles/org_members/invitations/platform_admins here. See the
-- commented block at the end for linking your own account as owner.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Demo org
-- ---------------------------------------------------------------------
insert into public.orgs (
  id, name, slug, vertical, plan, enabled_modules, currency, country, timezone, is_active
) values (
  '00000000-0000-0000-0000-000000000001',
  'SOOVÉR Demo Shop',
  'demo',
  'ecommerce',
  'pro',
  array['catalog','orders','pos','customers','discounts','delivery','receipts',
        'cms','storefront','reports','expenses','reviews']::text[],
  'DZD',
  'DZ',
  'Africa/Algiers',
  true
)
on conflict (id) do update set
  name            = excluded.name,
  slug            = excluded.slug,
  vertical        = excluded.vertical,
  plan            = excluded.plan,
  enabled_modules = excluded.enabled_modules,
  currency        = excluded.currency,
  country         = excluded.country,
  timezone        = excluded.timezone,
  is_active       = excluded.is_active,
  updated_at      = now();

-- ---------------------------------------------------------------------
-- Doc sequences (order/SCR-, invoice/INV-, delivery/DLV-, return/RET-, job/JOB-)
-- next_no is intentionally NOT reset on conflict, so re-running this seed
-- after real documents already exist doesn't rewind the counter.
-- ---------------------------------------------------------------------
insert into public.doc_sequences (org_id, doc_type, prefix, next_no, padding)
values
  ('00000000-0000-0000-0000-000000000001', 'order',    'SCR-', 1, 5),
  ('00000000-0000-0000-0000-000000000001', 'invoice',  'INV-', 1, 5),
  ('00000000-0000-0000-0000-000000000001', 'delivery', 'DLV-', 1, 5),
  ('00000000-0000-0000-0000-000000000001', 'return',   'RET-', 1, 5),
  ('00000000-0000-0000-0000-000000000001', 'job',      'JOB-', 1, 5)
on conflict (org_id, doc_type) do update set
  prefix  = excluded.prefix,
  padding = excluded.padding;

-- ---------------------------------------------------------------------
-- Org settings (spec §17 keys; values are jsonb scalars)
-- ---------------------------------------------------------------------
insert into public.org_settings (org_id, key, value)
values
  ('00000000-0000-0000-0000-000000000001', 'payments.advance_required', 'true'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'payments.advance_amount',   '12000'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'storefront.announcement',
     '"Free delivery inside Alger on orders over دج 2000"'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'storefront.whatsapp_number', '"+8801700000000"'::jsonb)
on conflict (org_id, key) do update set
  value      = excluded.value,
  updated_at = now();

-- =====================================================================
-- Link your own account as owner of the demo org — run this manually,
-- AFTER you've signed up at least one auth user (this script never
-- touches auth.users, so nothing above created one for you):
--
--   insert into public.org_members (org_id, user_id, role)
--   values ('00000000-0000-0000-0000-000000000001', 'YOUR-AUTH-UID', 'owner')
--   on conflict (org_id, user_id) do update set role = excluded.role;
--
-- Find YOUR-AUTH-UID: Supabase dashboard -> Authentication -> Users ->
-- copy the UID column, or `select id from auth.users where email = '...';`
-- =====================================================================

-- =====================================================================
-- SECTION 2 / 3 — 02_commerce.sql (catalog, customers, discounts, orders)
-- =====================================================================

-- 02_commerce.sql — demo data for org '00000000-0000-0000-0000-000000000001'
-- Run after 0002_commerce.sql (and after 0001's org/profile seed has created that org).
-- UUID convention: categories c0000000-…NN, products 10000000-…NN, variants 11000000-…NN,
-- customers 20000000-…NN, orders 30000000-…NN.

begin;

-- ============================================================================
-- CATEGORIES (4)
-- ============================================================================

insert into categories (id, org_id, name, slug, sort_order) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Perfume Oils', 'perfume-oils', 1),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Eau de Parfum', 'eau-de-parfum', 2),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Gift Sets', 'gift-sets', 3),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Decants', 'decants', 4);

-- ============================================================================
-- PRODUCTS (10) — prices in paisa, دج 550–دج 4500. #5 low-stock, #9 out-of-stock.
-- #1, #2, #7 carry 6ml/12ml/25ml variants.
-- ============================================================================

insert into products
  (id, org_id, name, slug, description, brand, category_id, status, price, compare_at_price,
   sku, track_stock, stock_qty, low_stock_threshold, is_featured, position)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Royal Oudh Reserve', 'royal-oudh-reserve',
   'A deep, resinous oud oil layered with saffron and warm amber for a long-lasting signature scent.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000001', 'active', 180000, null,
   'PRF-ROR-001', true, 60, 5, true, 1),

  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Velvet Rose Attar', 'velvet-rose-attar',
   'Bulgarian rose oil softened with sandalwood and a whisper of musk.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000001', 'active', 150000, null,
   'PRF-VRA-002', true, 75, 5, false, 2),

  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Sandalwood Mist', 'sandalwood-mist',
   'A light eau de parfum spray built on creamy sandalwood with a citrus top note.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000002', 'active', 220000, null,
   'PRF-SWM-003', true, 60, 5, false, 3),

  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Midnight Amber', 'midnight-amber',
   'Warm amber and dark vanilla wrapped in a smoky incense base — an evening spray.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000002', 'active', 280000, 320000,
   'PRF-MDA-004', true, 35, 5, true, 4),

  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'Saffron Bloom', 'saffron-bloom',
   'Saffron and white florals over a soft musk base, in concentrated oil form.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000001', 'active', 150000, null,
   'PRF-SFB-005', true, 4, 5, false, 5),

  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
   'White Musk Elixir', 'white-musk-elixir',
   'Clean white musk with a hint of jasmine — an everyday eau de parfum.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000002', 'active', 190000, null,
   'PRF-WME-006', true, 50, 5, false, 6),

  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
   'Bakhoor Nights', 'bakhoor-nights',
   'Smoky bakhoor and oud oil with a spiced base, for a bold nighttime wear.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000001', 'active', 200000, null,
   'PRF-BKN-007', true, 48, 5, false, 7),

  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
   'Jasmine Silk', 'jasmine-silk',
   'A curated 3-piece gift set: jasmine eau de parfum, matching attar, and a travel decant.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000003', 'active', 450000, null,
   'PRF-JAS-008', true, 15, 5, true, 8),

  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
   'Citrus Oud Cologne', 'citrus-oud-cologne',
   'Bright bergamot and grapefruit over a grounding oud base — a fresh daytime cologne.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000002', 'active', 260000, null,
   'PRF-COC-009', true, 0, 5, false, 9),

  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
   'Vanilla Musk Duet', 'vanilla-musk-duet',
   'A 3ml sample decant of sweet vanilla layered over soft musk — try before you commit.',
   'Noor Perfumery', 'c0000000-0000-0000-0000-000000000004', 'active', 55000, null,
   'PRF-VMD-010', true, 100, 5, false, 10);

-- ============================================================================
-- PRODUCT VARIANTS (9) — 6ml/12ml/25ml on products #1, #2, #7
-- ============================================================================

insert into product_variants (id, org_id, product_id, name, sku, price, stock_qty, is_default, position) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '6ml', 'PRF-ROR-001-6', 100000, 20, false, 1),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '12ml', 'PRF-ROR-001-12', 180000, 30, true, 2),
  ('11000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '25ml', 'PRF-ROR-001-25', 350000, 10, false, 3),

  ('11000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '6ml', 'PRF-VRA-002-6', 80000, 25, false, 1),
  ('11000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '12ml', 'PRF-VRA-002-12', 150000, 35, true, 2),
  ('11000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '25ml', 'PRF-VRA-002-25', 290000, 15, false, 3),

  ('11000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', '6ml', 'PRF-BKN-007-6', 110000, 18, false, 1),
  ('11000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', '12ml', 'PRF-BKN-007-12', 200000, 22, true, 2),
  ('11000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', '25ml', 'PRF-BKN-007-25', 380000, 8, false, 3);

-- ============================================================================
-- CUSTOMERS (8) — Algerian names, 05/06/07xxxxxxxx phones, Alger/Oran/Constantine
-- ============================================================================

insert into customers (id, org_id, name, phone, email) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rafiqul Islam', '01711234501', 'rafiqul.islam@example.com'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Nusrat Jahan', '01722345602', 'nusrat.jahan@example.com'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Mahmudul Hasan', '01733456703', null),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Sabrina Akter', '01744567804', 'sabrina.akter@example.com'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Tanvir Ahmed', '01755678905', null),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Farzana Rahman', '01766789006', 'farzana.rahman@example.com'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Kamrul Hasan', '01777890107', null),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Ayesha Siddiqua', '01788901208', 'ayesha.siddiqua@example.com');

-- ============================================================================
-- DISCOUNTS (2)
-- ============================================================================

insert into discounts (org_id, code, title, type, value, scope, min_order, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'WELCOME10', 'Welcome 10% Off', 'percent', 10, 'all', 0, true),
  ('00000000-0000-0000-0000-000000000001', null, 'Free Shipping Over دج 2000', 'free_shipping', null, 'all', 200000, true);

-- ============================================================================
-- ORDERS (6) — SCR-00001..SCR-00006, one status/payment scenario each.
-- actor_id / verified_by / created_by intentionally left null (no seeded auth.users row to reference).
-- ============================================================================

-- 1) pending / unpaid
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, delivery_charge, total, placed_at)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SCR-00001', 'storefront',
   '20000000-0000-0000-0000-000000000001', 'Rafiqul Islam', '01711234501', 'rafiqul.islam@example.com',
   'pending', 'unpaid', 330000, 6000, 336000, '2026-07-12 10:15:00+06');

insert into order_items (order_id, org_id, product_id, product_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Sandalwood Mist', 220000, 1, 220000),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010', 'Vanilla Musk Duet', 55000, 2, 110000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'status', 'Order placed via storefront', '2026-07-12 10:15:00+06');

-- 2) confirmed / advance_paid — payment row verified, دج 120 advance
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, delivery_charge, total, advance_due, advance_paid,
   payment_method, placed_at, confirmed_at)
values
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'SCR-00002', 'storefront',
   '20000000-0000-0000-0000-000000000002', 'Nusrat Jahan', '01722345602', 'nusrat.jahan@example.com',
   'confirmed', 'advance_paid', 180000, 6000, 186000, 12000, 12000,
   'bank', '2026-07-10 14:30:00+06', '2026-07-10 15:05:00+06');

insert into order_items (order_id, org_id, product_id, variant_id, product_name, variant_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'Royal Oudh Reserve', '12ml', 180000, 1, 180000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'status', 'Order placed via storefront', '2026-07-10 14:30:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'payment', 'Advance payment verified (دج 120 via bank transfer)', '2026-07-10 15:05:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'status', 'Order confirmed', '2026-07-10 15:05:00+06');

insert into payments (org_id, order_id, method, kind, amount, status, sender_number, verified_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'bank', 'advance', 12000, 'verified', '01722345602', '2026-07-10 15:05:00+06');

-- 3) packed / paid (full)
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, delivery_charge, total, payment_method, placed_at, confirmed_at)
values
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'SCR-00003', 'storefront',
   '20000000-0000-0000-0000-000000000003', 'Mahmudul Hasan', '01733456703', null,
   'packed', 'paid', 435000, 8000, 443000, 'bank', '2026-07-08 11:00:00+06', '2026-07-08 11:40:00+06');

insert into order_items (order_id, org_id, product_id, variant_id, product_name, variant_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', '11000000-0000-0000-0000-000000000009', 'Bakhoor Nights', '25ml', 380000, 1, 380000),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010', null, 'Vanilla Musk Duet', 55000, 1, 55000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'status', 'Order placed via storefront', '2026-07-08 11:00:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'payment', 'Full payment verified via bank transfer', '2026-07-08 11:40:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'status', 'Order packed', '2026-07-08 13:00:00+06');

insert into payments (org_id, order_id, method, kind, amount, status, sender_number, verified_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'bank', 'full', 443000, 'verified', '01733456703', '2026-07-08 11:40:00+06');

-- 4) dispatched / paid, with a WELCOME10 discount applied
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, discount_amount, discount_code, delivery_charge, total,
   payment_method, placed_at, confirmed_at, dispatched_at)
values
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'SCR-00004', 'storefront',
   '20000000-0000-0000-0000-000000000004', 'Sabrina Akter', '01744567804', 'sabrina.akter@example.com',
   'dispatched', 'paid', 470000, 47000, 'WELCOME10', 9000, 432000,
   'bank', '2026-07-06 09:20:00+06', '2026-07-06 10:00:00+06', '2026-07-07 09:00:00+06');

insert into order_items (order_id, org_id, product_id, product_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Midnight Amber', 280000, 1, 280000),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'White Musk Elixir', 190000, 1, 190000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'status', 'Order placed via storefront (WELCOME10 applied)', '2026-07-06 09:20:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'payment', 'Full payment verified via bank transfer', '2026-07-06 10:00:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'status', 'Order packed', '2026-07-06 16:00:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'status', 'Order dispatched', '2026-07-07 09:00:00+06');

insert into payments (org_id, order_id, method, kind, amount, status, sender_number, verified_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'bank', 'full', 432000, 'verified', '01744567804', '2026-07-06 10:00:00+06');

-- 5) completed / paid via POS (in-store, no delivery leg)
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, delivery_charge, total, payment_method, placed_at, confirmed_at)
values
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'SCR-00005', 'pos',
   '20000000-0000-0000-0000-000000000005', 'Tanvir Ahmed', '01755678905', null,
   'completed', 'paid', 600000, 0, 600000, 'cash', '2026-07-05 17:45:00+06', '2026-07-05 17:45:00+06');

insert into order_items (order_id, org_id, product_id, product_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Saffron Bloom', 150000, 1, 150000),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008', 'Jasmine Silk', 450000, 1, 450000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'status', 'Order created and completed via POS', '2026-07-05 17:45:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'payment', 'Cash payment received in full', '2026-07-05 17:45:00+06');

insert into payments (org_id, order_id, method, kind, amount, status, verified_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'cash', 'full', 600000, 'verified', '2026-07-05 17:45:00+06');

-- 6) cancelled / unpaid
insert into orders
  (id, org_id, order_no, channel, customer_id, customer_name, customer_phone, customer_email,
   status, payment_status, subtotal, delivery_charge, total, placed_at, cancelled_at)
values
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'SCR-00006', 'storefront',
   '20000000-0000-0000-0000-000000000006', 'Farzana Rahman', '01766789006', 'farzana.rahman@example.com',
   'cancelled', 'unpaid', 190000, 6000, 196000, '2026-07-09 12:00:00+06', '2026-07-09 18:30:00+06');

insert into order_items (order_id, org_id, product_id, product_name, unit_price, qty, line_total) values
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'White Musk Elixir', 190000, 1, 190000);

insert into order_events (org_id, order_id, type, message, created_at) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', 'status', 'Order placed via storefront', '2026-07-09 12:00:00+06'),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', 'status', 'Order cancelled — customer requested cancellation, no payment received', '2026-07-09 18:30:00+06');

-- ============================================================================
-- doc_sequences bump — 6 order numbers consumed (SCR-00001..SCR-00006)
-- ============================================================================

update doc_sequences set next_no = 7
where doc_type = 'order' and org_id = '00000000-0000-0000-0000-000000000001';

commit;

-- =====================================================================
-- SECTION 3 / 3 — 03_delivery_cms.sql (delivery, CMS, expenses, verticals)
-- =====================================================================

-- 03_delivery_cms.sql — demo data for org '00000000-0000-0000-0000-000000000001'
-- Run after 0003_delivery_cms_ops.sql, 01_core.sql, and 02_commerce.sql (needs its 6 orders +
-- 8 customers). UUID convention: delivery_zones 40000000-…NN, riders 50000000-…NN,
-- deliveries 60000000-…NN, cms_pages 70000000-…NN, menus 80000000-…NN, courses a0000000-…NN,
-- lessons b0000000-…NN, listings d0000000-…NN, inquiries e0000000-…NN, service_jobs f0000000-…NN
-- (02_commerce.sql already claims c0000000 for categories / 10000000 products / 11000000 variants
-- / 20000000 customers / 30000000 orders — avoided here).
--
-- 02_commerce.sql's 6 seed orders never actually reach status='delivered' (their mix is pending /
-- confirmed+advance_paid / packed+paid / dispatched+paid / completed-pos / cancelled), and #5 is
-- POS/no-delivery-leg. So this file promotes the 3 orders it attaches deliveries to along their
-- real lifecycle (confirmed->dispatched, packed->dispatched, dispatched->delivered) and backfills
-- their delivery_zone_id — that's exactly the FK 0002_commerce.sql deferred to 0003. cod_amount is
-- derived from each order's real total/advance_paid so it never contradicts payment_status.

begin;

-- ============================================================================
-- delivery_zones (2)
-- ============================================================================

insert into delivery_zones (id, org_id, name, districts, charge, cod_available, advance_required, eta_text, is_active, position)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Inside Alger',
    array['Alger'], 6000, true, false, '24 hours', true, 1),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Outside Alger',
    array['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Béjaïa','Biskra','Béchar','Blida','Bouira','Tamanrasset','Tébessa','Tlemcen','Tiaret','Tizi Ouzou','Djelfa','Jijel','Sétif','Saïda','Skikda','Sidi Bel Abbès','Annaba','Guelma','Constantine','Médéa','Mostaganem','M''Sila','Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arréridj','Boumerdès','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Aïn Defla','Naâma','Aïn Témouchent','Ghardaïa','Relizane','Timimoun','Bordj Badji Mokhtar','Ouled Djellal','Béni Abbès','In Salah','In Guezzam','Touggourt','Djanet','El M''Ghair','El Meniaa'],
    12000, true, true, '2-3 days', true, 2);

-- ============================================================================
-- riders (2)
-- ============================================================================

insert into riders (id, org_id, name, phone, vehicle, is_active, cash_on_hand) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Rakib Hasan', '01711223344', 'motorbike', true, 0),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Shohag Mia', '01755667788', 'bicycle', true, 174000);

-- ============================================================================
-- Bring 3 of 02_commerce.sql's orders forward into the delivery lifecycle + backfill the
-- delivery_zone_id FK that 0003's migration just added.
--   SCR-00002 (confirmed, advance_paid دج 120 of دج 1860 total) -> dispatched, Inside Alger
--   SCR-00003 (packed, paid in full via bank transfer)               -> dispatched, Outside Alger (courier)
--   SCR-00004 (dispatched, paid in full via bank transfer)            -> delivered, Inside Alger
-- ============================================================================

update orders set
  status = 'dispatched',
  delivery_zone_id = '40000000-0000-0000-0000-000000000001',
  dispatched_at = now() - interval '5 hours'
where id = '30000000-0000-0000-0000-000000000002' and org_id = '00000000-0000-0000-0000-000000000001';

update orders set
  status = 'dispatched',
  delivery_zone_id = '40000000-0000-0000-0000-000000000002',
  dispatched_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-000000000003' and org_id = '00000000-0000-0000-0000-000000000001';

update orders set
  status = 'delivered',
  delivery_zone_id = '40000000-0000-0000-0000-000000000001',
  delivered_at = now() - interval '2 days'
where id = '30000000-0000-0000-0000-000000000004' and org_id = '00000000-0000-0000-0000-000000000001';

-- ============================================================================
-- deliveries (3)
--   1) SCR-00002 / Nusrat Jahan — rider, in_transit, otp_code + real COD balance (1860-120=1740 tk)
--   2) SCR-00004 / Sabrina Akter — rider, delivered + cod_collected (already paid in full -> دج 0 COD)
--   3) SCR-00003 / Mahmudul Hasan — courier (manual adapter), in_transit, tracking 'SF123456789'
-- ============================================================================

insert into deliveries (
  id, org_id, order_id, delivery_no, method, rider_id, courier, consignment_id, tracking_code,
  status, cod_amount, cod_collected, cod_collected_at, otp_code, recipient_name, recipient_phone,
  address, zone_id, fee, assigned_at, delivered_at
) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002', 'DLV-00001', 'rider',
   '50000000-0000-0000-0000-000000000001', null, null, 'DLV-00001',
   'in_transit', 174000, false, null, '4821', 'Nusrat Jahan', '01722345602',
   '{"line1":"Cité El Badr, Bt 6","area":"Bab Ezzouar","district":"Alger","postcode":"16311"}'::jsonb,
   '40000000-0000-0000-0000-000000000001', 6000, now() - interval '5 hours', null),

  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000004', 'DLV-00002', 'rider',
   '50000000-0000-0000-0000-000000000002', null, null, 'DLV-00002',
   'delivered', 0, true, now() - interval '2 days', '7734', 'Sabrina Akter', '01744567804',
   '{"line1":"Rue Didouche Mourad 14","area":"Hydra","district":"Alger","postcode":"16035"}'::jsonb,
   '40000000-0000-0000-0000-000000000001', 6000, now() - interval '3 days', now() - interval '2 days'),

  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000003', 'DLV-00003', 'courier', null, 'manual', 'SF123456789', 'SF123456789',
   'in_transit', 0, false, null, null, 'Mahmudul Hasan', '01733456703',
   '{"line1":"Rue Larbi Ben M'hidi 9","area":"Sidi Bel Abbès Centre","district":"Sidi Bel Abbès","postcode":"22000"}'::jsonb,
   '40000000-0000-0000-0000-000000000002', 12000, now() - interval '1 day', null);

-- ============================================================================
-- delivery_events (status trails)
-- ============================================================================

insert into delivery_events (org_id, delivery_id, status, note, created_at) values
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'assigned',   'Assigned to rider Rakib Hasan.', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'picked_up',  'Picked up from warehouse.',      now() - interval '4 hours'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'in_transit', 'On the way to customer.',        now() - interval '3 hours'),

  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'assigned',   'Assigned to rider Shohag Mia.',  now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'picked_up',  'Picked up from warehouse.',      now() - interval '3 days' + interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'in_transit', 'On the way to customer.',        now() - interval '2 days' - interval '4 hours'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'delivered',  'Delivered, signed by recipient.', now() - interval '2 days'),

  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'assigned',   'Handed to Yalidine courier partner (manual tracking).', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'in_transit', 'In transit with courier.', now() - interval '10 hours');

-- ============================================================================
-- cms_pages (3) — blocks per docs/architecture.md §4
-- ============================================================================

insert into cms_pages (id, org_id, title, slug, type, blocks, status, published_at) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Home', 'home', 'home',
   '[
      {"_key":"blk00001","_type":"hero","heading":"Fresh Picks, Fast Delivery Across Algeria","subheading":"Shop quality products with cash on delivery and same-day dispatch inside Alger.","image":"00000000-0000-0000-0000-000000000001/cms/home-hero.jpg","ctaLabel":"Shop Now","ctaHref":"/products"},
      {"_key":"blk00002","_type":"productGrid","title":"Featured Products","mode":"featured","categoryId":null,"productIds":[],"limit":8},
      {"_key":"blk00003","_type":"imageWithText","image":"00000000-0000-0000-0000-000000000001/cms/about-strip.jpg","heading":"Why Shop With Us","body":"Verified sellers, secure cash-on-delivery, and a support team that answers in minutes.","imageSide":"left"},
      {"_key":"blk00004","_type":"faq","items":[{"q":"Do you deliver outside Alger?","a":"Yes, every wilaya in Algeria: 24 hours inside Alger and 2-3 days outside Alger."},{"q":"Can I pay cash on delivery?","a":"Yes, COD is available on every order; some zones require a small advance."},{"q":"How do I track my order?","a":"Use the tracking link in your confirmation SMS, or visit the track page with your delivery code."}]},
      {"_key":"blk00005","_type":"testimonials","mode":"reviews"}
    ]'::jsonb,
   'published', now() - interval '20 days'),

  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'About Us', 'about', 'page',
   '[{"_key":"blk00001","_type":"richText","html":"<h2>About Us</h2><p>We are an Alger-based online store bringing quality products to every wilaya in Algeria with fast, reliable cash-on-delivery shipping.</p>"}]'::jsonb,
   'published', now() - interval '20 days'),

  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Privacy Policy', 'privacy', 'policy',
   '[{"_key":"blk00001","_type":"richText","html":"<h2>Privacy Policy</h2><p>We collect only the information needed to process your order: name, phone number, and delivery address. We never sell your data to third parties.</p>"}]'::jsonb,
   'published', now() - interval '20 days');

-- ============================================================================
-- menus (2)
-- ============================================================================

insert into menus (id, org_id, handle, items) values
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'header',
   '[{"label":"Home","href":"/"},{"label":"Shop","href":"/products"},{"label":"About","href":"/about"}]'::jsonb),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'footer',
   '[{"label":"Privacy Policy","href":"/privacy"},{"label":"Track Order","href":"/track"}]'::jsonb);

-- ============================================================================
-- expenses (5) — spread over the last 30 days
-- ============================================================================

insert into expenses (org_id, category, amount, note, spent_at) values
  ('00000000-0000-0000-0000-000000000001', 'Packaging',    320000,  'Poly bags, boxes, and tape restock.',          current_date - 3),
  ('00000000-0000-0000-0000-000000000001', 'Courier Bill', 1850000, 'Monthly Yalidine/ZR Express courier settlement.', current_date - 7),
  ('00000000-0000-0000-0000-000000000001', 'Facebook Ads', 1200000, 'Boosted posts for the weekend sale.',          current_date - 12),
  ('00000000-0000-0000-0000-000000000001', 'Rent',         4500000, 'Shop + storage rent.',                        current_date - 20),
  ('00000000-0000-0000-0000-000000000001', 'Salary',       9000000, 'Staff salary, current month.',                current_date - 28);

-- ============================================================================
-- doc_sequences bumps — 01_core.sql seeded delivery/job at next_no=1; this file consumes
-- DLV-00001..DLV-00003 and JOB-00001 below.
-- ============================================================================

update doc_sequences set next_no = 4
where org_id = '00000000-0000-0000-0000-000000000001' and doc_type = 'delivery';

update doc_sequences set next_no = 2
where org_id = '00000000-0000-0000-0000-000000000001' and doc_type = 'job';

-- ============================================================================
-- courses (1) + lessons (2)
-- ============================================================================

insert into courses (id, org_id, title, slug, description, price, status) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Intro to Online Selling in Algeria', 'intro-online-selling',
   'A short course on setting up a storefront, pricing in dinars, and running cash-on-delivery checkout for Algerian customers.',
   150000, 'active');

insert into lessons (id, org_id, course_id, title, content, position, is_free) values
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'Getting Started',
   'Set up your organization, pick a vertical, and enable the modules you need.', 0, true),
  ('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'Setting Up Delivery Zones',
   'Define delivery zones by district, set charges and ETAs, and decide where COD needs an advance.', 1, false);

-- ============================================================================
-- service_jobs (1, quoted) — customer 20000000-…-007 (Kamrul Hasan) isn't used by any of
-- 02_commerce.sql's 6 orders, so this doubles as a "services customer" demo.
-- ============================================================================

insert into service_jobs (id, org_id, job_no, customer_id, title, description, status, quote_amount, address) values
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'JOB-00001',
   '20000000-0000-0000-0000-000000000007', 'AC Installation & Gas Refill',
   '2-ton split AC unit installation with gas top-up, customer-supplied unit.',
   'quoted', 850000,
   '{"line1":"Rue des Frères Bouadou 45","area":"El Biar","district":"Alger","postcode":"16030"}'::jsonb);

-- ============================================================================
-- listings (1) + inquiries (1)
-- ============================================================================

insert into listings (
  id, org_id, title, slug, purpose, property_type, price, area_sqft, beds, baths, address,
  description, features, status
) values (
  'd0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  '3-Bed Apartment in Hydra', '3-bed-apartment-hydra', 'sale', 'apartment',
  1350000000, 1450, 3, 3,
  '{"line1":"Rue 8, Villa 22","area":"Hydra","district":"Alger","postcode":"16035"}'::jsonb,
  'Bright 3-bed apartment in a quiet Hydra residential block, close to the lake and main road access.',
  array['Lift','Generator Backup','Parking','Gas Line'],
  'active'
);

insert into inquiries (id, org_id, listing_id, name, phone, email, message, status) values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'Farhana Akter', '01611998877', 'farhana.akter@example.com',
   'Interested in viewing this apartment this weekend. Please share available time slots.', 'new');

commit;

