import Link from 'next/link'

import { t, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/db'

import { storePath } from './store-links'

function productsHref(orgSlug: string, opts: { category?: string; query?: string }): string {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.query) params.set('q', opts.query)
  const qs = params.toString()
  return storePath(orgSlug, `/products${qs ? `?${qs}` : ''}`)
}

export function CategoryPills({
  orgSlug,
  categories,
  activeSlug,
  query,
  lang = 'ar',
}: {
  orgSlug: string
  categories: Pick<Category, 'id' | 'name' | 'slug'>[]
  activeSlug?: string
  query?: string
  lang?: Lang
}) {
  if (categories.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={productsHref(orgSlug, { query })}
        className={cn(
          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          !activeSlug ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-accent',
        )}
      >
        {t('all_products', lang)}
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={productsHref(orgSlug, { category: c.slug, query })}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            activeSlug === c.slug
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input hover:bg-accent',
          )}
        >
          {c.name}
        </Link>
      ))}
    </div>
  )
}

export function ProductSearchBox({
  orgSlug,
  query,
  category,
  lang = 'ar',
}: {
  orgSlug: string
  query?: string
  category?: string
  lang?: Lang
}) {
  return (
    <form action={storePath(orgSlug, '/products')} method="GET" className="relative w-full sm:w-72">
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder={t('search', lang)}
        className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-[13px] shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </form>
  )
}
