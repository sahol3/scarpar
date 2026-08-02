'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'

import { requireOrg, requireRole, type OrgContext } from '@/lib/auth'
import { getServerClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { DELIVERY_STATUS_FLOW, type DeliveryStatus } from '@/lib/status'
import { getAdapter, ConfigRequiredError } from '@/lib/couriers'
import type { ActionResult } from '@/lib/types'
import type { CourierWilayaRate, Delivery, DeliveryCourier, DeliveryPricingType } from '@/types/db'
import {
  createDeliverySchema,
  assignRiderSchema,
  markPickedUpSchema,
  markInTransitSchema,
  markDeliveredSchema,
  markFailedSchema,
  markReturnedSchema,
  zoneSchema,
  riderSchema,
  settleCodSchema,
  bulkUpsertCourierWilayaRatesSchema,
  type CreateDeliveryInput,
  type AssignRiderInput,
  type MarkDeliveredInput,
  type MarkFailedInput,
  type MarkReturnedInput,
  type ZoneInput,
  type RiderInput,
  type SettleCodInput,
  type BulkUpsertCourierWilayaRatesInput,
} from './schemas'

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>
type DeliveryWithOrder = Delivery & { order: { id: string; order_no: string; status: string } }

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function formatAddressLine(address: { line1: string; area?: string; district: string; postcode?: string }): string {
  return [address.line1, address.area, address.district, address.postcode].filter(Boolean).join(', ')
}

async function loadDeliveryForOrg(
  supabase: ServerSupabase,
  orgId: string,
  deliveryId: string,
): Promise<DeliveryWithOrder | null> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, order:orders(id, order_no, status)')
    .eq('id', deliveryId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return null
  return data as unknown as DeliveryWithOrder
}

function assertTransition(current: DeliveryStatus, next: DeliveryStatus): string | null {
  if (!DELIVERY_STATUS_FLOW[current]?.includes(next)) {
    return `Cannot move a delivery from "${current}" to "${next}"`
  }
  return null
}

// ===========================================================================
// Deliveries
// ===========================================================================

export async function createDeliveryAction(
  input: CreateDeliveryInput,
): Promise<ActionResult<{ id: string; delivery_no: string }>> {
  let ctx: OrgContext | undefined
  try {
    ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = createDeliverySchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    const data = parsed.data

    const supabase = await getServerClient()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_no')
      .eq('id', data.order_id)
      .eq('org_id', ctx.org.id)
      .single()

    if (orderError || !order) {
      return { ok: false, error: 'Order not found' }
    }

    let consignmentId: string | null = null
    let trackingCode: string | null = null

    if (data.method === 'courier') {
      if (!data.courier) return { ok: false, error: 'Select a courier' }

      try {
        const adapter = getAdapter(data.courier)
        const result = await adapter.createOrder(ctx, {
          orderNo: order.order_no,
          recipientName: data.recipient_name,
          recipientPhone: data.recipient_phone,
          recipientAddress: formatAddressLine(data.address),
          district: data.address.district,
          codAmount: data.cod_amount,
          note: null,
          manualTrackingCode: data.manual_tracking_code || null,
        })
        consignmentId = result.consignmentId
        trackingCode = result.trackingCode
      } catch (err) {
        if (err instanceof ConfigRequiredError) {
          return { ok: false, error: err.message }
        }
        throw err
      }
    }

    const { data: deliveryNo, error: seqError } = await supabase.rpc('next_doc_number', {
      p_org: ctx.org.id,
      p_doc_type: 'delivery',
      p_prefix: 'DLV-',
    })

    if (seqError || !deliveryNo) {
      return { ok: false, error: 'Could not allocate a delivery number' }
    }

    const isRiderAssigned = data.method === 'rider' && !!data.rider_id
    const status: DeliveryStatus = isRiderAssigned ? 'assigned' : 'pending'

    const insertRow = {
      org_id: ctx.org.id,
      order_id: order.id,
      delivery_no: deliveryNo as string,
      method: data.method,
      rider_id: data.method === 'rider' ? data.rider_id ?? null : null,
      courier: data.method === 'courier' ? data.courier : null,
      consignment_id: consignmentId,
      tracking_code: trackingCode,
      status,
      cod_amount: data.cod_amount,
      recipient_name: data.recipient_name,
      recipient_phone: data.recipient_phone,
      address: data.address,
      zone_id: data.zone_id ?? null,
      fee: data.fee,
      otp_code: data.otp_enabled ? generateOtp() : null,
      assigned_at: isRiderAssigned ? new Date().toISOString() : null,
    }

    const { data: delivery, error: insertError } = await supabase
      .from('deliveries')
      .insert(insertRow)
      .select('id, delivery_no')
      .single()

    if (insertError || !delivery) {
      return { ok: false, error: insertError?.message ?? 'Could not create delivery' }
    }

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status,
      note: isRiderAssigned ? 'Delivery created and assigned to rider.' : 'Delivery created.',
      actor_id: ctx.user.id,
    })

    await supabase.from('order_events').insert({
      org_id: ctx.org.id,
      order_id: order.id,
      type: 'delivery',
      message: `Delivery ${delivery.delivery_no} created (${data.method}).`,
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.create', 'delivery', delivery.id, undefined, insertRow)
    revalidatePath('/admin/deliveries')
    revalidatePath(`/admin/orders/${order.id}`)

    return { ok: true, data: { id: delivery.id, delivery_no: delivery.delivery_no as string } }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[createDeliveryAction]', err)
    return { ok: false, error: 'Something went wrong creating the delivery' }
  }
}

export async function assignRiderAction(input: AssignRiderInput): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = assignRiderSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { delivery_id, rider_id } = parsed.data

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'assigned')
    if (transitionError) return { ok: false, error: transitionError }

    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id, name')
      .eq('id', rider_id)
      .eq('org_id', ctx.org.id)
      .single()
    if (riderError || !rider) return { ok: false, error: 'Rider not found' }

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ rider_id, status: 'assigned', assigned_at: new Date().toISOString() })
      .eq('id', delivery_id)
    if (updateError) return { ok: false, error: updateError.message }

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id,
      status: 'assigned',
      note: `Assigned to rider ${rider.name}.`,
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.assign', 'delivery', delivery_id, { status: delivery.status }, { rider_id, status: 'assigned' })
    revalidatePath(`/admin/deliveries/${delivery_id}`)
    revalidatePath('/admin/deliveries')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[assignRiderAction]', err)
    return { ok: false, error: 'Something went wrong assigning the rider' }
  }
}

