import { notFound } from 'next/navigation'

import { t, type Lang } from '@/lib/i18n'
import { getOrgSettings, settingBool, settingNum, settingStr } from '@/lib/settings'
import type { PageProps } from '@/lib/types'

import { CheckoutForm, type CheckoutSettings } from '@/components/store/checkout-form'
import { getStoreOrg } from '@/components/store/get-store-org'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({ params }: PageProps<{ org: string }>) {
  const { org: orgSlug } = await params
  const org = await getStoreOrg(orgSlug)
  if (!org) notFound()

  const settings = await getOrgSettings(org.id)
  const lang = settingStr(settings, 'localization.language') as Lang

  const checkoutSettings: CheckoutSettings = {
    orgSlug: org.slug,
    lang,
    codEnabled: settingBool(settings, 'payments.cod_enabled'),
    advanceRequiredSetting: settingBool(settings, 'payments.advance_required'),
    advanceAmount: settingNum(settings, 'payments.advance_amount'),
    advanceType: settingStr(settings, 'payments.advance_type'),
    freeDeliveryAbove: settingNum(settings, 'delivery.free_above'),
    bankDetails: settingStr(settings, 'payments.bank_details'),
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-semibold">{t('checkout', lang)}</h1>
      <CheckoutForm settings={checkoutSettings} />
    </div>
  )
}
