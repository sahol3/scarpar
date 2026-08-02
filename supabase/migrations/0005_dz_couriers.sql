-- Algeria market migration: replace Bangladeshi courier enum values
-- (steadfast/pathao/redx) with Algerian couriers (yalidine/zr_express/
-- noest_express/guepex). Kept `manual` unchanged. See docs/architecture.md §8.
alter table deliveries drop constraint if exists deliveries_courier_check;

alter table deliveries
  add constraint deliveries_courier_check
  check (courier in ('yalidine', 'zr_express', 'noest_express', 'guepex', 'manual'));

-- Any pre-existing rows using the old BD courier values are template/demo
-- data only (no live production orgs) — remapped to 'manual' defensively.
update deliveries
  set courier = 'manual'
  where courier in ('steadfast', 'pathao', 'redx');