export async function markPickedUpAction(input: { delivery_id: string }): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = markPickedUpSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid input' }

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, parsed.data.delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'picked_up')
    if (transitionError) return { ok: false, error: transitionError }

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'picked_up' })
      .eq('id', delivery.id)
    if (updateError) return { ok: false, error: updateError.message }

    await supabase
      .from('orders')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', delivery.order.id)

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status: 'picked_up',
      note: 'Picked up.',
      actor_id: ctx.user.id,
    })

    await supabase.from('order_events').insert({
      org_id: ctx.org.id,
      order_id: delivery.order.id,
      type: 'delivery',
      message: 'Order picked up for delivery — dispatched.',
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.picked_up', 'delivery', delivery.id, { status: delivery.status }, { status: 'picked_up' })
    await notify(ctx.org.id, 'order_dispatched', {
      title: `Order ${delivery.order.order_no} dispatched`,
      link: `/admin/orders/${delivery.order.id}`,
    })

    revalidatePath(`/admin/deliveries/${delivery.id}`)
    revalidatePath('/admin/deliveries')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[markPickedUpAction]', err)
    return { ok: false, error: 'Something went wrong updating the delivery' }
  }
}

export async function markInTransitAction(input: { delivery_id: string }): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = markInTransitSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid input' }

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, parsed.data.delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'in_transit')
    if (transitionError) return { ok: false, error: transitionError }

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'in_transit' })
      .eq('id', delivery.id)
    if (updateError) return { ok: false, error: updateError.message }

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status: 'in_transit',
      note: 'In transit.',
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.in_transit', 'delivery', delivery.id, { status: delivery.status }, { status: 'in_transit' })
    revalidatePath(`/admin/deliveries/${delivery.id}`)
    revalidatePath('/admin/deliveries')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[markInTransitAction]', err)
    return { ok: false, error: 'Something went wrong updating the delivery' }
  }
}

