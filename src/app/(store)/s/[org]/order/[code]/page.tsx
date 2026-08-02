import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { getOrgSettings, settingStr } from '@/lib/settings'
import { getAdminClient } from '@/lib/supabase/admin'
import type { PageProps } from '@/lib/types'
import type { Order, OrderItem, Payment } from '@/types/db'

import { getStoreOrg } from '@/components/store/get-store-org'
import { storePath } from '@/components/store/store-links'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

type OrderRow = Pick<
  Order,
  | 'id'
  | 'order_no'
  | 'status'
  | 'payment_status'
  | 'customer_name'
  | 'subtotal'
  | 'discount_amount'
  | 'delivery_charge'
  | 'total'
  | 'advance_due'
  | 'payment_method'
  | 'placed_at'
>
type OrderItemRow = Pick<OrderItem, 'id' | 'product_name' | 'variant_name' | 'qty' | 'unit_price' | 'line_total'>
type PendingPaymentRow = Pick<Payment, 'id' | 'method' | 'kind' | 'amount' | 'status' | 'provider_ref'>

export default async function OrderConfirmationPage({ params }: PageProps<{ org: string; code: string }>) {
  const { org: orgSlug, code } = await params
  const org = await getStoreOrg(orgSlug)
  if (!org) notFound()

  const settings = await getOrgSettings(org.id)
  const lang = settingStr(settings, 'localization.language') as Lang
  const bankDetails = settingStr(settings, 'payments.bank_details')

  // orders carries no public RLS policy at all (architecture §3/§7: order placement is a
  // service-role server action) — the admin client is required, scoped to this org + order_no.
  const supabase = getAdminClient()
  const { data: orderRow } = await supabase
    .from('orders')
    .select(
      'id, order_no, status, payment_status, customer_name, subtotal, discount_amount, delivery_charge, total, advance_due, payment_method, placed_at',
    )
    .eq('org_id', org.id)
    .eq('order_no', code)
    .maybeSingle()

  if (!orderRow) notFound()
  const order = orderRow as OrderRow

  const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, product_name, variant_name, qty, unit_price, line_total')
      .eq('org_id', org.id)
      .eq('order_id', order.id),
    supabase
      .from('payments')
      .select('id, method, kind, amount, status, provider_ref')
      .eq('org_id', org.id)
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const items = (itemRows ?? []) as OrderItemRow[]
  const pendingPayment = ((paymentRows ?? []) as PendingPaymentRow[])[0]

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold">{t('order_placed', lang)}</h1>
        <p className="text-2xl font-semibold tabular-nums">{order.order_no}</p>
        <p className="text-sm text-muted-foreground">
          Thanks, {order.customer_name} — we&apos;ll be in touch shortly.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Order summary</h2>
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {item.product_name}
                {item.variant_name ? <span className="text-muted-foreground"> · {item.variant_name}</span> : null}
                <span className="text-muted-foreground"> × {item.qty}</span>
              </span>
              <span className="tabular-nums">{formatMoney(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('subtotal', lang)}</span>
            <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
          </div>
          {order.discount_amount > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">-{formatMoney(order.discount_amount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('delivery_charge', lang)}</span>
            <span className="tabular-nums">{formatMoney(order.delivery_charge)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{t('total', lang)}</span>
            <span className="tabular-nums">{formatMoney(order.total)}</span>
          </div>
        </div>
      </div>

      {pendingPayment ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {pendingPayment.kind === 'advance' ? t('advance_payable', lang) : 'Payment'} pending verification
          </p>
          <p className="text-amber-800 dark:text-amber-300">
            {formatMoney(pendingPayment.amount)} via bank transfer
            {bankDetails ? ` (${bankDetails})` : ''}
            {pendingPayment.provider_ref ? ` — Ref ${pendingPayment.provider_ref}` : ''}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <Link href={`/track/${order.order_no}`}>{t('track_order', lang)}</Link>
        </Button>
        <Button asChild className="flex-1">
          <Link href={storePath(org.slug, '/products')}>{t('continue_shopping', lang)}</Link>
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Tracking activates once your order is dispatched.
      </p>
    </div>
  )
}
