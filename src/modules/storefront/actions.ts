'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { getOrgSettings, settingBool, settingNum, settingStr } from '@/lib/settings'
import { notify } from '@/lib/notify'
import { formatMoney } from '@/lib/money'
import type { ActionResult } from '@/lib/types'
import { createOrderCore } from '@/modules/orders/create-order'
import { validateDiscountCode, consumeDiscount } from '@/modules/discounts/validate'
import { getStoreOrg } from '@/components/store/get-store-org'
import {
  applyDiscountSchema,
  inquirySchema,
  placeOrderSchema,
  quoteDeliverySchema,
  reviewSchema,
  type ApplyDiscountInput,
  type CartItemInput,
  type InquiryInput,
  type PlaceOrderInput,
  type QuoteDeliveryInput,
  type ReviewInput,
} from './schemas'

// ===============================================================================================
// Shared internal helpers — server-side price/zone truth. Never trust client-supplied amounts
// (docs/conventions.md — Data access: "server-side price recomputation. Never trust client totals").
// ===============================================================================================

interface DeliveryZoneRow {
  id: string
  districts: string[]
  charge: number
  cod_available: boolean
  advance_required: boolean
  eta_text: string | null
}

export interface DeliveryQuote {
  zoneId: string | null
  charge: number
  etaText: string | null
  codAvailable: boolean
  advanceRequired: boolean
  warning?: string
}

async function resolveDeliveryZone(
  orgId: string,
  district: string,
  settings: Record<string, unknown>,
): Promise<DeliveryQuote> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('delivery_zones')
    .select('id, districts, charge, cod_available, advance_required, eta_text')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('position', { ascending: true })

  const zones = (data ?? []) as DeliveryZoneRow[]
  const needle = district.trim().toLowerCase()
  const match = zones.find((zone) => zone.districts.some((d) => d.trim().toLowerCase() === needle))

  if (match) {
    return {
      zoneId: match.id,
      charge: match.charge,
      etaText: match.eta_text,
      codAvailable: match.cod_available,
      advanceRequired: match.advance_required,
    }
  }

  return {
    zoneId: null,
    charge: settingNum(settings, 'delivery.default_zone_fallback'),
    etaText: null,
    codAvailable: true,
    advanceRequired: false,
    warning: 'No delivery zone is configured for this district yet — using the standard rate.',
  }
}

/** `delivery.free_above` (0 disables it) — applied against the post-discount subtotal. */
function applyFreeDelivery(charge: number, subtotalAfterDiscount: number, settings: Record<string, unknown>): number {
  const freeAbove = settingNum(settings, 'delivery.free_above')
  if (freeAbove > 0 && subtotalAfterDiscount >= freeAbove) return 0
  return charge
}

interface PricedProductRow {
  id: string
  name: string
  price: number
  category_id: string | null
  status: string
  track_stock: boolean
  stock_qty: number
  allow_backorder: boolean
}

interface PricedVariantRow {
  id: string
  product_id: string
  name: string
  price: number
  stock_qty: number
}

export interface PricedLine {
  productId: string
  variantId: string | null
  name: string
  variantName: string | null
  unitPrice: number
  qty: number
  lineTotal: number
  trackStock: boolean
  stockQty: number
  allowBackorder: boolean
  categoryId: string | null
  imagePath: string | null
}

async function getPrimaryImagePaths(orgId: string, productIds: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {}
  if (productIds.length === 0) return result

  const supabase = getAdminClient()
  const { data } = await supabase
    .from('product_images')
    .select('product_id, position, media:media_id(path)')
    .eq('org_id', orgId)
    .in('product_id', productIds)
    .order('position', { ascending: true })

  if (!data) return result

  for (const row of data as unknown as {
    product_id: string
    media: { path: string } | { path: string }[] | null
  }[]) {
    if (row.product_id in result) continue // keep first (lowest position) seen per product
    const media = Array.isArray(row.media) ? row.media[0] : row.media
    result[row.product_id] = media?.path ?? null
  }
  return result
}

/**
 * Re-fetches product/variant prices, stock, and category from the DB for a cart's line items —
 * the ONLY source of truth for money math. Rejects (returns ok:false) when an item no longer
 * exists/is inactive; stock-vs-qty is checked by the caller (price recomputation is silent per
 * the checkout contract, stock is not).
 */
async function priceCartItems(
  orgId: string,
  items: CartItemInput[],
): Promise<
  ActionResult<{ lines: PricedLine[]; subtotal: number; productIds: string[]; categoryIds: string[] }>