export async function markDeliveredAction(input: MarkDeliveredInput): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = markDeliveredSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { delivery_id, otp, cod_collected } = parsed.data

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'delivered')
    if (transitionError) return { ok: false, error: transitionError }

    if (delivery.otp_code && delivery.otp_code !== (otp ?? '').trim()) {
      return { ok: false, error: 'Incorrect OTP' }
    }

    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({
        status: 'delivered',
        delivered_at: now,
        cod_collected,
        cod_collected_at: cod_collected ? now : null,
      })
      .eq('id', delivery.id)
    if (updateError) return { ok: false, error: updateError.message }

    if (cod_collected && delivery.method === 'rider' && delivery.rider_id && delivery.cod_amount > 0) {
      const { data: rider } = await supabase
        .from('riders')
        .select('cash_on_hand')
        .eq('id', delivery.rider_id)
        .single()

      if (rider) {
        await supabase
          .from('riders')
          .update({ cash_on_hand: rider.cash_on_hand + delivery.cod_amount })
          .eq('id', delivery.rider_id)
      }
    }

    await supabase.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', delivery.order.id)

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status: 'delivered',
      note: cod_collected ? 'Delivered, COD collected.' : 'Delivered.',
      actor_id: ctx.user.id,
    })

    await supabase.from('order_events').insert({
      org_id: ctx.org.id,
      order_id: delivery.order.id,
      type: 'delivery',
      message: 'Order delivered.',
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.delivered', 'delivery', delivery.id, { status: delivery.status }, { status: 'delivered', cod_collected })
    await notify(ctx.org.id, 'order_delivered', {
      title: `Order ${delivery.order.order_no} delivered`,
      link: `/admin/orders/${delivery.order.id}`,
    })

    revalidatePath(`/admin/deliveries/${delivery.id}`)
    revalidatePath('/admin/deliveries')
    revalidatePath('/admin/cod')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[markDeliveredAction]', err)
    return { ok: false, error: 'Something went wrong marking the delivery delivered' }
  }
}

export async function markFailedAction(input: MarkFailedInput): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = markFailedSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { delivery_id, reason } = parsed.data

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'failed')
    if (transitionError) return { ok: false, error: transitionError }

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'failed', failed_reason: reason })
      .eq('id', delivery.id)
    if (updateError) return { ok: false, error: updateError.message }

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status: 'failed',
      note: reason,
      actor_id: ctx.user.id,
    })

    await supabase.from('order_events').insert({
      org_id: ctx.org.id,
      order_id: delivery.order.id,
      type: 'delivery',
      message: `Delivery failed: ${reason}`,
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.failed', 'delivery', delivery.id, { status: delivery.status }, { status: 'failed', reason })
    revalidatePath(`/admin/deliveries/${delivery.id}`)
    revalidatePath('/admin/deliveries')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[markFailedAction]', err)
    return { ok: false, error: 'Something went wrong marking the delivery failed' }
  }
}

export async function markReturnedAction(input: MarkReturnedInput): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = markReturnedSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid input' }
    const { delivery_id, note } = parsed.data

    const supabase = await getServerClient()
    const delivery = await loadDeliveryForOrg(supabase, ctx.org.id, delivery_id)
    if (!delivery) return { ok: false, error: 'Delivery not found' }

    const transitionError = assertTransition(delivery.status, 'returned')
    if (transitionError) return { ok: false, error: transitionError }

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'returned' })
      .eq('id', delivery.id)
    if (updateError) return { ok: false, error: updateError.message }

    await supabase.from('orders').update({ status: 'returned' }).eq('id', delivery.order.id)

    await supabase.from('delivery_events').insert({
      org_id: ctx.org.id,
      delivery_id: delivery.id,
      status: 'returned',
      note: note || 'Returned.',
      actor_id: ctx.user.id,
    })

    await supabase.from('order_events').insert({
      org_id: ctx.org.id,
      order_id: delivery.order.id,
      type: 'delivery',
      message: note ? `Order returned: ${note}` : 'Order returned.',
      actor_id: ctx.user.id,
    })

    audit(ctx, 'delivery.returned', 'delivery', delivery.id, { status: delivery.status }, { status: 'returned' })
    revalidatePath(`/admin/deliveries/${delivery.id}`)
    revalidatePath('/admin/deliveries')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[markReturnedAction]', err)
    return { ok: false, error: 'Something went wrong returning the delivery' }
  }
}

// ===========================================================================
// Delivery zones
// ===========================================================================

