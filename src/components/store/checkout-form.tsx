'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DZ_WILAYA_NAMES } from '@/lib/dz'
import { t, type Lang } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  applyDiscountAction,
  placeOrderAction,
  quoteDeliveryAction,
  type DeliveryQuote,
  type DiscountResult,
} from '@/modules/storefront/actions'
import { addressSchema, contactSchema, type PlaceOrderInput } from '@/modules/storefront/schemas'

import { useCart } from './cart-context'
import { storePath } from './store-links'

export interface CheckoutSettings {
  orgSlug: string
  lang: Lang
  codEnabled: boolean
  advanceRequiredSetting: boolean
  advanceAmount: number
  advanceType: string
  freeDeliveryAbove: number
  bankDetails: string
}

const checkoutFormSchema = z.object({
  ...contactSchema.shape,
  ...addressSchema.shape,
  paymentMethod: z.enum(['cod']),
  trxId: z.string().trim().max(64).optional(),
  senderNumber: z.string().trim().max(20).optional(),
  noteCustomer: z.string().trim().max(500).optional(),
})
type CheckoutFormValues = z.infer<typeof checkoutFormSchema>

function PaymentOption({
  label,
  description,
  selected,
  disabled,
  onSelect,
  children,
}: {
  label: string
  description?: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        disabled && 'opacity-50',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-center gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-primary' : 'border-input',
          )}
        >
          {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </span>
      </button>
      {children ? <div className="mt-3 pl-6.5">{children}</div> : null}
    </div>
  )
}

