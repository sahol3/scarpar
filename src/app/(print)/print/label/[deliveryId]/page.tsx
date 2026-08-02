import { notFound } from 'next/navigation'

import { requireOrg } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { BarcodeBlock } from '@/modules/receipts/components/barcode-block'
import { CodBig } from '@/modules/receipts/components/cod-big'
import { formatAddress } from '@/modules/receipts/components/format-address'
import type { PageProps } from '@/lib/types'

export const dynamic = 'force-dynamic'

const COURIER_LABELS: Record<string, string> = {
  yalidine: 'Yalidine',
  zr_express: 'ZR Express',
  noest_express: 'Noest Express',
  guepex: 'Guepex',
  manual: 'Manual Courier',
}

export default async function LabelPage({ params }: PageProps<{ deliveryId: string }>) {
  const { deliveryId } = await params
  const ctx = await requireOrg()

  const supabase = getAdminClient()

  const { data: delivery } = await supabase.from('deliveries').select('*').eq('id', deliveryId).single()
  if (!delivery || delivery.org_id !== ctx.org.id) notFound()

  const { data: order } = await supabase.from('orders').select('*').eq('id', delivery.order_id).single()
  if (!order) notFound()

  const [{ data: org }, { data: items }] = await Promise.all([
    supabase.from('orgs').select('*').eq('id', delivery.org_id).single(),
    supabase.from('order_items').select('id, qty, product_id').eq('order_id', delivery.order_id),
  ])
  if (!org) notFound()

  const itemRows = (items ?? []) as { id: string; qty: number; product_id: string | null }[]
  const itemCount = itemRows.reduce((sum, item) => sum + item.qty, 0)

  let totalWeightGrams = 0
  const productIds = Array.from(
    new Set(itemRows.map((item) => item.product_id).filter((id): id is string => Boolean(id))),
  )
  if (productIds.length > 0) {
    const { data: products } = await supabase.from('products').select('id, weight_grams').in('id', productIds)
    const weightByProduct = new Map(
      (products ?? []).map((p) => [p.id as string, (p.weight_grams as number | null) ?? 0]),
    )
    for (const item of itemRows) {
      if (item.product_id) totalWeightGrams += (weightByProduct.get(item.product_id) ?? 0) * item.qty
    }
  }

  const trackingText: string = delivery.tracking_code || delivery.consignment_id || delivery.delivery_no
  const address = delivery.address ?? order.address
  const courierLabel =
    delivery.method === 'rider'
      ? 'RIDER'
      : delivery.method === 'courier'
        ? (COURIER_LABELS[delivery.courier ?? ''] ?? String(delivery.courier ?? 'COURIER').toUpperCase())
        : 'PICKUP'

  return (
    <div className="print-label">
      <div className="label-header">
        <div className="label-brand">{org.name}</div>
        <div className="label-courier">{courierLabel}</div>
      </div>

      <BarcodeBlock code={trackingText} caption={trackingText} />

      <div className="label-address">
        <div className="label-address-kind">Deliver To</div>
        <div className="label-recipient">{delivery.recipient_name || order.customer_name}</div>
        <div>{delivery.recipient_phone || order.customer_phone}</div>
        <div>{formatAddress(address)}</div>
      </div>

      {delivery.cod_amount > 0 ? <CodBig amountPaisa={delivery.cod_amount} label="Collect COD" /> : null}

      <div className="label-meta-row">
        <span>Order {order.order_no}</span>
        <span>
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
      </div>
      {totalWeightGrams > 0 ? (
        <div className="label-meta-row">
          <span>Weight</span>
          <span>{(totalWeightGrams / 1000).toFixed(2)} kg</span>
        </div>
      ) : null}

      <div className="label-footer">
        {org.name}
        {org.phone ? ` · ${org.phone}` : ''}
        {org.address ? ` · ${org.address}` : ''}
      </div>
    </div>
  )
}