export async function upsertZoneAction(input: ZoneInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'manager')

    const parsed = zoneSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { id, eta_text, ...rest } = parsed.data

    const supabase = await getServerClient()
    const row = { ...rest, eta_text: eta_text || null, org_id: ctx.org.id }

    if (id) {
      const { data: before } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .single()

      const { data, error } = await supabase
        .from('delivery_zones')
        .update(row)
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .select('id')
        .single()

      if (error || !data) return { ok: false, error: error?.message ?? 'Zone not found' }
      audit(ctx, 'delivery_zone.update', 'delivery_zone', id, before, row)
      revalidatePath('/admin/delivery-zones')
      return { ok: true, data: { id } }
    }

    const { data, error } = await supabase.from('delivery_zones').insert(row).select('id').single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create zone' }

    audit(ctx, 'delivery_zone.create', 'delivery_zone', data.id, undefined, row)
    revalidatePath('/admin/delivery-zones')
    return { ok: true, data: { id: data.id } }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[upsertZoneAction]', err)
    return { ok: false, error: 'Something went wrong saving the zone' }
  }
}

export async function deleteZoneAction(input: { id: string }): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'manager')
    if (!input?.id) return { ok: false, error: 'Missing zone id' }

    const supabase = await getServerClient()
    const { data: before } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('id', input.id)
      .eq('org_id', ctx.org.id)
      .single()

    const { error } = await supabase.from('delivery_zones').delete().eq('id', input.id).eq('org_id', ctx.org.id)
    if (error) return { ok: false, error: error.message }

    audit(ctx, 'delivery_zone.delete', 'delivery_zone', input.id, before, undefined)
    revalidatePath('/admin/delivery-zones')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[deleteZoneAction]', err)
    return { ok: false, error: 'Something went wrong deleting the zone' }
  }
}

// ===========================================================================
// Riders
// ===========================================================================

export async function upsertRiderAction(input: RiderInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = riderSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { id, vehicle, user_id, ...rest } = parsed.data

    const supabase = await getServerClient()
    const row = { ...rest, vehicle: vehicle || null, user_id: user_id || null, org_id: ctx.org.id }

    if (id) {
      const { data: before } = await supabase.from('riders').select('*').eq('id', id).eq('org_id', ctx.org.id).single()
      const { data, error } = await supabase
        .from('riders')
        .update(row)
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .select('id')
        .single()

      if (error || !data) return { ok: false, error: error?.message ?? 'Rider not found' }
      audit(ctx, 'rider.update', 'rider', id, before, row)
      revalidatePath('/admin/riders')
      return { ok: true, data: { id } }
    }

    const { data, error } = await supabase.from('riders').insert(row).select('id').single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create rider' }

    audit(ctx, 'rider.create', 'rider', data.id, undefined, row)
    revalidatePath('/admin/riders')
    return { ok: true, data: { id: data.id } }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[upsertRiderAction]', err)
    return { ok: false, error: 'Something went wrong saving the rider' }
  }
}

export async function deactivateRiderAction(input: { id: string }): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')
    if (!input?.id) return { ok: false, error: 'Missing rider id' }

    const supabase = await getServerClient()
    const { error } = await supabase
      .from('riders')
      .update({ is_active: false })
      .eq('id', input.id)
      .eq('org_id', ctx.org.id)
    if (error) return { ok: false, error: error.message }

    audit(ctx, 'rider.deactivate', 'rider', input.id, { is_active: true }, { is_active: false })
    revalidatePath('/admin/riders')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[deactivateRiderAction]', err)
    return { ok: false, error: 'Something went wrong deactivating the rider' }
  }
}

// ===========================================================================
// COD settlement
// ===========================================================================

