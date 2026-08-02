'use client'

// Shared create/edit product form (docs/conventions.md — Forms: RHF +
// zodResolver + ui/form helpers). Base fields are one RHF form; variants and
// images are separate controlled-array editors saved via their own actions
// (saveVariants/saveImages) right after createProduct/updateProduct resolves
// — see the module-level submit orchestration below.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { fromPaisa, toPaisa } from '@/lib/money'
import { slugify } from '@/lib/utils'
import type { Product, ProductImage, ProductVariant } from '@/types/db'

import { createProduct, deleteProduct, saveImages, saveVariants, updateProduct } from '../actions'
import { productFormSchema, type ProductActionInput, type ProductFormValues } from '../schemas'
import { ImageGallery, fromImageRow, toImageRow, type ImageRow } from './image-gallery'
import { VariantEditor, fromVariantRow, newVariantRow, toVariantRow, type VariantRow } from './variant-editor'

export interface CategoryOption {
  id: string
  name: string
  parentName: string | null
}

/** Shared by products/new and products/[id] pages — flattens org categories
 *  (one level of nesting) into "Parent / Child" select options. */
export function toCategoryOptions(
  rows: { id: string; name: string; parent_id: string | null }[],
): CategoryOption[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentName: r.parent_id ? (byId.get(r.parent_id)?.name ?? null) : null,
  }))
}

interface ProductFormProps {
  mode: 'create' | 'edit'
  product?: Product
  variants?: ProductVariant[]
  images?: (ProductImage & { path: string })[]
  categories: CategoryOption[]
}

const NONE_CATEGORY = '__none__'

function toFormValues(product?: Product): ProductFormValues {
  if (!product) {
    return {
      name: '',
      slug: '',
      description: '',
      brand: '',
      category_id: null,
      status: 'draft',
      price: '',
      compare_at_price: '',
      cost_price: '',
      sku: '',
      barcode: '',
      hs_code: '',
      track_stock: true,
      stock_qty: 0,
      low_stock_threshold: 5,
      allow_backorder: false,
      weight_grams: '',
      tags: '',
      is_featured: false,
    }
  }

  return {
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    brand: product.brand ?? '',
    category_id: product.category_id,
    status: product.status,
    price: fromPaisa(product.price).toFixed(2),
    compare_at_price: product.compare_at_price != null ? fromPaisa(product.compare_at_price).toFixed(2) : '',
    cost_price: product.cost_price != null ? fromPaisa(product.cost_price).toFixed(2) : '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    hs_code: product.hs_code ?? '',
    track_stock: product.track_stock,
    stock_qty: product.stock_qty,
    low_stock_threshold: product.low_stock_threshold,
    allow_backorder: product.allow_backorder,
    weight_grams: product.weight_grams != null ? String(product.weight_grams) : '',
    tags: (product.tags ?? []).join(', '),
    is_featured: product.is_featured,
  }
}

function toActionInput(values: ProductFormValues): ProductActionInput {
  return {
    name: values.name,
    slug: values.slug,
    description: values.description?.trim() ? values.description.trim() : null,
    brand: values.brand?.trim() ? values.brand.trim() : null,
    category_id: values.category_id,
    status: values.status,
    price: toPaisa(values.price),
    compare_at_price: values.compare_at_price?.trim() ? toPaisa(values.compare_at_price) : null,
    cost_price: values.cost_price?.trim() ? toPaisa(values.cost_price) : null,
    sku: values.sku?.trim() ? values.sku.trim() : null,
    barcode: values.barcode?.trim() ? values.barcode.trim() : null,
    hs_code: values.hs_code?.trim() ? values.hs_code.trim() : null,
    track_stock: values.track_stock,
    stock_qty: values.stock_qty,
    low_stock_threshold: values.low_stock_threshold,
    allow_backorder: values.allow_backorder,
    weight_grams: values.weight_grams?.trim() ? Math.round(Number(values.weight_grams)) : null,
    tags: values.tags
      ? values.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    is_featured: values.is_featured,
  }
}

