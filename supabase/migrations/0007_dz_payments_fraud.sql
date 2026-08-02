-- Algeria market migration: cash-on-delivery-only payments, drop Bangladeshi
-- mobile-financial-services / gateway payment methods (bkash/nagad/uddoktapay/
-- sslcommerz). See docs/architecture.md §7.
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders
  add constraint orders_payment_method_check
  check (payment_method in ('cod', 'bank', 'cash'));

alter table payments drop constraint if exists payments_method_check;
alter table payments
  add constraint payments_method_check
  check (method in ('cod', 'bank', 'cash'));

-- Any pre-existing rows using the removed BD payment methods are template/demo
-- data only (no live production orgs) — remapped to 'bank' defensively.
update orders
  set payment_method = 'bank'
  where payment_method in ('bkash', 'nagad', 'uddoktapay', 'sslcommerz');

update payments
  set method = 'bank'
  where method in ('bkash', 'nagad', 'uddoktapay', 'sslcommerz');

-- Fraud provider rebrand: fraudbd -> internal_blocklist (self-hosted, no
-- external BD-specific API). Only affects org_settings JSON values, not a
-- constrained column, so a defensive update is enough.
update org_settings
  set value = '"internal_blocklist"'::jsonb
  where key = 'fraud.provider' and value = '"fraudbd"'::jsonb;

-- Org defaults: new orgs should default to Algeria, not Bangladesh.
alter table orgs alter column currency set default 'DZD';
alter table orgs alter column country set default 'DZ';
alter table orgs alter column timezone set default 'Africa/Algiers';

-- Any pre-existing demo/template orgs still on the old BD defaults are
-- remapped too (template/pre-launch assumption — no live production orgs).
update orgs
  set currency = 'DZD', country = 'DZ', timezone = 'Africa/Algiers'
  where currency = 'BDT' or country = 'BD' or timezone = 'Asia/Dhaka';
