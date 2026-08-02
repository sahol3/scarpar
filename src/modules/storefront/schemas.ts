import { z } from 'zod'

// Storefront zod schemas (docs/conventions.md — Server actions: "Validate with zod schema
// from src/modules/<key>/schemas.ts"). Consumed by src/modules/storefront/actions.ts and by
// client forms (react-hook-form + zodResolver) in src/components/store/**.

/** BD mobile: 11 digits, 01[3-9]XXXXXXXX. */
export const BD_PHONE_REGEX = /^01[3-9]\d{8}$/

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined))

const optionalEmail = z
  .string()
  .trim()
  .email('Enter a valid email')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: z
    .string()
    .trim()
    .regex(BD_PHONE_REGEX, 'Enter a valid 11-digit phone number (01XXXXXXXXX)'),
  email: optionalEmail,
})

export const addressSchema = z.object({
  line1: z.string().trim().min(3, 'Address is required').max(300),
  area: optionalTrimmed(150),
  district: z.string().trim().min(2, 'Select a district'),
})

export const cartItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  qty: z.number().int().positive().max(999),
})
export type CartItemInput = z.infer<typeof cartItemInputSchema>

export const quoteDeliverySchema = z.object({
  orgSlug: z.string().min(1),
  district: z.string().trim().min(1, 'Select a district'),
})
export type QuoteDeliveryInput = z.infer<typeof quoteDeliverySchema>

export const applyDiscountSchema = z.object({
  orgSlug: z.string().min(1),
  code: z.string().trim().min(1, 'Enter a discount code').max(64),
  items: z.array(cartItemInputSchema).min(1),
})
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>

export const paymentMethodSchema = z.enum(['cod'])

export const placeOrderSchema = z.object({
  orgSlug: z.string().min(1),
  contact: contactSchema,
  address: addressSchema,
  items: z.array(cartItemInputSchema).min(1, 'Your cart is empty'),
  discountCode: optionalTrimmed(64),
  paymentMethod: paymentMethodSchema,
  /** Bank transfer reference, only used when an advance payment is required before COD. */
  trxId: optionalTrimmed(64),
  /** Payer name/number for the bank transfer, only used when an advance payment is required. */
  senderNumber: optionalTrimmed(20),
  noteCustomer: optionalTrimmed(500),
})
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>

export const reviewSchema = z.object({
  orgSlug: z.string().min(1),
  productId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  customerName: z.string().trim().min(2, 'Name is required').max(120),
  rating: z.number().int().min(1).max(5),
  title: optionalTrimmed(150),
  body: optionalTrimmed(2000),
})
export type ReviewInput = z.infer<typeof reviewSchema>

export const inquirySchema = z.object({
  orgSlug: z.string().min(1),
  productId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: optionalTrimmed(20),
  email: optionalEmail,
  message: z.string().trim().min(1, 'Message is required').max(2000),
})
export type InquiryInput = z.infer<typeof inquirySchema>
