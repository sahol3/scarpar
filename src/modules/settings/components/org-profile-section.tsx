'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { MODULE_LIST } from '@/modules/registry'
import type { ModuleKey } from '@/modules/types'
import type { Org } from '@/types/db'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { updateOrgProfileAction } from '@/modules/settings/actions'
import { orgProfileSchema, type OrgProfileInput } from '@/modules/settings/schemas'

const TIMEZONE_OPTIONS = [
  { value: 'Africa/Algiers', label: 'Africa/Algiers (UTC+1)' },
  { value: 'UTC', label: 'UTC' },
]

function OrgProfileSection({ org }: { org: Org }) {
  const form = useForm<OrgProfileInput>({
    resolver: zodResolver(orgProfileSchema),
    defaultValues: {
      name: org.name,
      phone: org.phone ?? '',
      email: org.email ?? '',
      address: org.address ?? '',
      bin_number: org.bin_number ?? '',
      timezone: org.timezone,
      enabled_modules: org.enabled_modules as ModuleKey[],
    },
  })

  async function onSubmit(values: OrgProfileInput) {
    const result = await updateOrgProfileAction(values)
    if (result.ok) {
      toast.success('Organization saved')
      form.reset(values)
    } else {
      toast.error(result.error)
    }
  }

  const enabledModules = form.watch('enabled_modules')

  return (
    <Card id="section-organization" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="text-base">Organization</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bin_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BIN number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="1234567890123" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      13-digit e-BIN for Mushak invoices
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <Label>Currency</Label>
                <Input value={org.currency} disabled />
                <p className="text-xs text-muted-foreground">Multi-currency not yet supported</p>
              </div>

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <Label>Vertical</Label>
                <div>
                  <Badge variant="outline" className="capitalize">
                    {org.vertical}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <div>
                <Label className="text-sm">Enabled modules</Label>
                <p className="text-xs text-muted-foreground">
                  Choose which modules are active for this organization.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULE_LIST.map((mod) => {
                  const checked = enabledModules?.includes(mod.key) ?? false
                  return (
                    <label
                      key={mod.key}
                      htmlFor={`module-${mod.key}`}
                      className="flex items-start gap-2 rounded-md border p-3 cursor-pointer"
                    >
                      <Checkbox
                        id={`module-${mod.key}`}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(form.getValues('enabled_modules'))
                          if (next) set.add(mod.key)
                          else set.delete(mod.key)
                          form.setValue('enabled_modules', Array.from(set), { shouldDirty: true })
                        }}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{mod.name}</span>
                        <span className="text-xs text-muted-foreground">{mod.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>

              <Alert variant="warning">
                <AlertTitle>Disabling a module hides its pages</AlertTitle>
                <AlertDescription>
                  Existing data is kept — re-enabling the module restores access to it.
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export { OrgProfileSection }
