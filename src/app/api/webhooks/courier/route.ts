// Generic courier status webhook (docs/architecture.md §1/§8 route map —
// "stubs, signature-verify pattern"). Each DZ courier (Yalidine/ZR Express/
// Noest Express/Guepex) has its own webhook auth scheme (shared secret /
// signature header) that isn't specified in docs/architecture.md §8 yet, so
// this stub intentionally does NOT trust the payload enough to mutate
// `deliveries.status` — it only appends a delivery_events row (an audit trail
// entry), the same low-risk shape the admin-typed manual courier flow already
// produces. Wiring real per-courier signature verification + a
// status-transition action (through DELIVERY_STATUS_FLOW, src/lib/status.ts)
// is a follow-up.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface CourierWebhookBody {
  tracking_code?: string
  status?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CourierWebhookBody
    const trackingCode = body.tracking_code
    if (!trackingCode) {
      return NextResponse.json({ error: 'Missing tracking_code' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data: delivery, error } = await admin
      .from('deliveries')
      .select('id, org_id')
      .eq('tracking_code', trackingCode)
      .maybeSingle()

    if (error || !delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const { error: insertError } = await admin.from('delivery_events').insert({
      org_id: delivery.org_id as string,
      delivery_id: delivery.id as string,
      status: body.status ?? null,
      note: 'courier webhook',
    })

    if (insertError) {
      throw new Error(insertError.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhooks/courier] failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
