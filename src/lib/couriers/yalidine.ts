import { fromPaisa } from '@/lib/money'
import { wilayaCodeForName } from '@/lib/dz'
import { ConfigRequiredError, requireCourierConfig } from './types'
import type { CourierAdapter, CourierOrderInput, CourierOrderResult, CourierStatusResult } from './types'

// Yalidine API v1 (docs/architecture.md §8). STUBBED per §13: real
// request/response shapes, guarded execution — never called until an org
// activates a courier_accounts row with real API-ID/API-TOKEN credentials.
const BASE_URL = 'https://api.yalidine.app/v1'

interface YalidineConfig {
  api_id?: string
  api_token?: string
  /** Org's own from_wilaya_name, e.g. "Alger" — used as the parcel's sender wilaya. */
  from_wilaya_name?: string
}

function authHeaders(config: YalidineConfig): HeadersInit {
  if (!config.api_id || !config.api_token) {
    throw new ConfigRequiredError('Configure Yalidine API-ID/API-TOKEN in courier settings')
  }
  return {
    'Content-Type': 'application/json',
    'X-API-ID': config.api_id,
    'X-API-TOKEN': config.api_token,
  }
}

export const yalidineAdapter: CourierAdapter = {
  key: 'yalidine',

  async createOrder(ctx, input: CourierOrderInput): Promise<CourierOrderResult> {
    const config = (await requireCourierConfig(ctx, 'yalidine', 'Yalidine')) as YalidineConfig
    const headers = authHeaders(config)
    if (!config.from_wilaya_name) {
      throw new ConfigRequiredError('Configure Yalidine sender wilaya in courier settings')
    }

    const toWilayaName = input.district ?? undefined
    const res = await fetch(`${BASE_URL}/parcels`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          order_id: input.orderNo,
          from_wilaya_name: config.from_wilaya_name,
          firstname: input.recipientName,
          contact_phone: input.recipientPhone,
          address: input.recipientAddress,
          to_wilaya_name: toWilayaName,
          to_commune_name: toWilayaName,
          product_list: `Order ${input.orderNo}`,
          price: Math.round(fromPaisa(input.codAmount)),
          do_insurance: false,
          declared_value: Math.round(fromPaisa(input.codAmount)),
          height: 10,
          width: 10,
          length: 10,
          weight: 1,
          freeshipping: false,
          has_exchange: false,
        },
      ]),
    })

    if (!res.ok) {
      throw new Error(`Yalidine create parcel failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as Record<string, { success?: boolean; tracking?: string; label?: string }>
    const result = Object.values(data)[0]
    if (!result?.success || !result.tracking) {
      throw new Error('Yalidine create parcel did not return a tracking number')
    }

    return { consignmentId: result.tracking, trackingCode: result.tracking }
  },

  async getStatus(ctx, consignmentId: string): Promise<CourierStatusResult> {
    const config = (await requireCourierConfig(ctx, 'yalidine', 'Yalidine')) as YalidineConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/parcels/${encodeURIComponent(consignmentId)}`, { headers })

    if (!res.ok) {
      throw new Error(`Yalidine status lookup failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { last_status?: string }
    return { status: data.last_status ?? 'unknown', raw: data }
  },

  async zones(ctx) {
    const config = (await requireCourierConfig(ctx, 'yalidine', 'Yalidine')) as YalidineConfig
    const headers = authHeaders(config)

    const res = await fetch(`${BASE_URL}/wilayas`, { headers })
    if (!res.ok) {
      throw new Error(`Yalidine wilayas lookup failed: ${res.status} ${await res.text()}`)
    }

    const data = (await res.json()) as { data?: { id: number; name: string }[] }
    return (data.data ?? []).map((w) => ({ id: w.id, name: w.name }))
  },
}

// Re-exported for the courier-pricing admin screen (src/modules/delivery) to
// resolve a customer-facing wilaya name to its official code for rate lookups.
export { wilayaCodeForName }
