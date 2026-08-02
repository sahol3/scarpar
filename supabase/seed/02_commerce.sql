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
