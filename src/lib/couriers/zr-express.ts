import { fromPaisa } from '@/lib/money'
import { ConfigRequiredError, requireCourierConfig } from './types'
import type { CourierAdapter, CourierOrderInput, CourierOrderResult, CourierStatusResult } from './types'

// ZR Express API (docs/architecture.md §8). STUBBED per §13: no publicly
// documented request/response shape yet — guarded execution, throws until an
// org configures real keys, same contract shape as the other DZ adapters.
const BASE_URL = 'https://procolis.com/api_v1'

interface ZrExpressConfig {
  token?: string
  key?: string
}

function authHeaders(config: ZrExpressConfig): HeadersInit {
  if (!config.token || !config.key) {
    throw new ConfigRequiredError('Configure ZR Express token/key in courier settings')
  }
  return {
    'Content-Type': 'application/json',
    token: config.token,
    key: config.key,
  }
}

export const zrExpressAdapter: CourierAdapter = {
  key: 'zr_express',

  async createOrder(ctx, input: CourierOrderInput): Promise<CourierOrderResult> {
    const config = (await requireCourierConfig(ctx, 'zr_express', 'ZR Express')) as ZrExpressConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/add_colis`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Tracking: input.orderNo,
        TypeLivraison: '0',
        TypeColis: '0',
        Confrimee: '',
        Client: input.recipientName,
        MobileA: input.recipientPhone,
        Adresse: input.recipientAddress,
        IDWilaya: input.district ?? '',
        Commune: input.district ?? '',
        Total: Math.round(fromPaisa(input.codAmount)),
        Note: input.note ?? '',
        TProduit: `Order ${input.orderNo}`,
      }),
    })

    if (!res.ok) {
      throw new Error(`ZR Express add_colis failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { Colis?: { Tracking?: string }[] }
    const tracking = data.Colis?.[0]?.Tracking
    if (!tracking) {
      throw new Error('ZR Express add_colis returned no tracking number')
    }

    return { consignmentId: tracking, trackingCode: tracking }
  },

  async getStatus(ctx, consignmentId: string): Promise<CourierStatusResult> {
    const config = (await requireCourierConfig(ctx, 'zr_express', 'ZR Express')) as ZrExpressConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/lire`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ Colis: [{ Tracking: consignmentId }] }),
    })

    if (!res.ok) {
      throw new Error(`ZR Express status lookup failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { Colis?: { Situation?: string }[] }
    return { status: data.Colis?.[0]?.Situation ?? 'unknown', raw: data }
  },
}