function ProductForm({ mode, product, variants, images, categories }: ProductFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')

  const [variantRows, setVariantRows] = useState<VariantRow[]>(() => (variants ?? []).map(toVariantRow))
  const [hasVariants, setHasVariants] = useState((variants?.length ?? 0) > 0)
  const [imageRows, setImageRows] = useState<ImageRow[]>(() => (images ?? []).map(toImageRow))

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: toFormValues(product),
  })

  const persistedVariantOptions = variantRows
    .filter((row): row is VariantRow & { id: string } => Boolean(row.id))
    .map((row) => ({ id: row.id, name: row.name || 'Unnamed' }))

  function handleNameChange(value: string) {
    form.setValue('name', value)
    if (!slugTouched) form.setValue('slug', slugify(value), { shouldValidate: true })
  }

  async function onSubmit(values: ProductFormValues) {
    startTransition(async () => {
      const input = toActionInput(values)
      const result = mode === 'create' ? await createProduct(input) : await updateProduct(product!.id, input)

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const productId = mode === 'create' ? result.data!.id : product!.id

      const [variantsResult, imagesResult] = await Promise.all([
        saveVariants({
          product_id: productId,
          variants: (hasVariants ? variantRows : []).map((row, i) => fromVariantRow(row, i)),
        }),
        saveImages({
          product_id: productId,
          images: imageRows.map((row, i) => fromImageRow(row, i)),
        }),
      ])

      if (!variantsResult.ok) {
        toast.error(`Product saved, but variants failed: ${variantsResult.error}`)
        return
      }
      if (!imagesResult.ok) {
        toast.error(`Product saved, but images failed: ${imagesResult.error}`)
        return
      }

      toast.success(mode === 'create' ? 'Product created' : 'Product updated')

      if (mode === 'create') {
        router.push(`/admin/products/${productId}`)
      } else {
        router.refresh()
      }
    })
  }

  async function handleDelete() {
    if (!product) return
    const result = await deleteProduct(product.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Product deleted')
    router.push('/admin/products')
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card className="gap-4 p-4">
              <CardHeader className="p-0">
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} onChange={(e) => handleNameChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) => {
                            setSlugTouched(true)
                            field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          value={field.value ?? NONE_CATEGORY}
                          onValueChange={(v) => field.onChange(v === NONE_CATEGORY ? null : v)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="No category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NONE_CATEGORY}>No category</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="gap-4 p-4">
              <CardHeader className="p-0">
                <CardTitle>Images</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ImageGallery value={imageRows} onChange={setImageRows} variantOptions={persistedVariantOptions} />
              </CardContent>
            </Card>

            <Card className="gap-4 p-4">
              <CardHeader className="flex-row items-center justify-between p-0">
                <CardTitle>Variants</CardTitle>
                <label className="flex items-center gap-2 text-xs font-medium">
                  Has variants
                  <Switch
                    checked={hasVariants}
                    onCheckedChange={(checked) => {
                      setHasVariants(checked)
                      if (checked && variantRows.length === 0) {
                        setVariantRows([newVariantRow(true)])
                      }
                    }}
                  />
                </label>
              </CardHeader>
              {hasVariants ? (
                <CardContent className="p-0">
                  <VariantEditor value={variantRows} onChange={setVariantRows} />
                </CardContent>
              ) : (
                <CardContent className="p-0">
                  <p className="text-muted-foreground text-xs">
                    Off — this product sells at the single price/stock set under Pricing &amp; Inventory.
                  </p>
                </CardContent>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card className="gap-4 p-4">
              <CardHeader className="p-0">
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_featured"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2">
                      <FormLabel className="text-foreground text-xs">Featured</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="gap-4 p-4">
              <CardHeader className="p-0">
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (دج)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="compare_at_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Compare-at price (دج)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cost_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost price (دج)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="gap-4 p-4">
              <CardHeader className="p-0">
                <CardTitle>Inventory</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-0">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Barcode</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="hs_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HS code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="track_stock"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2">
                      <FormLabel className="text-foreground text-xs">Track stock</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="stock_qty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock qty</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={String(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="low_stock_threshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Low stock at</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={String(field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="allow_backorder"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2">
                      <FormLabel className="text-foreground text-xs">Allow backorder</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weight_grams"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (grams)</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input placeholder="comma, separated, tags" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            {mode === 'edit' && product ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline">
                    Delete product
                  </Button>
                }
                title="Delete this product?"
                description={`"${product.name}" will be permanently removed. Past orders keep their own snapshot and are unaffected.`}
                confirmLabel="Delete"
                destructive
                onConfirm={handleDelete}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/products')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : mode === 'create' ? 'Create product' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}

export { ProductForm }
