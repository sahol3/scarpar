import Link from 'next/link'

import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/db'

import { storePath } from './store-links'

export interface ProductCardData
  extends Pick<
    Product,
    'id' | 'slug' | 'name' | 'price' | 'compare_at_price' | 'track_stock' | 'stock_qty' | 'allow_backorder'
  > {
  image: string | null
}

export function ProductCard({
  orgSlug,
  product,
  lang = 'ar',
}: {
  orgSlug: string
  product: ProductCardData
  lang?: Lang
}) {
  const outOfStock = product.track_stock && product.stock_qty <= 0 && !product.allow_backorder
  const hasDiscount = product.compare_at_price != null && product.compare_at_price > product.price

  return (
    <Link
      href={storePath(orgSlug, `/product/${product.slug}`)}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-2xs flex size-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
        {outOfStock ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <span className="text-2xs rounded-md bg-foreground px-2 py-1 font-medium text-background">
              {t('out_of_stock', lang)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-foreground">{product.name}</p>
        <div className="flex items-baseline gap-2">
          <span className={cn('text-sm font-semibold tabular-nums', hasDiscount && 'text-destructive')}>
            {formatMoney(product.price)}
          </span>
          {hasDiscount ? (
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {formatMoney(product.compare_at_price as number)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
