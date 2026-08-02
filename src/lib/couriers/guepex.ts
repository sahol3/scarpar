import { fromPaisa } from '@/lib/money'
import { ConfigRequiredError, requireCourierConfig } from './types'
import type { CourierAdapter, CourierOrderInput, CourierOrderResult, CourierStatusResult } from './types'

// Guepex API (docs/architecture.md §8). STUBBED per §13: no publicly
// documented request/response shape yet — guarded execution, throws until an
// org configures real keys, same contract shape as the other DZ adapters.
const BASE_URL = 'https://api.guepex-dz.com/v1'

interface GuepexConfig {
  api_key?: string
}

function authHeaders(config: GuepexConfig): HeadersInit {
  if (!config.api_key) {
    throw new ConfigRequiredError('Configure Guepex API key in courier settings')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api_key}`,
  }
}

export const guepexAdapter: CourierAdapter = {
  key: 'guepex',

  async createOrder(ctx, input: CourierOrderInput): Promise<CourierOrderResult> {
    const config = (await requireCourierConfig(ctx, 'guepex', 'Guepex')) as GuepexConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/shipments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reference: input.orderNo,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        recipient_address: input.recipientAddress,
        wilaya: input.district ?? '',
        cod_amount: Math.round(fromPaisa(input.codAmount)),
        note: input.note ?? '',
      }),
    })

    if (!res.ok) {
      throw new Error(`Guepex create shipment failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { id?: string; tracking_number?: string }
    if (!data.id || !data.tracking_number) {
      throw new Error('Guepex create shipment returned no id/tracking number')
    }

    return { consignmentId: data.id, trackingCode: data.tracking_number }
  },

  async getStatus(ctx, consignmentId: string): Promise<CourierStatusResult> {
    const config = (await requireCourierConfig(ctx, 'guepex', 'Guepex')) as GuepexConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/shipments/${encodeURIComponent(consignmentId)}`, { headers })

    if (!res.ok) {
      throw new Error(`Guepex status lookup failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { status?: string }
    return { status: data.status ?? 'unknown', raw: data }
  },
}
