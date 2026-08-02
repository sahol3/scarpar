// Zod schemas for the orders + returns slice (docs/conventions.md — Server actions).
// Money fields that come from a form are collected as taka strings and converted to
// paisa server-side in actions.ts via src/lib/money.ts toPaisa() — never float math.
import { z } from 'zod'

export const OrderStatusValues = [
  'pending',
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
  'completed',
  'cancelled',
  'returned',
  'failed',
] as const

export const PaymentMethodValues = [
  'cod',
  'bank',
  'cash',
] as const

export const PaymentKindValues = ['advance', 'full', 'balance'] as const

export const RiskLevelValues = ['low', 'medium', 'high'] as const

export const ReturnStatusValues = ['requested', 'approved', 'rejected', 'received', 'refunded'] as const

export const ReturnResolutionValues = ['refund', 'store_credit', 'exchange'] as const

const emptyToUndefined = (v: string) => (v.trim() === '' ? undefined : v.trim())

const PhoneSchema = z.string().trim().min(6, 'Enter a valid phone number').max(20)

// ---------------------------------------------------------------------------
// New manual order
// ---------------------------------------------------------------------------

export const OrderCustomerInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  phone: PhoneSchema,
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined))
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
})

export const OrderAddressInputSchema = z.object({
  line1: z.string().trim().min(1, 'Address line is required').max(300),
  area: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
  district: z.string().trim().min(1, 'District is required'),
  postcode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})

export const OrderLineItemInputSchema = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  product_name: z.string().trim().min(1).max(300),
  variant_name: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  // paisa — authoritative only for non-catalog (custom) lines; catalog-linked lines
  // are re-priced server-side from products/product_variants (never trust the client).
  unit_price: z.number().int().nonnegative(),
  qty: z.number().int().positive().max(9999),
})

export const CreateManualOrderSchema = z.object({
  customer: OrderCustomerInputSchema,
  address: OrderAddressInputSchema,
  delivery_zone_id: z.string().uuid().optional(),
  // paisa — only used when no delivery_zone_id (module disabled or no zones configured)
  manual_delivery_charge: z.number().int().nonnegative().optional(),
  items: z.array(OrderLineItemInputSchema).min(1, 'Add at least one item'),
  discount_code: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
  payment_method: z.enum(PaymentMethodValues),
  advance_amount: z.string().trim().optional(), // taka string
  note_internal: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
  confirm_immediately: z.boolean().default(false),
})

export type CreateManualOrderInput = z.infer<typeof CreateManualOrderSchema>

// ---------------------------------------------------------------------------
// Status / risk / notes / tags
// ---------------------------------------------------------------------------

export const UpdateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  nextStatus: z.enum(OrderStatusValues),
})
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>

export const UpdateRiskSchema = z.object({
  orderId: z.string().uuid(),
  risk_level: z.enum(RiskLevelValues),
  risk_note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})
export type UpdateRiskInput = z.infer<typeof UpdateRiskSchema>

export const UpdateOrderNoteSchema = z.object({
  orderId: z.string().uuid(),
  note_internal: z.string().trim().max(4000),
})
export type UpdateOrderNoteInput = z.infer<typeof UpdateOrderNoteSchema>

export const UpdateOrderTagsSchema = z.object({
  orderId: z.string().uuid(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
})
export type UpdateOrderTagsInput = z.infer<typeof UpdateOrderTagsSchema>

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const RecordPaymentSchema = z.object({
  orderId: z.string().uuid(),
  kind: z.enum(PaymentKindValues),
  method: z.enum(PaymentMethodValues),
  amount: z.string().trim().min(1, 'Amount is required'), // taka string
  provider_ref: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
  sender_number: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>

export const RejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})
export type RejectPaymentInput = z.infer<typeof RejectPaymentSchema>

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export const CreateReturnItemSchema = z.object({
  order_item_id: z.string().uuid(),
  qty: z.number().int().positive(),
  condition: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})

export const CreateReturnSchema = z.object({
  orderId: z.string().uuid(),
  items: z.array(CreateReturnItemSchema).min(1, 'Select at least one item'),
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})
export type CreateReturnInput = z.infer<typeof CreateReturnSchema>

export const UpdateReturnStatusSchema = z.object({
  returnId: z.string().uuid(),
  nextStatus: z.enum(ReturnStatusValues),
})
export type UpdateReturnStatusInput = z.infer<typeof UpdateReturnStatusSchema>

export const RefundReturnSchema = z.object({
  returnId: z.string().uuid(),
  refund_amount: z.string().trim().min(1, 'Refund amount is required'), // taka string
  method: z.enum(PaymentMethodValues),
  resolution: z.enum(ReturnResolutionValues).default('refund'),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? emptyToUndefined(v) : undefined)),
})
// z.input (not z.infer/z.output): `resolution` has a `.default()`, so the PRE-parse
// shape has it optional while the POST-parse shape has it required. react-hook-form
// + zodResolver need the pre-parse (input) shape for the form's field values —
// RefundReturnSchema.parse(...) still fills the default at parse time regardless.
export type RefundReturnInput = z.input<typeof RefundReturnSchema>

/** requested->approved|rejected; approved->received; received->refunded (docs brief, orders slice). */
export const RETURN_STATUS_FLOW: Record<(typeof ReturnStatusValues)[number], (typeof ReturnStatusValues)[number][]> = {
  requested: ['approved', 'rejected'],
  approved: ['received'],
  rejected: [],
  received: ['refunded'],
  refunded: [],
}
