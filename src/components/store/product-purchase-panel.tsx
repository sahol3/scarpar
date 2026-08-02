'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ProductVariant } from '@/types/db'

import { useCart } from './cart-context'
import { QtyStepper } from './qty-stepper'

export interface PurchaseProduct {
  id: string
  name: string
  price: number
  compare_at_price: number | null
  track_stock: boolean
  stock_qty: number
  allow_backorder: boolean
}

export function ProductPurchasePanel({
  product,
  variants,
  image,
  lang = 'ar',
}: {
  product: PurchaseProduct
  variants: ProductVariant[]
  image: string | null
  lang?: Lang
}) {
  const { add } = useCart()
  const defaultVariant = useMemo(() => variants.find((v) => v.is_default) ?? variants[0] ?? null, [variants])
  const [variantId, setVariantId] = useState<string | null>(defaultVariant?.id ?? null)
  const [qty, setQty] = useState(1)

  const selected = variants.find((v) => v.id === variantId) ?? null
  const price = selected ? selected.price : product.price
  const compareAt = selected ? selected.compare_at_price : product.compare_at_price
  const stock = selected ? selected.stock_qty : product.stock_qty
  const outOfStock = product.track_stock && stock <= 0 && !product.allow_backorder
  const maxQty = product.track_stock && !product.allow_backorder ? Math.max(stock, 1) : 999
  const hasDiscount = compareAt != null && compareAt > price

  function handleAdd() {
    if (outOfStock) return
    add({
      productId: product.id,
      variantId: selected?.id ?? null,
      name: product.name,
      variantName: selected?.name ?? null,
      unitPrice: price,
      image,
      qty,
    })
    toast.success(lang === 'ar' ? 'تمت الإضافة إلى السلة' : 'Ajouté au panier')
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-semibold tabular-nums">{formatMoney(price)}</span>
        {hasDiscount ? (
          <span className="text-sm text-muted-foreground line-through tabular-nums">
            {formatMoney(compareAt as number)}
          </span>
        ) : null}
      </div>

      {variants.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Options</span>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const variantOut = product.track_stock && v.stock_qty <= 0 && !product.allow_backorder
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={variantOut}
                  onClick={() => setVariantId(v.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    v.id === variantId
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                    variantOut && 'cursor-not-allowed opacity-40',
                  )}
                >
                  {v.name}
                  {variantOut ? ` · ${t('out_of_stock', lang)}` : ''}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('quantity', lang)}</span>
        <QtyStepper value={qty} onChange={setQty} max={maxQty} />
      </div>

      <Button type="button" size="lg" className="w-full sm:w-auto" disabled={outOfStock} onClick={handleAdd}>
        {outOfStock ? t('out_of_stock', lang) : t('add_to_cart', lang)}
      </Button>
    </div>
  )
}
