'use client'

import * as React from 'react'
import { Info } from 'lucide-react'

import { fromPaisa, toPaisa } from '@/lib/money'
import type { SettingDef } from '@/lib/settings/registry'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Money fields are flagged by "paisa" appearing in the def's label/help, not
 *  by a key-name suffix — several v1 keys (checkout.min_order,
 *  delivery.default_zone_fallback, delivery.free_above) are paisa amounts
 *  but don't end in "_amount", so a suffix match would under-detect them. */
function isMoneyField(def: SettingDef): boolean {
  return def.type === 'number' && (/paisa/i.test(def.label) || /paisa/i.test(def.help ?? ''))
}

interface SettingFieldProps {
  def: SettingDef
  value: unknown
  disabled?: boolean
  onChange: (key: string, value: unknown) => void
  onValidityChange?: (key: string, valid: boolean) => void
}

function FieldLabel({ def }: { def: SettingDef }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={def.key}>{def.label}</Label>
      {def.help ? (
        <Tooltip>
          <TooltipTrigger type="button" className="text-muted-foreground">
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{def.help}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function SettingField({ def, value, disabled, onChange, onValidityChange }: SettingFieldProps) {
  const [jsonText, setJsonText] = React.useState(() => JSON.stringify(value ?? null, null, 2))
  const [jsonError, setJsonError] = React.useState<string | null>(null)
  // Tracks the exact object reference this field last emitted via onChange,
  // so the resync effect below can tell "value changed because I typed" from
  // "value changed for some external reason" and only reformat in the latter
  // case — otherwise every keystroke round-trips through parent state and
  // JSON.stringify reformats the textarea out from under the user's cursor.
  const lastEmitted = React.useRef<unknown>(value)

  // Re-sync the textarea buffer when the upstream value changes for a reason
  // other than this field's own typing (e.g. a save resets the "initial" snapshot).
  React.useEffect(() => {
    if (Object.is(value, lastEmitted.current)) return
    setJsonText(JSON.stringify(value ?? null, null, 2))
    setJsonError(null)
    lastEmitted.current = value
  }, [value])

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
        <FieldLabel def={def} />
        <Switch
          id={def.key}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(def.key, checked)}
        />
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
        <FieldLabel def={def} />
        <Select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onValueChange={(next) => onChange(def.key, next)}
        >
          <SelectTrigger id={def.key} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (def.type === 'json') {
    return (
      <div className="flex flex-col gap-1.5 border-b py-3 last:border-b-0">
        <FieldLabel def={def} />
        <Textarea
          id={def.key}
          value={jsonText}
          disabled={disabled}
          rows={5}
          className="font-mono text-xs"
          onChange={(event) => {
            const text = event.target.value
            setJsonText(text)
            try {
              const parsed = JSON.parse(text)
              setJsonError(null)
              lastEmitted.current = parsed
              onValidityChange?.(def.key, true)
              onChange(def.key, parsed)
            } catch {
              setJsonError('Invalid JSON')
              onValidityChange?.(def.key, false)
            }
          }}
        />
        {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : null}
      </div>
    )
  }

  if (def.type === 'number') {
    const money = isMoneyField(def)
    const displayValue = money ? fromPaisa(Number(value) || 0) : Number(value) || 0

    return (
      <div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
        <FieldLabel def={def} />
        <div className="flex w-56 items-center gap-1.5">
          {money ? <span className="text-sm text-muted-foreground">دج</span> : null}
          <Input
            id={def.key}
            type="number"
            step={money ? '0.01' : '1'}
            value={displayValue}
            disabled={disabled}
            className="text-right tabular-nums"
            onChange={(event) => {
              const raw = event.target.value
              onChange(def.key, money ? toPaisa(raw) : Number(raw) || 0)
            }}
          />
        </div>
      </div>
    )
  }

  // text
  return (
    <div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
      <FieldLabel def={def} />
      <Input
        id={def.key}
        type="text"
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        className="w-56"
        onChange={(event) => onChange(def.key, event.target.value)}
      />
    </div>
  )
}

export { SettingField }
