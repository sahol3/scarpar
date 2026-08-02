'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { fromPaisa } from '@/lib/money'
import type { Discount } from '@/types/db'

import { createDiscount, updateDiscount } from '../actions'
import { discountFormSchema, type DiscountFormInput } from '../schemas'
import { CategoriesPicker } from './categories-picker'
import { ProductsPicker } from './products-picker'

interface DiscountFormProps {
  discount?: Discount
  categories: { id: string; name: string }[]
  initialProducts?: { id: string; name: string }[]
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DiscountForm({ discount, categories, initialProducts = [] }: DiscountFormProps) {
  const router = useRouter()
  const isEdit = Boolean(discount)

  const form = useForm<DiscountFormInput>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: {
      title: discount?.title ?? '',
      code: discount?.code ?? '',
      type: discount?.type ?? 'percent',
      value: !discount
        ? undefined
        : discount.type === 'fixed' && discount.value != null
          ? fromPaisa(discount.value)
          : (discount.value ?? undefined),
      scope: discount?.scope ?? 'all',
      product_ids: discount?.product_ids ?? [],
      category_ids: discount?.category_ids ?? [],
      min_order: discount?.min_order != null ? fromPaisa(discount.min_order) : 0,
      max_uses: discount?.max_uses ?? undefined,
      starts_at: toDatetimeLocal(discount?.starts_at),
      expires_at: toDatetimeLocal(discount?.expires_at),
      is_active: discount?.is_active ?? true,
    },
  })

  const type = form.watch('type')
  const scope = form.watch('scope')

  async function onSubmit(values: DiscountFormInput) {
    const result = isEdit && discount ? await updateDiscount(discount.id, values) : await createDiscount(values)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? 'Discount updated' : 'Discount created')
    router.push('/admin/discounts')
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 pb-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Eid promotion" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Empty = auto-apply"
                      className="uppercase placeholder:normal-case"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percent">Percent off</SelectItem>
                      <SelectItem value="fixed">Fixed amount off</SelectItem>
                      <SelectItem value="free_shipping">Free shipping</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {type !== 'free_shipping' ? (
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{type === 'percent' ? 'Value (%)' : 'Value (دج)'}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={type === 'percent' ? 1 : 0.01}
                        max={type === 'percent' ? 100 : undefined}
                        step={type === 'percent' ? 1 : 0.01}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Applies to</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">All products</SelectItem>
                      <SelectItem value="products">Specific products</SelectItem>
                      <SelectItem value="categories">Specific categories</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === 'products' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <Controller
                  control={form.control}
                  name="product_ids"
                  render={({ field }) => (
                    <ProductsPicker value={field.value} onChange={field.onChange} initialProducts={initialProducts} />
                  )}
                />
                {form.formState.errors.product_ids ? (
                  <p className="text-destructive text-xs">{form.formState.errors.product_ids.message}</p>
                ) : null}
              </div>
            ) : null}

            {scope === 'categories' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <Controller
                  control={form.control}
                  name="category_ids"
                  render={({ field }) => (
                    <CategoriesPicker value={field.value} onChange={field.onChange} categories={categories} />
                  )}
                />
                {form.formState.errors.category_ids ? (
                  <p className="text-destructive text-xs">{form.formState.errors.category_ids.message}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits &amp; window</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 pb-4">
            <FormField
              control={form.control}
              name="min_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum order (دج)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="max_uses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max uses</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Unlimited"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="starts_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expires_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="col-span-2 flex flex-row items-center justify-between rounded-md border px-3 py-2">
                  <FormLabel className="text-sm">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/discounts')}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create discount'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
