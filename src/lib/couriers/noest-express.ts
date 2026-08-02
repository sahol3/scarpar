import { fromPaisa } from '@/lib/money'
import { ConfigRequiredError, requireCourierConfig } from './types'
import type { CourierAdapter, CourierOrderInput, CourierOrderResult, CourierStatusResult } from './types'

// Noest Express API (docs/architecture.md §8). STUBBED per §13: no publicly
// documented request/response shape yet — guarded execution, throws until an
// org configures real keys, same contract shape as the other DZ adapters.
const BASE_URL = 'https://app.noest-dz.com/api/public'

interface NoestConfig {
  api_token?: string
  guid?: string
}

function authBody(config: NoestConfig): { api_token: string; user_guid: string } {
  if (!config.api_token || !config.guid) {
    throw new ConfigRequiredError('Configure Noest Express API token/GUID in courier settings')
  }
  return { api_token: config.api_token, user_guid: config.guid }
}

export const noestExpressAdapter: CourierAdapter = {
  key: 'noest_express',

  async createOrder(ctx, input: CourierOrderInput): Promise<CourierOrderResult> {
    const config = (await requireCourierConfig(ctx, 'noest_express', 'Noest Express')) as NoestConfig
    const auth = authBody(config)

    const res = await fetch(`${BASE_URL}/create/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...auth,
        reference: input.orderNo,
        client: input.recipientName,
        phone: input.recipientPhone,
        adresse: input.recipientAddress,
        wilaya_id: input.district ?? '',
        commune: input.district ?? '',
        montant: Math.round(fromPaisa(input.codAmount)),
        remarque: input.note ?? '',
        produit: `Order ${input.orderNo}`,
        poids: 1,
        stop_desk: 0,
        stock: 0,
      }),
    })

    if (!res.ok) {
      throw new Error(`Noest Express create order failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { tracking?: string }
    if (!data.tracking) {
      throw new Error('Noest Express create order returned no tracking number')
    }

    return { consignmentId: data.tracking, trackingCode: data.tracking }
  },

  async getStatus(ctx, consignmentId: string): Promise<CourierStatusResult> {
    const config = (await requireCourierConfig(ctx, 'noest_express', 'Noest Express')) as NoestConfig
    const auth = authBody(config)

    const res = await fetch(`${BASE_URL}/get/order/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...auth, tracking: consignmentId }),
    })

    if (!res.ok) {
      throw new Error(`Noest Express status lookup failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { status?: string }
    return { status: data.status ?? 'unknown', raw: data }
  },
}