> {
  const supabase = getAdminClient()

  const productIds = [...new Set(items.map((i) => i.productId))]
  const { data: productRows, error: productError } = await supabase
    .from('products')
    .select('id, name, price, category_id, status, track_stock, stock_qty, allow_backorder')
    .eq('org_id', orgId)
    .in('id', productIds)

  if (productError || !productRows) return { ok: false, error: 'Could not load product prices.' }
  const products = new Map((productRows as PricedProductRow[]).map((p) => [p.id, p]))

  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => Boolean(v)))]
  let variants = new Map<string, PricedVariantRow>()
  if (variantIds.length > 0) {
    const { data: variantRows, error: variantError } = await supabase
      .from('product_variants')
      .select('id, product_id, name, price, stock_qty')
      .eq('org_id', orgId)
      .in('id', variantIds)
    if (variantError || !variantRows) return { ok: false, error: 'Could not load variant prices.' }
    variants = new Map((variantRows as PricedVariantRow[]).map((v) => [v.id, v]))
  }

  const imagePaths = await getPrimaryImagePaths(orgId, productIds)

  const lines: PricedLine[] = []
  for (const item of items) {
    const product = products.get(item.productId)
    if (!product || product.status !== 'active') {
      return { ok: false, error: 'One of the items in your cart is no longer available.' }
    }

    const variant = item.variantId ? variants.get(item.variantId) : undefined
    if (item.variantId && (!variant || variant.product_id !== item.productId)) {
      return { ok: false, error: 'One of the items in your cart is no longer available.' }
    }

    const unitPrice = variant ? variant.price : product.price
    const stockQty = variant ? variant.stock_qty : product.stock_qty

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      variantName: variant?.name ?? null,
      unitPrice,
      qty: item.qty,
      lineTotal: unitPrice * item.qty,
      trackStock: product.track_stock,
      stockQty,
      allowBackorder: product.allow_backorder,
      categoryId: product.category_id,
      imagePath: imagePaths[product.id] ?? null,
    })
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
  const outProductIds = [...new Set(lines.map((l) => l.productId))]
  const categoryIds = [...new Set(lines.map((l) => l.categoryId).filter((c): c is string => Boolean(c)))]

  return { ok: true, data: { lines, subtotal, productIds: outProductIds, categoryIds } }
}

interface BlocklistRow {
  kind: 'phone' | 'address' | 'ip'
  value: string
}

async function checkBlocklist(
  orgId: string,
  phone: string,
  addressLine1: string,
): Promise<{ isRisk: boolean; note: string | null }> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('blocklist')
    .select('kind, value')
    .eq('org_id', orgId)
    .in('kind', ['phone', 'address'])

  const rows = (data ?? []) as BlocklistRow[]
  const normalizedPhone = phone.trim()
  const normalizedAddress = addressLine1.trim().toLowerCase()

  const match = rows.find((row) =>
    row.kind === 'phone'
      ? row.value.trim() === normalizedPhone
      : row.value.trim().toLowerCase() === normalizedAddress,
  )

  return match ? { isRisk: true, note: `Blocklist match: ${match.kind}` } : { isRisk: false, note: null }
}

// ===============================================================================================
// quoteDeliveryAction — district -> zone charge/eta, with a settings-driven fallback.
// ===============================================================================================

export async function quoteDeliveryAction(input: QuoteDeliveryInput): Promise<ActionResult<DeliveryQuote>> {
  const parsed = quoteDeliverySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  try {
    const org = await getStoreOrg(parsed.data.orgSlug)
    if (!org) return { ok: false, error: 'Store not found' }

    const settings = await getOrgSettings(org.id)
    return { ok: true, data: await resolveDeliveryZone(org.id, parsed.data.district, settings) }
  } catch (err) {
    console.error('[storefront:quoteDeliveryAction]', err)
    return { ok: false, error: 'Could not calculate delivery charge. Please try again.' }
  }
}

// ===============================================================================================
// applyDiscountAction — server-revalidated discount preview (discounts slice owns validation).
// ===============================================================================================

export interface DiscountResult {
  discountId: string
  amount: number
  label: string
  /** discounts.type isn't in the validateDiscountCode contract's return shape — free-shipping
   * codes are detected from the label text, per the storefront checkout spec. */
  freeShipping: boolean
}

export async function applyDiscountAction(input: ApplyDiscountInput): Promise<ActionResult<DiscountResult>> {
  const parsed = applyDiscountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  try {
    const org = await getStoreOrg(parsed.data.orgSlug)
    if (!org) return { ok: false, error: 'Store not found' }

    const priced = await priceCartItems(org.id, parsed.data.items)
    if (!priced.ok) return priced
    if (!priced.data) return { ok: false, error: 'Could not price your cart.' }
    const { subtotal, productIds, categoryIds } = priced.data

    const result = await validateDiscountCode(org.id, parsed.data.code, subtotal, productIds, categoryIds)
    if (!result.ok) return { ok: false, error: result.reason }

    return {
      ok: true,
      data: {
        discountId: result.discountId,
        amount: result.amount,
        label: result.label,
        freeShipping: /free shipping/i.test(result.label),
      },
    }
  } catch (err) {
    console.error('[storefront:applyDiscountAction]', err)
    return { ok: false, error: 'Could not apply this code. Please try again.' }
  }
}