export async function settleCodAction(input: SettleCodInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'staff')

    const parsed = settleCodSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const { rider_id, delivery_ids, note } = parsed.data

    const supabase = await getServerClient()

    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id, cash_on_hand')
      .eq('id', rider_id)
      .eq('org_id', ctx.org.id)
      .single()
    if (riderError || !rider) return { ok: false, error: 'Rider not found' }

    // Never trust client-supplied amounts (docs/conventions.md) — recompute
    // from the org's own unsettled, COD-collected deliveries for this rider.
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('deliveries')
      .select('id, cod_amount')
      .eq('org_id', ctx.org.id)
      .eq('rider_id', rider_id)
      .eq('cod_collected', true)
      .is('settlement_id', null)
      .in('id', delivery_ids)

    if (deliveriesError || !deliveries || deliveries.length === 0) {
      return { ok: false, error: 'No settleable deliveries found for that selection' }
    }

    const matchedIds = deliveries.map((delivery) => delivery.id as string)
    const amount = deliveries.reduce((sum, delivery) => sum + (delivery.cod_amount as number), 0)

    const { data: settlement, error: settlementError } = await supabase
      .from('cod_settlements')
      .insert({
        org_id: ctx.org.id,
        rider_id,
        amount,
        delivery_ids: matchedIds,
        note: note || null,
        settled_by: ctx.user.id,
      })
      .select('id')
      .single()

    if (settlementError || !settlement) {
      return { ok: false, error: settlementError?.message ?? 'Could not create settlement' }
    }

    await supabase.from('deliveries').update({ settlement_id: settlement.id }).in('id', matchedIds)
    await supabase
      .from('riders')
      .update({ cash_on_hand: Math.max(0, rider.cash_on_hand - amount) })
      .eq('id', rider_id)

    audit(ctx, 'cod_settlement.create', 'cod_settlement', settlement.id, undefined, {
      rider_id,
      amount,
      delivery_ids: matchedIds,
    })

    revalidatePath('/admin/cod')
    return { ok: true, data: { id: settlement.id } }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[settleCodAction]', err)
    return { ok: false, error: 'Something went wrong settling COD' }
  }
}

// ===========================================================================
// Courier x wilaya pricing (docs/architecture.md §8 — Algerian courier
// pricing is flat per wilaya + delivery type, not zone/distance-based).
// ===========================================================================

export async function listCourierWilayaRatesAction(
  courier: DeliveryCourier,
): Promise<ActionResult<CourierWilayaRate[]>> {
  try {
    const ctx = await requireOrg()
    const supabase = await getServerClient()

    const { data, error } = await supabase
      .from('courier_wilaya_rates')
      .select('*')
      .eq('org_id', ctx.org.id)
      .eq('courier', courier)
      .order('wilaya_code')

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: (data ?? []) as CourierWilayaRate[] }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[listCourierWilayaRatesAction]', err)
    return { ok: false, error: 'Something went wrong loading courier rates' }
  }
}

/** Bulk-save the pricing grid for one courier — replaces all its rows in one pass. */
export async function bulkUpsertCourierWilayaRatesAction(
  input: BulkUpsertCourierWilayaRatesInput,
): Promise<ActionResult> {
  try {
    const ctx = await requireOrg()
    requireRole(ctx, 'manager')

    const parsed = bulkUpsertCourierWilayaRatesSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

    const supabase = await getServerClient()
    const rows = parsed.data.rates.map((rate) => ({
      ...rate,
      org_id: ctx.org.id,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('courier_wilaya_rates')
      .upsert(rows, { onConflict: 'org_id,courier,wilaya_code,delivery_type' })

    if (error) return { ok: false, error: error.message }

    audit(ctx, 'courier_wilaya_rates.bulk_upsert', 'courier_wilaya_rates', parsed.data.courier, undefined, {
      courier: parsed.data.courier,
      count: rows.length,
    })
    revalidatePath('/admin/delivery-pricing')
    return { ok: true }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[bulkUpsertCourierWilayaRatesAction]', err)
    return { ok: false, error: 'Something went wrong saving the pricing grid' }
  }
}

/** Auto-suggest a fee for the new-delivery form — courier + recipient wilaya + delivery type. */
export async function getCourierWilayaRateAction(input: {
  courier: DeliveryCourier
  wilayaName: string
  deliveryType: DeliveryPricingType
}): Promise<ActionResult<{ price: number; return_price: number } | null>> {
  try {
    const ctx = await requireOrg()
    const supabase = await getServerClient()

    const { data, error } = await supabase
      .from('courier_wilaya_rates')
      .select('price, return_price')
      .eq('org_id', ctx.org.id)
      .eq('courier', input.courier)
      .eq('wilaya_name', input.wilayaName)
      .eq('delivery_type', input.deliveryType)
      .eq('is_active', true)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ? { price: data.price as number, return_price: data.return_price as number } : null }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[getCourierWilayaRateAction]', err)
    return { ok: false, error: 'Something went wrong looking up the courier rate' }
  }
}
