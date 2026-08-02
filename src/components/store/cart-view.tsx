'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'

import { CartLineItem } from './cart-line-item'
import { useCart } from './cart-context'
import { storePath } from './store-links'

export function CartView({ orgSlug, lang = 'ar' }: { orgSlug: string; lang?: Lang }) {
  const { items, subtotal, mounted } = useCart()

  if (!mounted) {
    return <div className="h-64" aria-hidden />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title={t('cart_empty', lang)}
        action={
          <Button asChild>
            <Link href={storePath(orgSlug, '/products')}>{t('continue_shopping', lang)}</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {items.map((item) => (
          <CartLineItem key={`${item.productId}-${item.variantId ?? ''}`} item={item} lang={lang} />
        ))}
      </div>

      <div className="flex h-fit flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('subtotal', lang)}</span>
          <span className="font-semibold tabular-nums">{formatMoney(subtotal)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Delivery calculated at checkout.</p>
        <Button asChild size="lg">
          <Link href={storePath(orgSlug, '/checkout')}>{t('checkout', lang)}</Link>
        </Button>
      </div>
    </div>
  )
}
