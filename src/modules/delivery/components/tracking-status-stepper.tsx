import { Check } from "lucide-react"

import { type Lang, t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const HAPPY_PATH_STATUSES = ["pending", "assigned", "picked_up", "in_transit", "delivered"] as const

/** Brand-neutral visual stepper for the public /track/[code] page. `lang` defaults to 'ar'
 *  since this page doesn't yet resolve the org's localization.language setting (get_tracking()
 *  returns org_name only, not org_id) — fr labels are ready in src/lib/i18n.ts for when it does. */
function TrackingStatusStepper({ status, lang = "ar" }: { status: string; lang?: Lang }) {
  if (status === "failed" || status === "returned") {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm font-medium">
        {status === "failed"
          ? "Delivery attempt failed — we will be in touch."
          : "This delivery was returned."}
      </div>
    )
  }

  const happyPath = HAPPY_PATH_STATUSES.map((value) => ({ value, label: t(value, lang) }))
  const currentIndex = Math.max(
    0,
    happyPath.findIndex((step) => step.value === status),
  )

  return (
    <ol className="flex items-center gap-1">
      {happyPath.map((step, index) => {
        const done = index <= currentIndex
        return (
          <li key={step.value} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </div>
              {index < happyPath.length - 1 ? (
                <div className={cn("mx-1 h-px flex-1", index < currentIndex ? "bg-primary" : "bg-border")} />
              ) : null}
            </div>
            <span
              className={cn(
                "text-center text-[11px] leading-tight",
                done ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export { TrackingStatusStepper }