// ===============================================================================================
// placeOrderAction — the checkout chokepoint. zod-validates, re-prices everything server-side,
// runs the blocklist/advance/payment-method rules, then hands off to the orders slice's shared
// createOrderCore. Never marks a payment verified — that stays the admin verifyPayment() chokepoint.
// ===============================================================================================

export interface PlaceOrderResult {
  orderNo: string
}

export async function placeOrderAction(input: PlaceOrderInput): Promise<ActionResult<PlaceOrderResult>> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }
  const data = parsed.data

  try {
    const org = await getStoreOrg(data.orgSlug)
    if (!org) return { ok: false, error: 'Store not found' }

    const settings = await getOrgSettings(org.id)

    // 1. price + stock truth ------------------------------------------------------------------
    const priced = await priceCartItems(org.id, data.items)
    if (!priced.ok) return priced
    if (!priced.data) return { ok: false, error: 'Could not price your cart.' }
    const { lines, subtotal, productIds, categoryIds } = priced.data

    for (const line of lines) {
      if (line.trackStock && !line.allowBackorder && line.qty > Math.max(line.stockQty, 0)) {
        return { ok: false, error: `${line.name} only has ${Math.max(line.stockQty, 0)} left in stock.` }
      }
    }

    if (subtotal < settingNum(settings, 'checkout.min_order')) {
      return { ok: false, error: 'Your order is below the minimum order amount for this store.' }
    }

    // 2. discount (re-validated server-side; client's applyDiscountAction result is not trusted) -
    let discountId: string | null = null
    let discountAmount = 0
    let discountLabel: string | null = null
    let freeShipping = false

    if (data.discountCode) {
      const result = await validateDiscountCode(org.id, data.discountCode, subtotal, productIds, categoryIds)
      if (!result.ok) return { ok: false, error: result.reason }
      discountId = result.discountId
      discountAmount = result.amount
      discountLabel = result.label
      freeShipping = /free shipping/i.test(result.label)
    }

    // 3. delivery zone ------------------------------------------------------------------------
    const zone = await resolveDeliveryZone(org.id, data.address.district, settings)
    const subtotalAfterDiscount = Math.max(subtotal - discountAmount, 0)
    const deliveryCharge = freeShipping ? 0 : applyFreeDelivery(zone.charge, subtotalAfterDiscount, settings)

    // 4. fraud / blocklist ---------------------------------------------------------------------
    const risk = await checkBlocklist(org.id, data.contact.phone, data.address.line1)
    const highRiskAction = settingStr(settings, 'fraud.high_risk_action')
    if (risk.isRisk && highRiskAction === 'block') {
      return { ok: false, error: 'Order cannot be placed, contact us' }
    }

    // 5. advance + payment method ---------------------------------------------------------------
    const total = subtotalAfterDiscount + deliveryCharge // tax_amount is 0 in v1 storefront checkout

    const forceFullAdvance = risk.isRisk && highRiskAction === 'require_full_advance'
    const advanceRequired = forceFullAdvance || settingBool(settings, 'payments.advance_required') || zone.advanceRequired

    let advanceDue = 0
    if (advanceRequired) {
      if (forceFullAdvance) {
        advanceDue = total
      } else {
        const advanceType = settingStr(settings, 'payments.advance_type')
        const advanceSetting = settingNum(settings, 'payments.advance_amount')
        advanceDue = advanceType === 'percent' ? Math.round((total * advanceSetting) / 100) : advanceSetting
      }
      advanceDue = Math.min(Math.max(advanceDue, 0), total)
    }

    if (!settingBool(settings, 'payments.cod_enabled')) {
      return { ok: false, error: 'Cash on delivery is not available for this store.' }
    }
    if (!zone.codAvailable) {
      return { ok: false, error: 'Cash on delivery is not available for your wilaya.' }
    }

    let paymentRow: {
      method: 'bank'
      kind: 'advance'
      amount: number
      trxId: string
      senderNumber: string
    } | null = null

    if (advanceRequired) {
      if (!data.trxId || !data.senderNumber) {
        return { ok: false, error: 'Enter the bank transfer reference and payer name for the advance payment.' }
      }
      paymentRow = {
        method: 'bank',
        kind: 'advance',
        amount: advanceDue,
        trxId: data.trxId,
        senderNumber: data.senderNumber,
      }
    }

    // 6. create the order — shared core owned by the orders slice ------------------------------
    const result = await createOrderCore({
      org_id: org.id,
      channel: 'storefront',
      status: 'pending',
      payment_status: 'unpaid',
      customer: { name: data.contact.name, phone: data.contact.phone, email: data.contact.email ?? null },
      address: { line1: data.address.line1, area: data.address.area ?? null, district: data.address.district },
      delivery_zone_id: zone.zoneId,
      delivery_charge: deliveryCharge,
      items: lines.map((l) => ({
        product_id: l.productId,
        variant_id: l.variantId,
        product_name: l.name,
        variant_name: l.variantName,
        image_path: l.imagePath,
        unit_price: l.unitPrice,
        qty: l.qty,
      })),
      discount_code: discountId ? (data.discountCode ?? null) : null,
      discount_amount: discountAmount,
      tax_amount: 0,
      advance_due: advanceDue,
      advance_paid: 0, // only the admin verifyPayment() chokepoint ever sets this (architecture §7)
      payment_method: data.paymentMethod,
      risk_level: risk.isRisk ? 'high' : null,
      risk_note: risk.isRisk ? risk.note : null,
      note_customer: data.noteCustomer ?? null,
      source_meta: discountLabel ? { discount_label: discountLabel } : null,
      actor_id: null,
      decrement_stock: false,
    })

    // 7. side effects ---------------------------------------------------------------------------
    if (paymentRow) {
      const supabase = getAdminClient()
      const { error: paymentError } = await supabase.from('payments').insert({
        org_id: org.id,
        order_id: result.orderId,
        method: paymentRow.method,
        kind: paymentRow.kind,
        amount: paymentRow.amount,
        status: 'pending',
        provider_ref: paymentRow.trxId,
        sender_number: paymentRow.senderNumber,
      })
      if (paymentError) console.error('[storefront:placeOrderAction] payment row insert failed', paymentError)
    }

    if (discountId) {
      try {
        await consumeDiscount(discountId)
      } catch (err) {
        console.error('[storefront:placeOrderAction] consumeDiscount failed', err)
      }
    }

    await notify(org.id, 'order_placed', {
      title: `New order ${result.orderNo}`,
      body: `${data.contact.name} — ${formatMoney(result.total)}`,
      link: `/admin/orders/${result.orderId}`,
    })

    return { ok: true, data: { orderNo: result.orderNo } }
  } catch (err) {
    console.error('[storefront:placeOrderAction]', err)
    return { ok: false, error: 'Could not place your order. Please try again.' }
  }
}

