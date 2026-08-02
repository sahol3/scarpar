// SHARED ORDER-CREATION CORE — single implementation used by three callers:
//   - manual admin orders (orders slice), POS quick sale (pos slice), storefront checkout (storefront slice).
// The orders slice OWNS and implements this file; other slices import it read-only.
// Uses the service-role client. Callers are responsible for validation/authorization
// and for passing server-recomputed prices (NEVER client-supplied totals).
//
// NOTE: the original stub imported the `server-only` package, which is not listed in
// package.json (conventions.md forbids new deps) and isn't present in node_modules —
// that import would break `next build`. Swapped for the same inline
// `typeof window !== 'undefined'` guard src/lib/supabase/admin.ts already uses for the
// identical reason, so this file still throws if it's ever pulled into a client bundle.
if (typeof window !== 'undefined') {
  throw new Error(
    'src/modules/orders/create-order.ts (service-role order core) must never be imported into client-side code.',
  )
}

import { getAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateOrderItemInput {
  product_id?: string | null
  variant_id?: string | null
  product_name: string // snapshot
  variant_name?: string | null
  sku?: string | null
  image_path?: string | null
  unit_price: number // paisa, server-verified
  qty: number
}

export interface CreateOrderInput {
  org_id: string
  channel: 'storefront' | 'pos' | 'manual'
  status: 'pending' | 'confirmed' | 'completed'
  payment_status: 'unpaid' | 'advance_paid' | 'paid'
  customer: { id?: string | null; name: string; phone: string; email?: string | null }
  address?: Record<string, unknown> | null // { line1, area, district, postcode }
  delivery_zone_id?: string | null
  delivery_charge: number // paisa
  items: CreateOrderItemInput[]
  discount_code?: string | null
  discount_amount: number // paisa
  tax_amount?: number
  advance_due?: number
  advance_paid?: number
  payment_method: 'cod' | 'bank' | 'cash'
  risk_level?: 'low' | 'medium' | 'high' | null
  risk_note?: string | null
  note_customer?: string | null
  note_internal?: string | null
  source_meta?: Record<string, unknown> | null
  actor_id?: string | null // admin user for audit/event attribution; null for storefront
  /** When true (POS), stock is decremented + 'sale' movements written atomically with creation. */
  decrement_stock?: boolean
}

export interface CreateOrderResult {
  orderId: string
  orderNo: string
  total: number
}

// ---------------------------------------------------------------------------
// Inventory marker events — idempotence guard for applyOrderInventory.
// ---------------------------------------------------------------------------

const INVENTORY_OUT_MARKER = 'inventory:out'
const INVENTORY_RESTORE_MARKER = 'inventory:restore'

const CHANNEL_PLACED_MESSAGE: Record<CreateOrderInput['channel'], string> = {
  manual: 'Order placed manually by staff',
  pos: 'Order placed via POS',
  storefront: 'Order placed via storefront checkout',
}

type InventoryDirection = 'out' | 'restore'

interface InventoryItemRef {
  product_id: string | null
  variant_id: string | null
  qty: number
}

/**
 * Applies a stock delta for a set of order items, writing one inventory_movements
 * row per catalog-linked item. Custom/manual lines (no product_id) are skipped —
 * nothing to adjust. Only tracked products (products.track_stock) are touched.
 * Decrements/increments product_variants.stock_qty when the item has a variant,
 * else products.stock_qty — the two pools are mutually exclusive per product.
 */
async function writeInventoryMovements(
  admin: SupabaseClient,
  orgId: string,
  orderOrReturnId: string,
  items: InventoryItemRef[],
  direction: InventoryDirection,
  actorId?: string | null,
): Promise<void> {
  const sign = direction === 'out' ? -1 : 1
  const movementType = direction === 'out' ? 'sale' : 'return'

  for (const item of items) {
    if (!item.product_id) continue

    const { data: product } = await admin
      .from('products')
      .select('id, track_stock, stock_qty')
      .eq('org_id', orgId)
      .eq('id', item.product_id)
      .maybeSingle()

    if (!product || !product.track_stock) continue

    const qtyDelta = sign * item.qty

    await admin.from('inventory_movements').insert({
      org_id: orgId,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      qty_delta: qtyDelta,
      type: movementType,
      reference: orderOrReturnId,
      actor_id: actorId ?? null,
    })

    if (item.variant_id) {
      const { data: variant } = await admin
        .from('product_variants')
        .select('stock_qty')
        .eq('org_id', orgId)
        .eq('id', item.variant_id)
        .maybeSingle()

      if (variant) {
        await admin
          .from('product_variants')
          .update({ stock_qty: (variant.stock_qty ?? 0) + qtyDelta })
          .eq('id', item.variant_id)
      }
    } else {
      await admin
        .from('products')
        .update({ stock_qty: (product.stock_qty ?? 0) + qtyDelta })
        .eq('id', item.product_id)
    }
  }
}

/**
 * Finds-or-creates the customer for an order by (org_id, phone) when no id is
 * given (or the given id doesn't resolve under this org), then bumps
 * orders_count / total_spent / last_order_at. Best-effort read-modify-write —
 * no atomic increment RPC exists for this yet, acceptable for v1 (matches
 * "what is stubbed vs working" honesty line: not a documented atomicity guarantee).
 */
async function resolveCustomerId(
  admin: SupabaseClient,
  orgId: string,
  customer: CreateOrderInput['customer'],
  orderTotal: number,
): Promise<string> {
  const nowIso = new Date().toISOString()

  if (customer.id) {
    const { data: existing } = await admin
      .from('customers')
      .select('id, total_spent, orders_count')
      .eq('org_id', orgId)
      .eq('id', customer.id)
      .maybeSingle()

    if (existing) {
      await admin
        .from('customers')
        .update({
          total_spent: (existing.total_spent ?? 0) + orderTotal,
          orders_count: (existing.orders_count ?? 0) + 1,
          last_order_at: nowIso,
        })
        .eq('id', existing.id)
      return existing.id
    }
    // Given id doesn't resolve under this org — fall through to phone-based resolution.
  }

  const { data: byPhone } = await admin
    .from('customers')
    .select('id, total_spent, orders_count')
    .eq('org_id', orgId)
    .eq('phone', customer.phone)
    .maybeSingle()

  if (byPhone) {
    await admin
      .from('customers')
      .update({
        total_spent: (byPhone.total_spent ?? 0) + orderTotal,
        orders_count: (byPhone.orders_count ?? 0) + 1,
        last_order_at: nowIso,
      })
      .eq('id', byPhone.id)
    return byPhone.id
  }

  const { data: created, error } = await admin
    .from('customers')
    .insert({
      org_id: orgId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? null,
      total_spent: orderTotal,
      orders_count: 1,
      last_order_at: nowIso,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`createOrderCore: failed to create customer — ${error?.message ?? 'unknown error'}`)
  }

  return created.id
}

/**
 * Implemented by the orders slice:
 * - upserts customer by (org_id, phone) when customer.id absent; bumps orders_count/total_spent/last_order_at
 * - computes subtotal/total from items (subtotal - discount + delivery + tax), order_no via next_doc_number RPC
 * - inserts order + order_items (snapshots) + an order_events row (type 'system', message per channel)
 * - when decrement_stock: writes inventory_movements (type 'sale', negative qty_delta) and
 *   decrements products.stock_qty / product_variants.stock_qty for tracked products
 */
export async function createOrderCore(input: CreateOrderInput): Promise<CreateOrderResult> {
  const admin = getAdminClient()

  const subtotal = input.items.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  const discountAmount = input.discount_amount ?? 0
  const deliveryCharge = input.delivery_charge ?? 0
  const taxAmount = input.tax_amount ?? 0
  const total = Math.max(0, subtotal - discountAmount + deliveryCharge + taxAmount)

  const customerId = await resolveCustomerId(admin, input.org_id, input.customer, total)

  const { data: orderNo, error: orderNoError } = await admin.rpc('next_doc_number', {
    p_org: input.org_id,
    p_doc_type: 'order',
    p_prefix: 'SCR-',
  })

  if (orderNoError || !orderNo) {
    throw new Error(
      `createOrderCore: failed to allocate order number — ${orderNoError?.message ?? 'unknown error'}`,
    )
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      org_id: input.org_id,
      order_no: orderNo,
      channel: input.channel,
      customer_id: customerId,
      customer_name: input.customer.name,
      customer_phone: input.customer.phone,
      customer_email: input.customer.email ?? null,
      address: input.address ?? null,
      delivery_zone_id: input.delivery_zone_id ?? null,
      status: input.status,
      payment_status: input.payment_status,
      subtotal,
      discount_amount: discountAmount,
      discount_code: input.discount_code ?? null,
      delivery_charge: deliveryCharge,
      tax_amount: taxAmount,
      total,
      advance_due: input.advance_due ?? 0,
      advance_paid: input.advance_paid ?? 0,
      payment_method: input.payment_method,
      risk_level: input.risk_level ?? null,
      risk_note: input.risk_note ?? null,
      note_customer: input.note_customer ?? null,
      note_internal: input.note_internal ?? null,
      source_meta: input.source_meta ?? null,
    })
    .select('id, order_no, total')
    .single()

  if (orderError || !order) {
    throw new Error(`createOrderCore: failed to insert order — ${orderError?.message ?? 'unknown error'}`)
  }

  const itemRows = input.items.map((item) => ({
    org_id: input.org_id,
    order_id: order.id,
    product_id: item.product_id ?? null,
    variant_id: item.variant_id ?? null,
    product_name: item.product_name,
    variant_name: item.variant_name ?? null,
    sku: item.sku ?? null,
    image_path: item.image_path ?? null,
    unit_price: item.unit_price,
    qty: item.qty,
    line_total: item.unit_price * item.qty,
  }))

  const { error: itemsError } = await admin.from('order_items').insert(itemRows)

  if (itemsError) {
    throw new Error(`createOrderCore: failed to insert order items — ${itemsError.message}`)
  }

  await admin.from('order_events').insert({
    org_id: input.org_id,
    order_id: order.id,
    type: 'system',
    message: CHANNEL_PLACED_MESSAGE[input.channel],
    data: { channel: input.channel, status: input.status },
    actor_id: input.actor_id ?? null,
  })

  if (input.decrement_stock) {
    await writeInventoryMovements(
      admin,
      input.org_id,
      order.id,
      input.items.map((item) => ({
        product_id: item.product_id ?? null,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
      })),
      'out',
      input.actor_id,
    )

    await admin.from('order_events').insert({
      org_id: input.org_id,
      order_id: order.id,
      type: 'system',
      message: INVENTORY_OUT_MARKER,
      data: { direction: 'out', reason: 'decrement_stock at creation' },
      actor_id: input.actor_id ?? null,
    })
  }

  return { orderId: order.id, orderNo: order.order_no, total: order.total }
}

