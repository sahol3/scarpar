import type { DeliveryCourier } from '@/types/db'
import { ConfigRequiredError } from './types'
import type { CourierAdapter } from './types'
import { manualAdapter } from './manual'
import { yalidineAdapter } from './yalidine'
import { zrExpressAdapter } from './zr-express'
import { noestExpressAdapter } from './noest-express'
import { guepexAdapter } from './guepex'

export * from './types'

const ADAPTERS: Partial<Record<DeliveryCourier, CourierAdapter>> = {
  manual: manualAdapter,
  yalidine: yalidineAdapter,
  zr_express: zrExpressAdapter,
  noest_express: noestExpressAdapter,
  guepex: guepexAdapter,
}

/**
 * docs/architecture.md §8 — getAdapter(courier). Every DeliveryCourier value
 * has an adapter today (all 4 real couriers ship guarded/stubbed, same as
 * manual) — the fallback below only fires if a new courier value is added to
 * the enum without a matching adapter.
 */
export function getAdapter(courier: DeliveryCourier): CourierAdapter {
  const adapter = ADAPTERS[courier]
  if (!adapter) {
    throw new ConfigRequiredError(`${courier} isn't supported yet — use manual tracking instead`)
  }
  return adapter
}
