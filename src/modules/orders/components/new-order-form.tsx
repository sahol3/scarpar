'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DZ_WILAYA_NAMES } from '@/lib/dz'
import { formatMoney, fromPaisa, toPaisa } from '@/lib/money'
import { createManualOrderAction } from '@/modules/orders/actions'
import type { CreateManualOrderInput } from '@/modules/orders/schemas'
import type { DeliveryZone } from '@/types/db'
import { CustomerPicker, EMPTY_CUSTOMER_VALUE, type CustomerPickerValue } from './customer-picker'
import { ItemBuilder, type OrderLineItem } from './item-builder'

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
] as const

export interface DefaultAdvance {
  required: boolean
  type: 'fixed' | 'percent'
  /** paisa — meaningful only when type === 'fixed' (no percent-value setting exists yet). */
  amountPaisa: number
}

interface NewOrderFormProps {
  deliveryZones: DeliveryZone[]
  deliveryEnabled: boolean
  defaultAdvance: DefaultAdvance
}

function NewOrderForm({ deliveryZones, deliveryEnabled, defaultAdvance }: NewOrderFormProps) {
  const router = useRouter()

  const [customer, setCustomer] = React.useState<CustomerPickerValue>(EMPTY_CUSTOMER_VALUE)
  const [line1, setLine1] = React.useState('')
  const [area, setArea] = React.useState('')
  const [district, setDistrict] = React.useState('')
  const [postcode, setPostcode] = React.useState('')
  const [items, setItems] = React.useState<OrderLineItem[]>([])
  const [deliveryZoneId, setDeliveryZoneId] = React.useState<string>('')
  const [manualDeliveryCharge, setManualDeliveryCharge] = React.useState('')
  const [discountCode, setDiscountCode] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState<CreateManualOrderInput['payment_method']>('cod')
  const [advanceAmount, setAdvanceAmount] = React.useState('')
  const [advanceTouched, setAdvanceTouched] = React.useState(false)
  const [noteInternal, setNoteInternal] = React.useState('')
  const [confirmImmediately, setConfirmImmediately] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const useZones = deliveryEnabled && deliveryZones.length > 0

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  const deliveryCharge = useZones
    ? (deliveryZones.find((z) => z.id === deliveryZoneId)?.charge ?? 0)
    : toPaisa(manualDeliveryCharge || '0')
  const estimatedTotal = subtotal + deliveryCharge // discount unresolved client-side — server computes the real total

  // Pre-fill the advance amount from settings when COD is selected and the
  // staff hasn't touched the field yet. Only for type 'fixed' — there's no
  // percent-value setting defined in the registry yet to compute a percent default.
  React.useEffect(() => {
    if (paymentMethod === 'cod' && defaultAdvance.required && defaultAdvance.type === 'fixed' && !advanceTouched) {
      setAdvanceAmount(String(fromPaisa(defaultAdvance.amountPaisa)))
    }
  }, [paymentMethod, defaultAdvance, advanceTouched])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!customer.name.trim() || !customer.phone.trim()) {
      toast.error('Customer name and phone are required')
      return
    }
    if (!line1.trim() || !district) {
      toast.error('Address line and wilaya are required')
      return
    }
    if (items.length === 0) {
      toast.error('Add at least one item')
      return
    }

    setSubmitting(true)
    try {
      const payload: CreateManualOrderInput = {
        customer: {
          id: customer.mode === 'existing' ? customer.id : undefined,
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          email: customer.email.trim() || undefined,
        },
        address: {
          line1: line1.trim(),
          area: area.trim() || undefined,
          district,
          postcode: postcode.trim() || undefined,
        },
        delivery_zone_id: useZones && deliveryZoneId ? deliveryZoneId : undefined,
        manual_delivery_charge: !useZones ? toPaisa(manualDeliveryCharge || '0') : undefined,
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          sku: item.sku,
          unit_price: item.unit_price,
          qty: item.qty,
        })),
        discount_code: discountCode.trim() || undefined,
        payment_method: paymentMethod,
        advance_amount: advanceAmount.trim() || undefined,
        note_internal: noteInternal.trim() || undefined,
        confirm_immediately: confirmImmediately,
      }

      const result = await createManualOrderAction(payload)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Order ${result.data?.orderNo} created`)
      router.push(`/admin/orders/${result.data?.orderId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery address</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="address-line1">Address line</Label>
                <Input id="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="House, road, area" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address-area">Area</Label>
                <Input id="address-area" value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address-district">Wilaya</Label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger id="address-district" className="w-full">
                    <SelectValue placeholder="Select wilaya" />
                  </SelectTrigger>
                  <SelectContent>
                    {DZ_WILAYA_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address-postcode">Postcode</Label>
                <Input id="address-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemBuilder value={items} onChange={setItems} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {useZones ? (
                <Select value={deliveryZoneId} onValueChange={setDeliveryZoneId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select delivery zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryZones.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name} — {formatMoney(zone.charge)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-delivery-charge">Delivery charge (DZD)</Label>
                  <Input
                    id="manual-delivery-charge"
                    inputMode="decimal"
                    value={manualDeliveryCharge}
                    onChange={(e) => setManualDeliveryCharge(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discount</CardTitle>
            </CardHeader>
            <CardContent>
              <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="Discount code (optional)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advance-amount">Advance amount (DZD)</Label>
                <Input
                  id="advance-amount"
                  inputMode="decimal"
                  value={advanceAmount}
                  onChange={(e) => {
                    setAdvanceTouched(true)
                    setAdvanceAmount(e.target.value)
                  }}
                  placeholder="0.00"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Note</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={3} value={noteInternal} onChange={(e) => setNoteInternal(e.target.value)} placeholder="Internal note (optional)" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Estimated total</span>
                <span className="font-semibold tabular-nums">{formatMoney(estimatedTotal)}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Final totals (incl. any discount code) are computed on the server.
              </p>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={confirmImmediately} onCheckedChange={(v) => setConfirmImmediately(Boolean(v))} />
                Confirm order immediately
              </label>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create order'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}

export { NewOrderForm }
