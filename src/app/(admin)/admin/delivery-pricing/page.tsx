import { PageHeader } from "@/components/ui/page-header"
import { requireOrg } from "@/lib/auth"
import { requireModule } from "@/lib/modules"
import { getServerClient } from "@/lib/supabase/server"
import { CourierRatesTable } from "@/modules/delivery/components/courier-rates-table"
import type { CourierWilayaRate } from "@/types/db"

export const dynamic = "force-dynamic"

export default async function DeliveryPricingPage() {
  const ctx = await requireOrg()
  requireModule(ctx.org, "delivery")

  const supabase = await getServerClient()
  const { data: rates } = await supabase
    .from("courier_wilaya_rates")
    .select("*")
    .eq("org_id", ctx.org.id)
    .order("courier")
    .order("wilaya_code")

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader
        title="Courier Pricing"
        description="Per-wilaya delivery fees for each courier (home delivery vs stopdesk)."
      />
      <CourierRatesTable initialRates={(rates ?? []) as CourierWilayaRate[]} />
    </div>
  )
}