// ===============================================================================================
// createReviewAction — always lands as pending/unverified; moderation is an admin-side concern.
// ===============================================================================================

export async function createReviewAction(input: ReviewInput): Promise<ActionResult<{ id: string }>> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  try {
    const org = await getStoreOrg(data.orgSlug)
    if (!org) return { ok: false, error: 'Store not found' }

    const supabase = getAdminClient()

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('org_id', org.id)
      .eq('id', data.productId)
      .maybeSingle()
    if (!product) return { ok: false, error: 'Product not found' }

    const { data: inserted, error } = await supabase
      .from('reviews')
      .insert({
        org_id: org.id,
        product_id: data.productId,
        order_id: data.orderId ?? null,
        customer_name: data.customerName,
        rating: data.rating,
        title: data.title ?? null,
        body: data.body ?? null,
        status: 'pending',
        is_verified: false,
      })
      .select('id')
      .single()

    if (error || !inserted) return { ok: false, error: 'Could not submit your review. Please try again.' }
    return { ok: true, data: { id: (inserted as { id: string }).id } }
  } catch (err) {
    console.error('[storefront:createReviewAction]', err)
    return { ok: false, error: 'Could not submit your review. Please try again.' }
  }
}

// ===============================================================================================
// inquiryAction — contact block + PDP "ask about this product" forms.
// ===============================================================================================

export async function inquiryAction(input: InquiryInput): Promise<ActionResult<{ id: string }>> {
  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const data = parsed.data

  try {
    const org = await getStoreOrg(data.orgSlug)
    if (!org) return { ok: false, error: 'Store not found' }
    if (!data.phone && !data.email) {
      return { ok: false, error: 'Add a phone number or email so we can reply.' }
    }

    const supabase = getAdminClient()
    const { data: inserted, error } = await supabase
      .from('inquiries')
      .insert({
        org_id: org.id,
        product_id: data.productId ?? null,
        listing_id: data.listingId ?? null,
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        message: data.message,
        status: 'new',
      })
      .select('id')
      .single()

    if (error || !inserted) return { ok: false, error: 'Could not send your message. Please try again.' }

    await notify(org.id, 'inquiry_received', {
      title: `New inquiry from ${data.name}`,
      body: data.message.slice(0, 140),
      link: '/admin',
    })

    return { ok: true, data: { id: (inserted as { id: string }).id } }
  } catch (err) {
    console.error('[storefront:inquiryAction]', err)
    return { ok: false, error: 'Could not send your message. Please try again.' }
  }
}