export function CheckoutForm({ settings }: { settings: CheckoutSettings }) {
  const { lang, orgSlug } = settings
  const router = useRouter()
  const { items, subtotal, mounted, clear } = useCart()

  const [zoneQuote, setZoneQuote] = useState<DeliveryQuote | null>(null)
  const [zoneLoading, setZoneLoading] = useState(false)

  const [discountCode, setDiscountCode] = useState('')
  const [discount, setDiscount] = useState<DiscountResult | null>(null)
  const [discountLoading, setDiscountLoading] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      line1: '',
      area: '',
      district: '',
      paymentMethod: 'cod',
      trxId: '',
      senderNumber: '',
      noteCustomer: '',
    },
  })

  async function fetchZoneQuote(district: string) {
    setZoneLoading(true)
    const result = await quoteDeliveryAction({ orgSlug, district })
    setZoneLoading(false)
    setZoneQuote(result.ok ? (result.data ?? null) : null)
  }

  async function handleApplyDiscount() {
    const code = discountCode.trim()
    if (!code) return
    setDiscountLoading(true)
    setDiscountError(null)
    const result = await applyDiscountAction({
      orgSlug,
      code,
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, qty: i.qty })),
    })
    setDiscountLoading(false)
    if (result.ok && result.data) {
      setDiscount(result.data)
      toast.success(`Applied: ${result.data.label}`)
    } else {
      setDiscount(null)
      setDiscountError(result.ok ? 'Could not apply this code.' : result.error)
    }
  }

  function handleRemoveDiscount() {
    setDiscount(null)
    setDiscountCode('')
    setDiscountError(null)
  }

  // ---- totals (mirrors placeOrderAction's server-side math for display only — the server
  // recomputes everything from scratch and is the only source of truth at submit time) --------
  const discountAmount = discount?.amount ?? 0
  const subtotalAfterDiscount = Math.max(subtotal - discountAmount, 0)
  const freeDeliveryFromThreshold =
    settings.freeDeliveryAbove > 0 && subtotalAfterDiscount >= settings.freeDeliveryAbove
  const isFreeDelivery = Boolean(discount?.freeShipping) || freeDeliveryFromThreshold
  const deliveryCharge = isFreeDelivery ? 0 : (zoneQuote?.charge ?? 0)
  const total = subtotalAfterDiscount + deliveryCharge

  const advanceRequired = settings.advanceRequiredSetting || Boolean(zoneQuote?.advanceRequired)
  const advanceDue = advanceRequired
    ? Math.min(
        Math.max(
          settings.advanceType === 'percent'
            ? Math.round((total * settings.advanceAmount) / 100)
            : settings.advanceAmount,
          0,
        ),
        total,
      )
    : 0
  const dueOnDelivery = total - advanceDue

  const codAvailable = settings.codEnabled && (zoneQuote ? zoneQuote.codAvailable : true)

  async function onSubmit(values: CheckoutFormValues) {
    if (items.length === 0) return

    if (advanceRequired) {
      if (!values.trxId) form.setError('trxId', { message: 'Enter the bank transfer reference' })
      if (!values.senderNumber) form.setError('senderNumber', { message: 'Enter the payer name' })
      if (!values.trxId || !values.senderNumber) return
    }

    const payload: PlaceOrderInput = {
      orgSlug,
      contact: { name: values.name, phone: values.phone, email: values.email || undefined },
      address: { line1: values.line1, area: values.area || undefined, district: values.district },
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, qty: i.qty })),
      discountCode: discount ? discountCode.trim() : undefined,
      paymentMethod: values.paymentMethod,
      trxId: values.trxId || undefined,
      senderNumber: values.senderNumber || undefined,
      noteCustomer: values.noteCustomer || undefined,
    }

    const result = await placeOrderAction(payload)
    if (!result.ok || !result.data) {
      toast.error(result.ok ? 'Something went wrong. Please try again.' : result.error)
      return
    }

    clear()
    router.push(storePath(orgSlug, `/order/${result.data.orderNo}`))
  }

  if (!mounted) return <div className="h-96" aria-hidden />

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('cart_empty', lang)}</p>
        <Button asChild>
          <a href={storePath(orgSlug, '/products')}>{t('continue_shopping', lang)}</a>
        </Button>
      </div>
    )
  }

  function trxFields() {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="trxId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('transaction_id', lang)}</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Transfer reference / receipt no." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="senderNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payer name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Name on the bank account" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Contact</h2>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name', lang)}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Your name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('phone', lang)}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="01XXXXXXXXX" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="you@example.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">{t('address', lang)}</h2>
            <FormField
              control={form.control}
              name="line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street address</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="House, road, area" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Neighbourhood" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('district', lang)}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        void fetchZoneQuote(value)
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select wilaya" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DZ_WILAYA_NAMES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">{t('payment_method', lang)}</h2>
            <div role="radiogroup" aria-label={t('payment_method', lang)} className="flex flex-col gap-3">
              {codAvailable ? (
                <PaymentOption
                  label={t('cash_on_delivery', lang)}
                  description={
                    advanceRequired
                      ? `Pay ${formatMoney(advanceDue)} advance now, rest on delivery`
                      : 'Pay when your order arrives'
                  }
                  selected
                  onSelect={() => form.setValue('paymentMethod', 'cod')}
                >
                  {advanceRequired ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-muted-foreground">
                        {t('send_money_instructions', lang)}: {formatMoney(advanceDue)}
                        {settings.bankDetails ? ` — ${settings.bankDetails}` : ''}
                      </p>
                      {trxFields()}
                    </div>
                  ) : null}
                </PaymentOption>
              ) : null}
            </div>
          </div>

          <FormField
            control={form.control}
            name="noteCustomer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order note (optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} placeholder="Delivery instructions, gift note, etc." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex h-fit flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <span className="text-xs font-medium">Discount code</span>
            <div className="flex gap-2">
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="Enter code"
                disabled={Boolean(discount)}
                className="flex-1"
              />
              {discount ? (
                <Button type="button" variant="outline" onClick={handleRemoveDiscount}>
                  Remove
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyDiscount}
                  disabled={discountLoading || !discountCode.trim()}
                >
                  {discountLoading ? '…' : 'Apply'}
                </Button>
              )}
            </div>
            {discount ? <p className="text-xs text-primary">{discount.label} applied</p> : null}
            {discountError ? <p className="text-xs text-destructive">{discountError}</p> : null}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold">Order summary</h2>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('subtotal', lang)}</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>

            {discount ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{discount.label}</span>
                <span className="text-primary tabular-nums">-{formatMoney(discountAmount)}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('delivery_charge', lang)}</span>
              <span className="tabular-nums">
                {zoneLoading ? '…' : isFreeDelivery ? 'Free' : formatMoney(deliveryCharge)}
              </span>
            </div>
            {!zoneQuote && !zoneLoading ? (
              <p className="text-xs text-muted-foreground">Select your wilaya to calculate delivery.</p>
            ) : null}
            {zoneQuote?.etaText ? <p className="text-xs text-muted-foreground">{zoneQuote.etaText}</p> : null}
            {zoneQuote?.warning ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{zoneQuote.warning}</p>
            ) : null}

            <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>{t('total', lang)}</span>
              <span className="tabular-nums">{formatMoney(total)}</span>
            </div>

            {advanceRequired ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('advance_payable', lang)}</span>
                  <span className="tabular-nums">{formatMoney(advanceDue)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due on delivery</span>
                  <span className="tabular-nums">{formatMoney(dueOnDelivery)}</span>
                </div>
              </>
            ) : null}

            <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="mt-2 w-full">
              {form.formState.isSubmitting ? 'Placing order…' : t('place_order', lang)}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
