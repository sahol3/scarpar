-- Algeria market migration: per-courier, per-wilaya delivery pricing. Algerian
-- couriers price flat-per-wilaya (not distance/zone-based like the BD model),
-- with a cheaper "stopdesk" (bureau pickup) rate vs "home" delivery, plus a
-- separate return-to-sender fee. See docs/architecture.md §8.
create table courier_wilaya_rates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  courier        text not null check (courier in ('yalidine', 'zr_express', 'noest_express', 'guepex', 'manual')),
  wilaya_code    text not null,
  wilaya_name    text not null,
  delivery_type  text not null check (delivery_type in ('home', 'stopdesk')),
  price          bigint not null default 0,
  return_price   bigint not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, courier, wilaya_code, delivery_type)
);

alter table courier_wilaya_rates enable row level security;

create policy courier_wilaya_rates_select_members on courier_wilaya_rates
  for select to authenticated
  using (is_org_member(org_id));

create policy courier_wilaya_rates_write_admin on courier_wilaya_rates
  for all to authenticated
  using (has_org_role(org_id, array['owner','admin','manager']::text[]))
  with check (has_org_role(org_id, array['owner','admin','manager']::text[]));

create index courier_wilaya_rates_lookup_idx
  on courier_wilaya_rates (org_id, courier, wilaya_code, delivery_type);
