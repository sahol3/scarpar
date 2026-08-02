// Courier adapter contract (docs/architecture.md §8 — binding contract).
// Server-only: adapters call external courier APIs with org secrets pulled from
// courier_accounts.config. Never import this from a 'use client' component.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/couriers/* must never be imported into client-side code.')
}

import { getServerClient } from '@/lib/supabase/server'
import type { OrgContext } from '@/lib/auth'
import type { DeliveryCourier } from '@/types/db'

/**
 * Thrown by a real adapter (yalidine/zr_express/noest_express/guepex) when the
 * org has no active courier_accounts row (or is missing required keys within
 * it). Callers (src/modules/delivery/actions.ts) return `err.message` as the
 * action's error string; the UI surfaces it as a toast with a fallback
 * suggestion to switch to the manual adapter.
 */
export class ConfigRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigRequiredError'
  }
}

/**
 * docs/architecture.md §8 shape is `createOrder(delivery, order)`. Reshaped here
 * as flattened, already-validated fields because the delivery row doesn't exist
 * yet at call time — src/modules/delivery/actions.ts calls the adapter BEFORE
 * inserting the deliveries row so the returned consignmentId/trackingCode can be
 * stored on that same insert.
 */
export interface CourierOrderInput {
  orderNo: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  district?: string | null
  /** paisa */
  codAmount: number
  note?: string | null
  /** manual adapter only — admin-typed tracking code; blank generates a local reference. */
  manualTrackingCode?: string | null
}

export interface CourierOrderResult {
  consignmentId: string
  trackingCode: string
}

export interface CourierStatusResult {
  status: string
  raw?: unknown
}

export interface CourierZone {
  id: string | number
  name: string
}

export interface CourierAdapter {
  key: DeliveryCourier
  createOrder(ctx: OrgContext, input: CourierOrderInput): Promise<CourierOrderResult>
  getStatus(ctx: OrgContext, consignmentId: string): Promise<CourierStatusResult>
  zones?(ctx: OrgContext): Promise<CourierZone[]>
}

/**
 * Shared config loader for the real adapters. First line of every DZ courier
 * call per docs/architecture.md §8 ("guarded: if no courier_accounts config, throw
 * ConfigRequired"). Reads via the RLS-scoped server client — the caller is already
 * inside a requireOrg()'d server action, so the member's session can read its own
 * org's courier_accounts row directly.
 */
export async function requireCourierConfig(
  ctx: OrgContext,
  courier: Extract<DeliveryCourier, 'yalidine' | 'zr_express' | 'noest_express' | 'guepex'>,
  friendlyName: string,
): Promise<Record<string, unknown>> {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('courier_accounts')
    .select('config, is_active')
    .eq('org_id', ctx.org.id)
    .eq('courier', courier)
    .maybeSingle()

  if (error || !data || !data.is_active) {
    throw new ConfigRequiredError(`Configure ${friendlyName} API keys in courier settings`)
  }

  return (data.config ?? {}) as Record<string, unknown>
}
