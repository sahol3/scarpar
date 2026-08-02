'use client'

import { X } from 'lucide-react'

import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'

import type { CartItem } from './cart-context'
import { useCart } from './cart-context'
import { QtyStepper } from './qty-stepper'

export function CartLineItem({ item, lang = 'ar' }: { item: CartItem; lang?: Lang }) {
  const { setQty, remove } = useCart()

  return (
    <div className="flex gap-3 border-b border-border py-4 last:border-b-0">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="size-full object-cover" />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{item.name}</p>
            {item.variantName ? <p className="text-xs text-muted-foreground">{item.variantName}</p> : null}
          </div>
          <button
            type="button"
            aria-label={t('remove', lang)}
            onClick={() => remove(item.productId, item.variantId)}
            className="text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <QtyStepper size="sm" value={item.qty} onChange={(qty) => setQty(item.productId, item.variantId, qty)} />
          <span className="text-sm font-semibold tabular-nums">{formatMoney(item.unitPrice * item.qty)}</span>
        </div>
      </div>
    </div>
  )
}
