// Zod contracts for the catalog module (docs/conventions.md — Server actions).
// Two schemas per entity where money is involved: a *FormSchema (client, RHF
// resolver — money fields are taka strings) and an *ActionSchema (server,
// validated by actions.ts — money fields are paisa ints). Components convert
// form values to action input via toPaisa() before calling the server action.

import { z } from 'zod'

// Unicode-aware slug — mirrors src/lib/utils.ts slugify() output (letters/
// digits/hyphens; Arabic/French-safe).
const SLUG_RE = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u
const MONEY_RE = /^\d+(\.\d{1,2})?$/
const INT_RE = /^\d+$/

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const PRODUCT_STATUS_VALUES = ['draft', 'active', 'archived'] as const

/** Client form schema (RHF + zodResolver) — src/modules/catalog/components/product-form.tsx. */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(200)
    .regex(SLUG_RE, 'Lowercase letters, numbers and hyphens only'),
  description: z.string().trim().max(5000).optional(),
  brand: z.string().trim().max(200).optional(),
  category_id: z.string().uuid().nullable(),
  status: z.enum(PRODUCT_STATUS_VALUES),
  price: z.string().trim().min(1, 'Price is required').regex(MONEY_RE, 'Enter a valid amount, e.g. 1200.50'),
  compare_at_price: z
    .union([z.string().trim().regex(MONEY_RE, 'Enter a valid amount'), z.literal('')])
    .optional(),
  cost_price: z
    .union([z.string().trim().regex(MONEY_RE, 'Enter a valid amount'), z.literal('')])
    .optional(),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  hs_code: z.string().trim().max(50).optional(),
  track_stock: z.boolean(),
  stock_qty: z.coerce.number().int().min(0),
  low_stock_threshold: z.coerce.number().int().min(0),
  allow_backorder: z.boolean(),
  weight_grams: z.union([z.string().trim().regex(INT_RE, 'Whole number only'), z.literal('')]).optional(),
  /** Comma-separated in the form; split into text[] before the action call. */
  tags: z.string().trim().optional(),
  is_featured: z.boolean(),
})
export type ProductFormValues = z.infer<typeof productFormSchema>

/** Server action schema (createProduct/updateProduct) — money already in paisa. */
export const productActionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(SLUG_RE),
  description: z.string().trim().max(5000).nullable(),
  brand: z.string().trim().max(200).nullable(),
  category_id: z.string().uuid().nullable(),
  status: z.enum(PRODUCT_STATUS_VALUES),
  price: z.number().int().min(0),
  compare_at_price: z.number().int().min(0).nullable(),
  cost_price: z.number().int().min(0).nullable(),
  sku: z.string().trim().max(100).nullable(),
  barcode: z.string().trim().max(100).nullable(),
  hs_code: z.string().trim().max(50).nullable(),
  track_stock: z.boolean(),
  stock_qty: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0),
  allow_backorder: z.boolean(),
  weight_grams: z.number().int().min(0).nullable(),
  tags: z.array(z.string().trim().min(1)),
  is_featured: z.boolean(),
})
export type ProductActionInput = z.infer<typeof productActionSchema>

// ---------------------------------------------------------------------------
// Variants — replace-set save (saveVariants deletes removed ids, upserts rest)
// ---------------------------------------------------------------------------

export const variantInputSchema = z.object({
  /** Absent = new row (insert); present = existing row (update). */
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Variant name is required').max(200),
  sku: z.string().trim().max(100).nullable(),
  price: z.number().int().min(0),
  compare_at_price: z.number().int().min(0).nullable(),
  stock_qty: z.number().int().min(0),
  options: z.record(z.string()),
  is_default: z.boolean(),
  position: z.number().int().min(0),
})
export type VariantInput = z.infer<typeof variantInputSchema>

export const saveVariantsSchema = z.object({
  product_id: z.string().uuid(),
  variants: z.array(variantInputSchema).max(100),
})
export type SaveVariantsInput = z.infer<typeof saveVariantsSchema>

// ---------------------------------------------------------------------------
// Images — replace-set save, position-ordered, optional per-variant assignment
// ---------------------------------------------------------------------------

export const productImageInputSchema = z.object({
  id: z.string().uuid().optional(),
  media_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  position: z.number().int().min(0),
})
export type ProductImageInput = z.infer<typeof productImageInputSchema>

export const saveImagesSchema = z.object({
  product_id: z.string().uuid(),
  images: z.array(productImageInputSchema).max(50),
})
export type SaveImagesInput = z.infer<typeof saveImagesSchema>

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(200)
    .regex(SLUG_RE, 'Lowercase letters, numbers and hyphens only'),
  parent_id: z.string().uuid().nullable(),
})
export type CategoryInput = z.infer<typeof categorySchema>

// ---------------------------------------------------------------------------
// Inventory — manual stock adjustment (writes inventory_movements + denorm stock_qty)
// ---------------------------------------------------------------------------

export const adjustStockSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  qty_delta: z.number().int().refine((n) => n !== 0, 'Enter a non-zero quantity'),
  note: z.string().trim().max(500).nullable(),
})
export type AdjustStockInput = z.infer<typeof adjustStockSchema>
