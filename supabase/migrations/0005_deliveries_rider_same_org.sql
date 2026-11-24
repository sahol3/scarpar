-- A delivery's rider must belong to the same org as the delivery.
-- Before this, deliveries_write_staff only checked the caller's role in the row's org_id,
-- so a staff member of one org could point a delivery at another org's rider.
-- Rider-facing policies (deliveries_select_rider / deliveries_update_rider) are unchanged.

alter policy deliveries_write_staff on deliveries
  using (has_org_role(org_id, array['owner','admin','manager','staff']::text[]))
  with check (
    has_org_role(org_id, array['owner','admin','manager','staff']::text[])
    and (
      rider_id is null
      or exists (
        select 1 from riders r
        where r.id = deliveries.rider_id
          and r.org_id = deliveries.org_id
      )
    )
  );
