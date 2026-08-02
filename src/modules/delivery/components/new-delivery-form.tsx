"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { fromPaisa, toPaisa } from "@/lib/money"
import { DZ_WILAYA_NAMES } from "@/lib/dz"
import type { DeliveryCourier, DeliveryZone, Order, Rider } from "@/types/db"
import { createDeliveryAction, getCourierWilayaRateAction } from "../actions"
import type { CreateDeliveryInput } from "../schemas"

const METHODS = [
  { value: "rider", label: "Rider" },
  { value: "courier", label: "Courier" },
  { value: "pickup", label: "Pickup" },
] as const

const COURIERS: { value: DeliveryCourier; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "yalidine", label: "Yalidine" },
  { value: "zr_express", label: "ZR Express" },
  { value: "noest_express", label: "Noest Express" },
  { value: "guepex", label: "Guepex" },
]

const formSchema = z.object({
  method: z.enum(["rider", "courier", "pickup"]),
  zone_id: z.string(),
  rider_id: z.string(),
  courier: z.enum(["yalidine", "zr_express", "noest_express", "guepex", "manual"]),
  manual_tracking_code: z.string(),
  recipient_name: z.string().trim().min(1, "Recipient name is required"),
  recipient_phone: z.string().trim().min(6, "Recipient phone is required"),
  line1: z.string().trim().min(1, "Address line is required"),
  area: z.string(),
  district: z.string().trim().min(1, "District is required"),
  postcode: z.string(),
  cod_amount: z.string().min(1, "Required"),
  fee: z.string().min(1, "Required"),
  delivery_type: z.enum(["home", "stopdesk"]),
  otp_enabled: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface NewDeliveryFormProps {
  order: Pick<Order, "id" | "order_no" | "customer_name" | "customer_phone" | "address" | "total" | "advance_paid">
  zones: DeliveryZone[]
  riders: Rider[]
  defaultZoneId: string | null
}

function NewDeliveryForm({ order, zones, riders, defaultZoneId }: NewDeliveryFormProps) {
  const router = useRouter()
  const orderAddress = (order.address ?? {}) as {
    line1?: string
    area?: string
    district?: string
    postcode?: string
  }
  const defaultZone = zones.find((zone) => zone.id === defaultZoneId)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      method: "rider",
      zone_id: defaultZoneId ?? "",
      rider_id: "",
      courier: "manual",
      manual_tracking_code: "",
      recipient_name: order.customer_name,
      recipient_phone: order.customer_phone,
      line1: orderAddress.line1 ?? "",
      area: orderAddress.area ?? "",
      district: orderAddress.district ?? "",
      postcode: orderAddress.postcode ?? "",
      cod_amount: String(fromPaisa(Math.max(0, order.total - order.advance_paid))),
      fee: String(fromPaisa(defaultZone?.charge ?? 0)),
      delivery_type: "home",
      otp_enabled: false,
    },
  })

  const method = form.watch("method")
  const courier = form.watch("courier")
  const district = form.watch("district")
  const deliveryType = form.watch("delivery_type")

  // Auto-suggest the delivery fee from the org's courier_wilaya_rates grid
  // whenever a real (non-manual) courier + wilaya + delivery type is picked.
  React.useEffect(() => {
    if (method !== "courier" || courier === "manual" || !district) return
    let cancelled = false
    void getCourierWilayaRateAction({ courier, wilayaName: district, deliveryType }).then((result) => {
      if (cancelled) return
      if (result.ok && result.data) {
        form.setValue("fee", String(fromPaisa(result.data.price)))
      }
    })
    return () => {
      cancelled = true
    }
  }, [method, courier, district, deliveryType, form])

  function handleZoneChange(zoneId: string) {
    const zone = zones.find((z) => z.id === zoneId)
    if (zone) form.setValue("fee", String(fromPaisa(zone.charge)))
  }

  async function onSubmit(values: FormValues) {
    const payload: CreateDeliveryInput = {
      order_id: order.id,
      method: values.method,
      zone_id: values.zone_id || null,
      rider_id: values.method === "rider" ? values.rider_id || null : null,
      courier: values.method === "courier" ? values.courier : null,
      manual_tracking_code: values.manual_tracking_code || undefined,
      recipient_name: values.recipient_name,
      recipient_phone: values.recipient_phone,
      address: {
        line1: values.line1,
        area: values.area || undefined,
        district: values.district,
        postcode: values.postcode || undefined,
      },
      cod_amount: toPaisa(values.cod_amount),
      fee: toPaisa(values.fee),
      otp_enabled: values.otp_enabled,
    }

    const result = await createDeliveryAction(payload)
    if (!result.ok) {
      if (values.method === "courier" && values.courier !== "manual") {
        toast.error(result.error, {
          description: 'Switch the courier to "Manual" and enter the tracking code yourself.',
        })
      } else {
        toast.error(result.error)
      }
      return
    }

    toast.success(`Delivery ${result.data?.delivery_no} created`)
    router.push(`/admin/deliveries/${result.data?.id}`)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <FormLabel>Method</FormLabel>
              <div className="mt-2 flex gap-2">
                {METHODS.map((m) => (
                  <Button
                    key={m.value}
                    type="button"
                    variant={method === m.value ? "default" : "outline"}
                    onClick={() => form.setValue("method", m.value)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>

            {method === "rider" ? (
              <FormField
                control={form.control}
                name="rider_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rider</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select rider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {riders.map((rider) => (
                          <SelectItem key={rider.id} value={rider.id}>
                            {rider.name} — {rider.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {method === "courier" ? (
              <>
                <FormField
                  control={form.control}
                  name="courier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courier</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select courier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COURIERS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {courier === "manual" ? (
                  <FormField
                    control={form.control}
                    name="manual_tracking_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tracking code (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Auto-generated if left blank" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="delivery_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select delivery type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="home">Home delivery</SelectItem>
                            <SelectItem value="stopdesk">Stopdesk (bureau pickup)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            ) : null}

            <FormField
              control={form.control}
              name="zone_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zone</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      handleZoneChange(value)
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select zone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="recipient_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recipient_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient phone</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="line1"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address line</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="area"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Area</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>Wilaya</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
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
            <FormField
              control={form.control}
              name="postcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postcode</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="cod_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>COD amount (دج)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery fee (دج)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="otp_enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <FormLabel className="text-[13px]">Require OTP on delivery (4-digit code)</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating..." : "Create delivery"}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export { NewDeliveryForm }
