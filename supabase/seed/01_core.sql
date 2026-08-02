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
