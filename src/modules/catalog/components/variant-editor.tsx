'use client'

// Controlled list editor for a product's variants (replace-set — saved via
// the saveVariants action from product-form.tsx, not directly by this
// component). Money fields are taka strings, converted at the ProductForm
// submit boundary via fromVariantRow/toVariantRow (fromPaisa/toPaisa).

import { ChevronDown, ChevronUp, Layers, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fromPaisa, toPaisa } from '@/lib/money'
import { randomKey } from '@/lib/utils'
import type { ProductVariant } from '@/types/db'

import type { VariantInput } from '../schemas'

export interface VariantRow {
  /** Stable client-side list key — the db id when persisted, else a randomKey(). */
  key: string
  id?: string
  name: string
  sku: string
  price: string // taka string, e.g. "1200.50"
  compareAtPrice: string
  stockQty: number
  isDefault: boolean
  optionsText: string
}

function optionsToText(options: Record<string, unknown>): string {
  const note = options?.note
  return typeof note === 'string' ? note : ''
}

export function toVariantRow(v: ProductVariant): VariantRow {
  return {
    key: v.id,
    id: v.id,
    name: v.name,
    sku: v.sku ?? '',
    price: fromPaisa(v.price).toFixed(2),
    compareAtPrice: v.compare_at_price != null ? fromPaisa(v.compare_at_price).toFixed(2) : '',
    stockQty: v.stock_qty,
    isDefault: v.is_default,
    optionsText: optionsToText(v.options),
  }
}

export function fromVariantRow(row: VariantRow, position: number): VariantInput {
  return {
    id: row.id,
    name: row.name.trim(),
    sku: row.sku.trim() ? row.sku.trim() : null,
    price: toPaisa(row.price || '0'),
    compare_at_price: row.compareAtPrice.trim() ? toPaisa(row.compareAtPrice) : null,
    stock_qty: row.stockQty,
    options: row.optionsText.trim() ? { note: row.optionsText.trim() } : {},
    is_default: row.isDefault,
    position,
  }
}

export function newVariantRow(isDefault: boolean): VariantRow {
  return {
    key: randomKey(),
    name: '',
    sku: '',
    price: '',
    compareAtPrice: '',
    stockQty: 0,
    isDefault,
    optionsText: '',
  }
}

interface VariantEditorProps {
  value: VariantRow[]
  onChange: (rows: VariantRow[]) => void
}

function VariantEditor({ value, onChange }: VariantEditorProps) {
  function addRow() {
    onChange([...value, newVariantRow(value.length === 0)])
  }

  function updateRow(key: string, patch: Partial<VariantRow>) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key: string) {
    const next = value.filter((row) => row.key !== key)
    if (next.length && !next.some((row) => row.isDefault)) next[0] = { ...next[0], isDefault: true }
    onChange(next)
  }

  function setDefault(key: string) {
    onChange(value.map((row) => ({ ...row, isDefault: row.key === key })))
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= value.length) return
    const next = [...value]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <EmptyState icon={Layers} title="No variants yet" description="Add a size, color, or unit variant." />
      ) : (
        <div className="flex flex-col gap-2">
          {value.map((row, index) => (
            <Card key={row.key} className="gap-2 p-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4 flex flex-col gap-1">
                  <Label>Name</Label>
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    placeholder="e.g. 12ml"
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <Label>SKU</Label>
                  <Input value={row.sku} onChange={(e) => updateRow(row.key, { sku: e.target.value })} />
                </div>
                <div className="col-span-5 flex flex-col gap-1">
                  <Label>Options</Label>
                  <Input
                    value={row.optionsText}
                    onChange={(e) => updateRow(row.key, { optionsText: e.target.value })}
                    placeholder="e.g. Size: 12ml"
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <Label>Price (دج)</Label>
                  <Input
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: e.target.value })}
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <Label>Compare-at (دج)</Label>
                  <Input
                    value={row.compareAtPrice}
                    onChange={(e) => updateRow(row.key, { compareAtPrice: e.target.value })}
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <Label>Stock</Label>
                  <Input
                    type="number"
                    value={row.stockQty}
                    onChange={(e) => updateRow(row.key, { stockQty: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-4 flex items-end justify-between gap-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="radio"
                      name="default-variant"
                      checked={row.isDefault}
                      onChange={() => setDefault(row.key)}
                      className="size-3.5 accent-primary"
                    />
                    Default
                  </label>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === value.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(row.key)}>
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
        <Plus className="size-4" />
        Add variant
      </Button>
    </div>
  )
}

export { VariantEditor }
