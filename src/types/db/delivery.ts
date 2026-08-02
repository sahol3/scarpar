// src/types/db/delivery.ts
// Delivery, rider, courier, and COD types — mirrors supabase/migrations/0003_delivery_cms_ops.sql
// and supabase/migrations/0006_courier_wilaya_rates.sql.
// Money columns are bigint paisa in the DB, mapped to TS `number` per docs/conventions.md.

export interface DeliveryZone {
  id: string
  org_id: string
  name: string
  districts: string[]
  charge: number
  cod_available: boolean
  advance_required: boolean
  eta_text: string | null
  is_active: boolean
  position: number
  created_at: string
}

export type DeliveryPricingType = 'home' | 'stopdesk'

/** Per-courier, per-wilaya flat rate — supabase/migrations/0006_courier_wilaya_rates.sql. */
export interface CourierWilayaRate {
  id: string
  org_id: string
  courier: DeliveryCourier
  wilaya_code: string
  wilaya_name: string
  delivery_type: DeliveryPricingType
  price: number
  return_price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Rider {
  id: string
  org_id: string
  user_id: string | null
  name: string
  phone: string
  vehicle: string | null
  is_active: boolean
  cash_on_hand: number
  created_at: string
}

export type DeliveryMethod = 'rider' | 'courier' | 'pickup'
export type DeliveryCourier = 'yalidine' | 'zr_express' | 'noest_express' | 'guepex' | 'manual'
export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'returned'

export interface Delivery {
  id: string
  org_id: string
  order_id: string
  delivery_no: string
  method: DeliveryMethod
  rider_id: string | null
  courier: DeliveryCourier | null
  consignment_id: string | null
  tracking_code: string | null
  status: DeliveryStatus
  cod_amount: number
  cod_collected: boolean
  cod_collected_at: string | null
  settlement_id: string | null
  otp_code: string | null
  proof_media_id: string | null
  recipient_name: string | null
  recipient_phone: string | null
  address: Record<string, unknown> | null
  zone_id: string | null
  fee: number
  assigned_at: string | null
  delivered_at: string | null
  failed_reason: string | null
  updated_at: string
  created_at: string
}

// Timeline table: bigint identity id (see docs/architecture.md §3 "Timeline tables").
export interface DeliveryEvent {
  id: number
  org_id: string
  delivery_id: string
  status: string | null
  note: string | null
  location: string | null
  actor_id: string | null
  created_at: string
}

export interface CodSettlement {
  id: string
  org_id: string
  rider_id: string
  amount: number
  delivery_ids: string[]
  note: string | null
  settled_by: string | null
  created_at: string
}

export interface CourierAccount {
  id: string
  org_id: string
  courier: string
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
}
