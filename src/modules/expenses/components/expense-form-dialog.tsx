'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { MediaPicker, type MediaPickerValue } from '@/components/admin/media-picker'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { fromPaisa } from '@/lib/money'
import { cn } from '@/lib/utils'
import { createExpenseAction, updateExpenseAction } from '@/modules/expenses/actions'
import { EXPENSE_CATEGORY_SUGGESTIONS, expenseSchema, type ExpenseFormValues } from '@/modules/expenses/schemas'
import type { Expense } from '@/types/db'

/**
 * Expense rows only store media_id (the FK). MediaPicker needs the full {id,path} to render a
 * thumbnail, so callers that already resolved the path (expenses-table.tsx) attach it here.
 */
export interface ExpenseWithReceipt extends Expense {
  receiptPath: string | null
}

interface ExpenseFormDialogProps {
  trigger: React.ReactNode
  expense?: ExpenseWithReceipt
}

function initialMediaValue(expense?: ExpenseWithReceipt): MediaPickerValue | null {
  if (expense?.media_id && expense.receiptPath) {
    return { id: expense.media_id, path: expense.receiptPath }
  }
  return null
}

function CategoryField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const trimmedQuery = query.trim()
  const filtered = EXPENSE_CATEGORY_SUGGESTIONS.filter((c) => c.toLowerCase().includes(trimmedQuery.toLowerCase()))
  const canCreate =
    trimmedQuery.length > 0 && !EXPENSE_CATEGORY_SUGGESTIONS.some((c) => c.toLowerCase() === trimmedQuery.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && 'text-muted-foreground')}>{value || 'Select or type a category'}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or create category..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => {
                    onChange(c)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === c ? 'opacity-100' : 'opacity-0')} />
                  {c}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  value={trimmedQuery}
                  onSelect={() => {
                    onChange(trimmedQuery)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  <Plus className="size-4" />
                  Create &ldquo;{trimmedQuery}&rdquo;
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function defaultValues(expense?: ExpenseWithReceipt): ExpenseFormValues {
  return {
    category: expense?.category ?? '',
    amount: expense ? fromPaisa(expense.amount).toFixed(2) : '',
    spent_at: expense?.spent_at ?? format(new Date(), 'yyyy-MM-dd'),
    note: expense?.note ?? '',
    media_id: expense?.media_id ?? null,
  }
}

function ExpenseFormDialog({ trigger, expense }: ExpenseFormDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [mediaValue, setMediaValue] = React.useState<MediaPickerValue | null>(initialMediaValue(expense))
  const isEdit = Boolean(expense)

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: defaultValues(expense),
  })

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues(expense))
      setMediaValue(initialMediaValue(expense))
    }
    // Re-seed whenever the dialog opens — this same component instance is reused per table row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleMediaChange(m: MediaPickerValue | null) {
    setMediaValue(m)
    form.setValue('media_id', m?.id ?? null, { shouldDirty: true })
  }

  async function onSubmit(values: ExpenseFormValues) {
    const result =
      isEdit && expense ? await updateExpenseAction({ ...values, id: expense.id }) : await createExpenseAction(values)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(isEdit ? 'Expense updated' : 'Expense added')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit expense' : 'New expense'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this expense entry.' : 'Record a new business expense.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <CategoryField value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (دج)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="spent_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional note" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="media_id"
              render={() => (
                <FormItem>
                  <FormLabel>Receipt</FormLabel>
                  <FormControl>
                    <MediaPicker value={mediaValue} onChange={handleMediaChange} label="Attach receipt (optional)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Add expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export { ExpenseFormDialog }
