import { notFound } from 'next/navigation'
import { format } from 'date-fns'

import { requireOrg } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { formatMoney } from '@/lib/money'
import { settingBool, settingNum, settingStr } from '@/lib/settings'
import { ensureInvoiceNumber, getReceiptContext, qrDataUrl } from '@/lib/receipt'
import { QrBlock } from '@/modules/receipts/components/qr-block'
import { CodBig } from '@/modules/receipts/components/cod-big'
import { ReceiptTotals } from '@/modules/receipts/components/receipt-totals'
import { AmountWords } from '@/modules/receipts/components/amount-words'
import { formatAddress } from '@/modules/receipts/components/format-address'
import type { PageProps } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  bank: 'Bank Transfer',
  cash: 'Cash',
}

/** Exclusive: rate% of the pre-tax line. Inclusive: the VAT portion already baked into it. */
function computeLineVat(lineTotalPaisa: number, mode: string, ratePercent: number): number {
  if (mode === 'exclusive') return Math.round((lineTotalPaisa * ratePercent) / 100)
  if (mode === 'inclusive') return Math.round(lineTotalPaisa - (lineTotalPaisa * 100) / (100 + ratePercent))
  return 0
}

export default async function InvoicePage({ params }: PageProps<{ orderId: string }>) {
  const { orderId } = await params
  const ctx = await requireOrg()

  const context = await getReceiptContext(orderId)
  if (!context || context.order.org_id !== ctx.org.id) notFound()

  const { org, order, items, settings } = context

  const invoiceNo = await ensureInvoiceNumber(orderId)

  const supabase = getAdminClient()
  const { data: delivery } = await supabase
    .from('deliveries')
    .select('tracking_code')
    .eq('order_id', orderId)
    .maybeSingle()

  const trackCode = delivery?.tracking_code || order.order_no
  const qrSrc = await qrDataUrl(`${env.APP_URL}/track/${trackCode}`)

  const taxMode = settingStr(settings, 'tax.mode')
  const vatRate = settingNum(settings, 'tax.vat_rate')
  const mushakEnabled = settingBool(settings, 'tax.mushak_enabled')
  const invoiceTemplate = settingStr(settings, 'printing.invoice_template')
  const footerText = settingStr(settings, 'printing.footer_text')
  const isMushak = invoiceTemplate === 'a4_mushak' && mushakEnabled

  const taxRows =
    taxMode !== 'none' && order.tax_amount > 0
      ? [
          {
            label: `VAT (${vatRate}%)${taxMode === 'inclusive' ? ' incl.' : ''}`,
            amountPaisa: order.tax_amount,
          },
        ]
      : []

  const balanceDue = Math.max(order.total - order.advance_paid, 0)

  let hsCodeByProduct: Record<string, string> = {}
  if (isMushak) {
    const productIds = Array.from(
      new Set(items.map((item) => item.product_id).filter((id): id is string => Boolean(id))),
    )
    if (productIds.length > 0) {
      const { data: products } = await supabase.from('products').select('id, hs_code').in('id', productIds)
      hsCodeByProduct = Object.fromEntries(
        (products ?? []).map((p) => [p.id as string, (p.hs_code as string | null) ?? '—']),
      )
    }
  }

  return (
    <div className="print-a4">
      <header className="receipt-header">
        <div>
          <div className="receipt-brand">{org.name}</div>
          <address>
            {org.address ?? ''}
            {org.phone ? (
              <>
                <br />
                Phone: {org.phone}
              </>
            ) : null}
            {mushakEnabled && org.bin_number ? (
              <>
                <br />
                Seller BIN: {org.bin_number}
              </>
            ) : null}
          </address>
        </div>
        <div className="receipt-title">{isMushak ? 'Mushak-6.3 Tax Invoice' : 'Invoice'}</div>
      </header>

      <div className="receipt-meta">
        <div>
          <strong>Invoice No:</strong> {invoiceNo}
          <br />
          <strong>Date:</strong> {format(new Date(order.placed_at), 'd MMM yyyy')}
          <br />
          <strong>Order No:</strong> {order.order_no}
        </div>
        <address>
          <strong>Bill To</strong>
          <br />
          {order.customer_name}
          <br />
          {order.customer_phone}
          <br />
          {formatAddress(order.address)}
          {isMushak ? (
            <>
              <br />
              Buyer BIN: —
            </>
          ) : null}
        </address>
      </div>

      <table className="receipt-items">
        <thead>
          <tr>
            <th>Item</th>
            {isMushak ? <th>HS Code</th> : null}
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            {isMushak ? <th className="num">VAT</th> : null}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const lineVat = isMushak ? computeLineVat(item.line_total, taxMode, vatRate) : 0
            return (
              <tr key={item.id}>
                <td>
                  {item.product_name}
                  {item.variant_name ? (
                    <>
                      <br />
                      <span style={{ fontSize: 10 }}>{item.variant_name}</span>
                    </>
                  ) : null}
                </td>
                {isMushak ? (
                  <td>{item.product_id ? (hsCodeByProduct[item.product_id] ?? '—') : '—'}</td>
                ) : null}
                <td className="num">{item.qty}</td>
                <td className="num">{formatMoney(item.unit_price)}</td>
                {isMushak ? <td className="num">{formatMoney(lineVat)}</td> : null}
                <td className="num">{formatMoney(item.line_total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ReceiptTotals
        subtotalPaisa={order.subtotal}
        discountPaisa={order.discount_amount}
        discountCode={order.discount_code}
        deliveryChargePaisa={order.delivery_charge}
        taxRows={taxRows}
        totalPaisa={order.total}
        advancePaidPaisa={order.advance_paid}
      />

      {order.payment_method === 'cod' && balanceDue > 0 ? (
        <div style={{ marginTop: 8, marginLeft: 'auto', width: '60mm' }}>
          <CodBig amountPaisa={balanceDue} label="Cash on Delivery Due" />
        </div>
      ) : null}

      <AmountWords paisa={order.total} />

      <footer className="receipt-footer">
        <div>
          <div>Payment method: {PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}</div>
          {footerText ? <div>{footerText}</div> : null}
        </div>
        <QrBlock dataUrl={qrSrc} />
      </footer>
    </div>
  )
}