/**
 * Implemented by the orders slice: applies or restores stock for an existing order's items
 * (direction 'out' on confirm → 'sale' movements + decrement; 'restore' on cancel/return →
 * 'return' movements + increment). Idempotence guard: checks order_events for a prior
 * 'inventory:out'/'inventory:restore' marker event before applying.
 */
export async function applyOrderInventory(
  orderId: string,
  direction: 'out' | 'restore',
  actorId?: string | null,
): Promise<void> {
  const admin = getAdminClient()
  const marker = direction === 'out' ? INVENTORY_OUT_MARKER : INVENTORY_RESTORE_MARKER

  const { data: order } = await admin
    .from('orders')
    .select('id, org_id')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return // order vanished/never existed — nothing to do

  const { data: existingMarker } = await admin
    .from('order_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('type', 'system')
    .eq('message', marker)
    .maybeSingle()

  if (existingMarker) return // idempotent no-op — already applied

  const { data: items } = await admin
    .from('order_items')
    .select('product_id, variant_id, qty')
    .eq('order_id', orderId)

  await writeInventoryMovements(
    admin,
    order.org_id,
    orderId,
    (items ?? []) as InventoryItemRef[],
    direction,
    actorId,
  )

  await admin.from('order_events').insert({
    org_id: order.org_id,
    order_id: orderId,
    type: 'system',
    message: marker,
    data: { direction },
    actor_id: actorId ?? null,
  })
}
