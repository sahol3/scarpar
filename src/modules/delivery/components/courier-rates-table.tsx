"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DZ_WILAYAS } from "@/lib/dz"
import { fromPaisa, toPaisa } from "@/lib/money"
import type { CourierWilayaRate, DeliveryCourier } from "@/types/db"
import { bulkUpsertCourierWilayaRatesAction } from "../actions"

const COURIERS: { value: DeliveryCourier; label: string }[] = [
  { value: "yalidine", label: "Yalidine" },
  { value: "zr_express", label: "ZR Express" },
  { value: "noest_express", label: "Noest Express" },
  { value: "guepex", label: "Guepex" },
]

interface RateDraft {
  home_price: string
  home_return: string
  stopdesk_price: string
  stopdesk_return: string
}

function emptyDraft(): RateDraft {
  return { home_price: "0", home_return: "0", stopdesk_price: "0", stopdesk_return: "0" }
}

function buildDrafts(rates: CourierWilayaRate[]): Record<string, RateDraft> {
  const byWilaya: Record<string, RateDraft> = {}
  for (const w of DZ_WILAYAS) byWilaya[w.code] = emptyDraft()

  for (const rate of rates) {
    const draft = byWilaya[rate.wilaya_code] ?? emptyDraft()
    if (rate.delivery_type === "home") {
      draft.home_price = String(fromPaisa(rate.price))
      draft.home_return = String(fromPaisa(rate.return_price))
    } else {
      draft.stopdesk_price = String(fromPaisa(rate.price))
      draft.stopdesk_return = String(fromPaisa(rate.return_price))
    }
    byWilaya[rate.wilaya_code] = draft
  }
  return byWilaya
}

/** Bulk pricing grid — one courier at a time, all 58 wilayas, home + stopdesk rates. */
function CourierRatesTable({ initialRates }: { initialRates: CourierWilayaRate[] }) {
  const [courier, setCourier] = React.useState<DeliveryCourier>("yalidine")
  const [drafts, setDrafts] = React.useState<Record<string, RateDraft>>(() =>
    buildDrafts(initialRates.filter((r) => r.courier === "yalidine")),
  )
  const [ratesByCourier, setRatesByCourier] = React.useState<Record<string, CourierWilayaRate[]>>(() => {
    const grouped: Record<string, CourierWilayaRate[]> = {}
    for (const rate of initialRates) {
      grouped[rate.courier] = [...(grouped[rate.courier] ?? []), rate]
    }
    return grouped
  })
  const [saving, setSaving] = React.useState(false)

  function handleCourierChange(next: DeliveryCourier) {
    setCourier(next)
    setDrafts(buildDrafts(ratesByCourier[next] ?? []))
  }

  function updateField(code: string, field: keyof RateDraft, value: string) {
    setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? emptyDraft()), [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const rates = DZ_WILAYAS.flatMap((w) => {
        const draft = drafts[w.code] ?? emptyDraft()
        return [
          {
            courier,
            wilaya_code: w.code,
            wilaya_name: w.name,
            delivery_type: "home" as const,
            price: toPaisa(draft.home_price || "0"),
            return_price: toPaisa(draft.home_return || "0"),
            is_active: true,
          },
          {
            courier,
            wilaya_code: w.code,
            wilaya_name: w.name,
            delivery_type: "stopdesk" as const,
            price: toPaisa(draft.stopdesk_price || "0"),
            return_price: toPaisa(draft.stopdesk_return || "0"),
            is_active: true,
          },
        ]
      })

      const result = await bulkUpsertCourierWilayaRatesAction({ courier, rates })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${COURIERS.find((c) => c.value === courier)?.label} rates saved`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Select value={courier} onValueChange={(v) => handleCourierChange(v as DeliveryCourier)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURIERS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save rates"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-medium">Wilaya</th>
              <th className="p-2 text-left font-medium">Home (دج)</th>
              <th className="p-2 text-left font-medium">Home return (دج)</th>
              <th className="p-2 text-left font-medium">Stopdesk (دج)</th>
              <th className="p-2 text-left font-medium">Stopdesk return (دج)</th>
            </tr>
          </thead>
          <tbody>
            {DZ_WILAYAS.map((w) => {
              const draft = drafts[w.code] ?? emptyDraft()
              return (
                <tr key={w.code} className="border-t">
                  <td className="p-2 whitespace-nowrap">
                    {w.code} — {w.name}
                  </td>
                  {(["home_price", "home_return", "stopdesk_price", "stopdesk_return"] as const).map((field) => (
                    <td key={field} className="p-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-28"
                        value={draft[field]}
                        onChange={(e) => updateField(w.code, field, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { CourierRatesTable }
