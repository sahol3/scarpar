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
