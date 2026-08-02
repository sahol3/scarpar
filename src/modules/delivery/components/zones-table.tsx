"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { DZ_WILAYA_NAMES, ALGIERS_METRO } from "@/lib/dz"
import { formatMoney, fromPaisa, toPaisa } from "@/lib/money"
import type { DeliveryZone } from "@/types/db"
import { deleteZoneAction, upsertZoneAction } from "../actions"

interface ZoneDialogProps {
  zone?: DeliveryZone
  trigger: React.ReactNode
}

/** Create/edit dialog — wilaya multi-select + a wilaya-count summary. */
function ZoneDialog({ zone, trigger }: ZoneDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(zone?.name ?? "")
  const [charge, setCharge] = React.useState(zone ? String(fromPaisa(zone.charge)) : "0")
  const [etaText, setEtaText] = React.useState(zone?.eta_text ?? "")
  const [codAvailable, setCodAvailable] = React.useState(zone?.cod_available ?? true)
  const [advanceRequired, setAdvanceRequired] = React.useState(zone?.advance_required ?? false)
  const [isActive, setIsActive] = React.useState(zone?.is_active ?? true)
  const [districts, setDistricts] = React.useState<string[]>(zone?.districts ?? [])
  const [loading, setLoading] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(zone?.name ?? "")
      setCharge(zone ? String(fromPaisa(zone.charge)) : "0")
      setEtaText(zone?.eta_text ?? "")
      setCodAvailable(zone?.cod_available ?? true)
      setAdvanceRequired(zone?.advance_required ?? false)
      setIsActive(zone?.is_active ?? true)
      setDistricts(zone?.districts ?? [])
    }
    setOpen(next)
  }

  function toggleDistrict(districtName: string, checked: boolean) {
    setDistricts((prev) => (checked ? [...prev, districtName] : prev.filter((d) => d !== districtName)))
  }

  function selectOutsideAlgiers() {
    setDistricts(DZ_WILAYA_NAMES.filter((name) => !ALGIERS_METRO.has(name)))
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (districts.length === 0) {
      toast.error("Select at least one wilaya")
      return
    }

    setLoading(true)
    try {
      const result = await upsertZoneAction({
        id: zone?.id,
        name: name.trim(),
        districts,
        charge: toPaisa(charge || "0"),
        cod_available: codAvailable,
        advance_required: advanceRequired,
        eta_text: etaText,
        is_active: isActive,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(zone ? "Zone updated" : "Zone created")
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{zone ? "Edit zone" : "New zone"}</DialogTitle>
          <DialogDescription>Wilayas, charge, and COD rules for this delivery zone.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Charge (دج)</Label>
              <Input type="number" step="0.01" value={charge} onChange={(event) => setCharge(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ETA text</Label>
            <Input value={etaText} onChange={(event) => setEtaText(event.target.value)} placeholder="e.g. 24 hours" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <Label className="text-xs">COD available</Label>
              <Switch checked={codAvailable} onCheckedChange={setCodAvailable} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <Label className="text-xs">Advance required</Label>
              <Switch checked={advanceRequired} onCheckedChange={setAdvanceRequired} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <Label className="text-xs">Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Wilayas ({districts.length} selected)</Label>
            <Button type="button" variant="outline" size="sm" onClick={selectOutsideAlgiers}>
              Select all outside Alger
            </Button>
          </div>

          <ScrollArea className="h-64 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {DZ_WILAYA_NAMES.map((name) => (
                <label key={name} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={districts.includes(name)}
                    onCheckedChange={(checked) => toggleDistrict(name, checked === true)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button disabled={loading} onClick={handleSave}>
            {loading ? "Saving..." : "Save zone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ZoneRowActions({ zone }: { zone: DeliveryZone }) {
  const router = useRouter()

  async function handleDelete() {
    const result = await deleteZoneAction({ id: zone.id })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Zone deleted")
    router.refresh()
  }

  return (
    <div className="flex justify-end gap-1">
      <ZoneDialog
        zone={zone}
        trigger={
          <Button variant="ghost" size="icon">
            <Pencil className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
        }
      />
      <ConfirmDialog
        title="Delete this zone?"
        description={`"${zone.name}" will be removed. Existing deliveries keep their history.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        trigger={
          <Button variant="ghost" size="icon">
            <Trash2 className="size-4" />
            <span className="sr-only">Delete</span>
          </Button>
        }
      />
    </div>
  )
}

const columns: ColumnDef<DeliveryZone>[] = [
  { accessorKey: "name", header: "Name" },
  {
    id: "districts",
    header: "Wilayas",
    cell: ({ row }) => {
      const districts = row.original.districts
      const preview = districts.slice(0, 3)
      return (
        <div className="flex flex-wrap items-center gap-1">
          {preview.map((d) => (
            <Badge key={d} variant="secondary">
              {d}
            </Badge>
          ))}
          {districts.length > preview.length ? (
            <span className="text-muted-foreground text-xs">+{districts.length - preview.length} more</span>
          ) : null}
        </div>
      )
    },
  },
  {
    accessorKey: "charge",
    header: () => <div className="text-right">Charge</div>,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatMoney(row.original.charge)}</div>,
  },
  {
    id: "cod_available",
    header: "COD",
    cell: ({ row }) =>
      row.original.cod_available ? (
        <Badge variant="success">Yes</Badge>
      ) : (
        <Badge variant="secondary">No</Badge>
      ),
  },
  {
    id: "advance_required",
    header: "Advance",
    cell: ({ row }) =>
      row.original.advance_required ? (
        <Badge variant="warning">Required</Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  { accessorKey: "eta_text", header: "ETA", cell: ({ row }) => row.original.eta_text ?? "—" },
  {
    id: "is_active",
    header: "Status",
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge variant="success">Active</Badge>
      ) : (
        <Badge variant="secondary">Inactive</Badge>
      ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <ZoneRowActions zone={row.original} />,
  },
]

function ZonesTable({ zones }: { zones: DeliveryZone[] }) {
  return <DataTable columns={columns} data={zones} searchKey="name" searchPlaceholder="Search zones..." />
}

export { ZonesTable, ZoneDialog }
