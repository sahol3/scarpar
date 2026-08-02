import { Bike, Store, Truck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { DeliveryCourier, DeliveryMethod } from "@/types/db"

const COURIER_LABELS: Record<DeliveryCourier, string> = {
  yalidine: "Yalidine",
  zr_express: "ZR Express",
  noest_express: "Noest Express",
  guepex: "Guepex",
  manual: "Manual",
}

interface DeliveryMethodBadgeProps {
  method: DeliveryMethod
  riderName?: string | null
  courier?: DeliveryCourier | null
  className?: string
}

/** Shared method+carrier chip — used by both the deliveries list and detail header. */
function DeliveryMethodBadge({ method, riderName, courier, className }: DeliveryMethodBadgeProps) {
  if (method === "rider") {
    return (
      <Badge variant="outline" className={className}>
        <Bike className="size-3" />
        {riderName ?? "Rider (unassigned)"}
      </Badge>
    )
  }

  if (method === "courier") {
    return (
      <Badge variant="outline" className={className}>
        <Truck className="size-3" />
        {courier ? COURIER_LABELS[courier] : "Courier"}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className={className}>
      <Store className="size-3" />
      Pickup
    </Badge>
  )
}

export { DeliveryMethodBadge }
