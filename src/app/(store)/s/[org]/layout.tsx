import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { getOrgSettings, settingStr } from '@/lib/settings'
import { getAnonClient } from '@/lib/supabase/anon'
import { langDir, type Lang } from '@/lib/i18n'
import type { LayoutProps } from '@/lib/types'
import type { Menu } from '@/types/db'

import { AnnouncementBar } from '@/components/store/announcement-bar'
import { CartProvider } from '@/components/store/cart-context'
import { getStoreOrg } from '@/components/store/get-store-org'
import { StoreFooter } from '@/components/store/store-footer'
import { StoreHeader } from '@/components/store/store-header'
import { WhatsappFloat } from '@/components/store/whatsapp-float'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string }>
}): Promise<Metadata> {
  const { org: orgSlug } = await params
  const org = await getStoreOrg(orgSlug)
  if (!org) return {}

  return {
    title: { default: org.name, template: `%s · ${org.name}` },
    description: `Shop ${org.name} online.`,
  }
}

export default async function StoreLayout({ params, children }: LayoutProps<{ org: string }>) {
  const { org: orgSlug } = await params
  const org = await getStoreOrg(orgSlug)
  if (!org) notFound()

  const settings = await getOrgSettings(org.id)

  const supabase = getAnonClient()
  const { data: menuRows } = await supabase
    .from('menus')
    .select('handle, items')
    .eq('org_id', org.id)
    .in('handle', ['header', 'footer'])

  const menus = (menuRows ?? []) as Pick<Menu, 'handle' | 'items'>[]
  const headerItems = menus.find((m) => m.handle === 'header')?.items ?? []
  const footerItems = menus.find((m) => m.handle === 'footer')?.items ?? []

  const announcement = settingStr(settings, 'storefront.announcement')
  const whatsappNumber = settingStr(settings, 'storefront.whatsapp_number')
  const primaryColor = settingStr(settings, 'storefront.primary_color')
  const lang = settingStr(settings, 'localization.language') as Lang
  const dir = langDir(lang)

  return (
    <CartProvider orgSlug={org.slug}>
      <div
        dir={dir}
        lang={lang}
        className={`flex min-h-dvh flex-col bg-background text-foreground ${lang === 'ar' ? 'font-arabic' : ''}`}
        style={primaryColor ? ({ '--primary': primaryColor } as CSSProperties) : undefined}
      >
        <AnnouncementBar text={announcement} />
        <StoreHeader org={org} menuItems={headerItems} />
        <main className="flex-1">{children}</main>
        <StoreFooter org={org} menuItems={footerItems} />
        <WhatsappFloat number={whatsappNumber} />
      </div>
    </CartProvider>
  )
}
