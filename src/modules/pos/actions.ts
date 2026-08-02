'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireOrg, requireRole } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { createOrderCore } from '@/modules/orders/create-order'
import type { ActionResult } from '@/lib/types'

// No src/modules/pos/schemas.ts in this slice's file list — the checkout schema is
// small enough to keep inline here, still satisfying docs/conventions.md's "validate
// with zod" rule for server actions.
const posCheckoutSchema = z.object({
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  paymentMethod: z.enum(['cash', 'bank']),
  /** Paisa. Only meaningful for cash — omit for bank transfer (assumed paid in full). */
  amountReceived: z.number().int().nonnegative().optional(),
  /** Flat paisa discount, already converted from the taka input on the client. */
  discountAmount: z.number().int().nonnegative().default(0),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        qty: z.number().int().positive().max(999),
      }),
    )
    .min(1, 'Cart is empty'),
})

export type PosCheckoutInput = z.input<typeof posCheckoutSchema>

export interface PosCheckoutResult {
  orderId: string
  orderNo: string
  total: number
  /** Paisa. 0 for non-cash tenders or when amountReceived wasn't provided. */
  changeDue: number
}

// Anonymous walk-in sales all collapse onto one sentinel "customer" row (customers.phone
// is NOT NULL + unique(org_id, phone), and POS explicitly allows phone to be blank) —
// the same "Guest" bucket pattern most retail POS systems use for no-ID cash sales.
const WALK_IN_PHONE = '0000000000'

/**
 * POS checkout: re-prices every line from the DB (never trusts client totals per
 * docs/conventions.md), creates the order via the shared createOrderCore contract
 * (channel 'pos', status 'completed', payment_status 'paid', stock decremented), then
 * inserts an already-verified payment row — POS is staff physically at the till, so
 * there's no manual-verify chokepoint to go through, unlike storefront advance payments.
 */
export async function posCheckoutAction(input: PosCheckoutInput): Promise<ActionResult<PosCheckoutResult>> {
  const ctx = await requireOrg()
  requireRole(ctx, 'staff')

  try {
    const parsed = posCheckoutSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid checkout data' }
    }
    const data = parsed.data
    const supabase = getAdminClient()

    const productIds = Array.from(new Set(data.items.map((item) => item.productId)))
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, sku, status')
      .eq('org_id', ctx.org.id)
      .in('id', productIds)

    if (productsError || !products) {
      return { ok: false, error: 'Failed to load products for pricing' }
    }
    const productById = new Map(products.map((p) => [p.id as string, p]))

    const variantIds = data.items
      .map((item) => item.variantId)
      .filter((id): id is string => Boolean(id))

    const variantById = new Map<
      string,
      { id: string; product_id: string; name: string; price: number; sku: string | null }
    >()
    if (variantIds.length > 0) {
      const { data: variants, error: variantsError } = await supabase
        .from('product_variants')
        .select('id, product_id, name, price, sku')
        .eq('org_id', ctx.org.id)
        .in('id', variantIds)

      if (variantsError || !variants) {
        return { ok: false, error: 'Failed to load variants for pricing' }
      }
      for (const variant of variants) {
        variantById.set(variant.id as string, variant)
      }
    }

    const orderItems: {
      product_id: string
      variant_id: string | null
      product_name: string
      variant_name: string | null
      sku: string | null
      unit_price: number
      qty: number
    }[] = []

    for (const line of data.items) {
      const product = productById.get(line.productId)
      if (!product || product.status !== 'active') {
        return { ok: false, error: 'One of the items in this sale is no longer available' }
      }

      let unitPrice = product.price as number
      let variantName: string | null = null
      let sku = product.sku as string | null

      if (line.variantId) {
        const variant = variantById.get(line.variantId)
        if (!variant || variant.product_id !== product.id) {
          return { ok: false, error: `Selected variant is no longer available for ${product.name}` }
        }
        unitPrice = variant.price
        variantName = variant.name
        sku = variant.sku ?? sku
      }

      orderItems.push({
        product_id: product.id as string,
        variant_id: line.variantId ?? null,
        product_name: product.name as string,
        variant_name: variantName,
        sku,
        unit_price: unitPrice,
        qty: line.qty,
      })
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
    const discountAmount = Math.min(data.discountAmount, subtotal)
    const total = Math.max(subtotal - discountAmount, 0)

    if (data.paymentMethod === 'cash' && data.amountReceived !== undefined && data.amountReceived < total) {
      return { ok: false, error: 'Amount received is less than the total due' }
    }

    const customerName = data.customerName?.trim() || 'Walk-in'
    const customerPhone = data.customerPhone?.trim() || WALK_IN_PHONE

    const result = await createOrderCore({
      org_id: ctx.org.id,
      channel: 'pos',
      status: 'completed',
      payment_status: 'paid',
      customer: { name: customerName, phone: customerPhone },
      delivery_charge: 0,
      items: orderItems,
      discount_amount: discountAmount,
      advance_paid: total,
      payment_method: data.paymentMethod,
      note_internal: 'POS sale',
      actor_id: ctx.user.id,
      decrement_stock: true,
    })

    const { error: paymentError } = await supabase.from('payments').insert({
      org_id: ctx.org.id,
      order_id: result.orderId,
      method: data.paymentMethod,
      kind: 'full',
      amount: total,
      status: 'verified',
      verified_by: ctx.user.id,
      verified_at: new Date().toISOString(),
      note: 'POS sale — verified at point of sale',
    })
    if (paymentError) {
      console.error('[pos] payment insert failed', paymentError)
    }

    audit(ctx, 'pos.sale', 'order', result.orderId, undefined, {
      total,
      paymentMethod: data.paymentMethod,
    })
    void notify(ctx.org.id, 'payment_received', {
      title: `POS sale ${result.orderNo}`,
      body: `${customerName} — ${orderItems.length} item${orderItems.length === 1 ? '' : 's'}`,
      link: `/admin/receipts`,
    })

    revalidatePath('/admin/receipts')
    revalidatePath('/admin/pos')

    const changeDue =
      data.paymentMethod === 'cash' && data.amountReceived !== undefined
        ? Math.max(data.amountReceived - total, 0)
        : 0

    return { ok: true, data: { orderId: result.orderId, orderNo: result.orderNo, total, changeDue } }
  } catch (err) {
    console.error('[pos] checkout failed', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Checkout failed' }
  }
}
