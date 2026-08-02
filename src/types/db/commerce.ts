// src/types/db/commerce.ts — row types for supabase/migrations/0002_commerce.sql
// number = bigint/int, string|null = nullable. Do not edit index.ts/core.ts from here.

// ---------------------------------------------------------------------------
// Status / enum unions (mirror the SQL check constraints exactly)
// ---------------------------------------------------------------------------

export type ProductStatus = 'draft' | 'active' | 'archived'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned'
  | 'failed'

/** orders.payment_status */
export type PaymentStatus = 'unpaid' | 'advance_paid' | 'paid' | 'refunded' | 'partial_refund'

export type ChannelType = 'storefront' | 'pos' | 'manual'

export type PaymentMethod = 'cod' | 'bank' | 'cash'

export type RiskLevel = 'low' | 'medium' | 'high'

export type DiscountType = 'percent' | 'fixed' | 'free_shipping'

export type DiscountScope = 'all' | 'products' | 'categories'

export type InventoryMovementType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'release'

export type OrderEventType = 'status' | 'payment' | 'delivery' | 'note' | 'system'

export type PaymentKind = 'advance' | 'full' | 'balance' | 'refund'

/** payments.status — distinct from orders.payment_status above */
export type PaymentVerificationStatus = 'pending' | 'verified' | 'failed' | 'refunded'

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded'

export type ReturnResolution = 'refund' | 'store_credit' | 'exchange'

export type ReviewStatus = 'pending' | 'published' | 'rejected'

export type BlocklistKind = 'phone' | 'address' | 'ip'

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

export interface Category {
  id: string
  org_id: string
  name: string
  slug: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface Product {
  id: string
  org_id: string
  name: string
  slug: string
  description: string | null
  brand: string | null
  category_id: string | null
  status: ProductStatus
  price: number
  compare_at_price: number | null
  cost_price: number | null
  sku: string | null
  barcode: string | null
  hs_code: string | null
  track_stock: boolean
  stock_qty: number
  low_stock_threshold: number
  allow_backorder: boolean
  weight_grams: number | null
  tags: string[] | null
  attributes: Record<string, unknown>
  seo: Record<string, unknown> | null
  is_featured: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface ProductVariant {
  id: string
  org_id: string
  product_id: string
  name: string
  sku: string | null
  price: number
  compare_at_price: number | null
  stock_qty: number
  options: Record<string, unknown>
  is_default: boolean
  position: number
  created_at: string
}

export interface ProductImage {
  id: string
  org_id: string
  product_id: string
  variant_id: string | null
  media_id: string
  position: number
  created_at: string
}

export interface InventoryMovement {
  id: number
  org_id: string
  product_id: string
  variant_id: string | null
  qty_delta: number
  type: InventoryMovementType
  reference: string | null
  note: string | null
  actor_id: string | null
  created_at: string
}

export interface Customer {
  id: string
  org_id: string
  name: string
  phone: string
  email: string | null
  notes: string | null
  tags: string[] | null
  total_spent: number
  orders_count: number
  last_order_at: string | null
  is_blocked: boolean
  created_at: string
}

export interface CustomerAddress {
  id: string
  org_id: string
  customer_id: string
  label: string | null
  recipient: string
  phone: string
  line1: string
  area: string | null
  district: string
  postcode: string | null
  is_default: boolean
  created_at: string
}

export interface Discount {
  id: string
  org_id: string
  code: string | null
  title: string
  type: DiscountType
  value: number | null
  scope: DiscountScope
  product_ids: string[] | null
  category_ids: string[] | null
  min_order: number
  max_uses: number | null
  used_count: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface Order {
  id: string
  org_id: string
  order_no: string
  channel: ChannelType
  customer_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string | null
  address: Record<string, unknown> | null
  delivery_zone_id: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal: number
  discount_amount: number
  discount_code: string | null
  delivery_charge: number
  tax_amount: number
  total: number
  advance_due: number
  advance_paid: number
  payment_method: PaymentMethod
  risk_level: RiskLevel | null
  risk_note: string | null
  tags: string[] | null
  note_internal: string | null
  note_customer: string | null
  source_meta: Record<string, unknown> | null
  placed_at: string
  confirmed_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  updated_at: string
}

export interface OrderItem {
  id: string
  org_id: string
  order_id: string
  product_id: string | null
  variant_id: string | null
  product_name: string
  variant_name: string | null
  sku: string | null
  image_path: string | null
  unit_price: number
  qty: number
  line_total: number
  created_at: string
}

export interface OrderEvent {
  id: number
  org_id: string
  order_id: string
  type: OrderEventType
  message: string | null
  data: Record<string, unknown> | null
  actor_id: string | null
  created_at: string
}

export interface Payment {
  id: string
  org_id: string
  order_id: string
  method: PaymentMethod
  kind: PaymentKind
  amount: number
  status: PaymentVerificationStatus
  provider_ref: string | null
  sender_number: string | null
  screenshot_media_id: string | null
  verified_by: string | null
  verified_at: string | null
  note: string | null
  created_at: string
}

/** returns table — named ReturnRequest ('Return' is a reserved-ish name to avoid) */
export interface ReturnRequest {
  id: string
  org_id: string
  order_id: string
  return_no: string
  status: ReturnStatus
  reason: string | null
  resolution: ReturnResolution | null
  refund_amount: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface ReturnItem {
  id: string
  org_id: string
  return_id: string
  order_item_id: string
  qty: number
  condition: string | null
  created_at: string
}

export interface Review {
  id: string
  org_id: string
  product_id: string
  order_id: string | null
  customer_name: string
  rating: number
  title: string | null
  body: string | null
  status: ReviewStatus
  is_verified: boolean
  created_at: string
}

export interface BlocklistEntry {
  id: string
  org_id: string
  kind: BlocklistKind
  value: string
  reason: string | null
  created_by: string | null
  created_at: string
}
