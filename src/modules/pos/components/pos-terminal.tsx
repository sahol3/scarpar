'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { toPaisa } from '@/lib/money'
import { posCheckoutAction, type PosCheckoutInput } from '@/modules/pos/actions'
import { ProductGrid } from '@/modules/pos/components/product-grid'
import { CartPanel } from '@/modules/pos/components/cart-panel'

export interface PosVariant {
  id: string
  name: string
  sku: string | null
  price: number
  stockQty: number
  options: Record<string, unknown>
  isDefault: boolean
}

export interface PosProduct {
  id: string
  name: string
  price: number
  sku: string | null
  barcode: string | null
  stockQty: number
  trackStock: boolean
  categoryId: string | null
  imageUrl: string | null
  variants: PosVariant[]
}

export interface PosCategory {
  id: string
  name: string
}

export interface CartLine {
  /** productId, or `${productId}:${variantId}` when a variant is selected. */
  key: string
  productId: string
  variantId: string | null
  name: string
  variantName: string | null
  unitPrice: number
  qty: number
}

type TenderMethod = 'cash' | 'bank'

interface PosTerminalProps {
  products: PosProduct[]
  categories: PosCategory[]
}

export function PosTerminal({ products, categories }: PosTerminalProps) {
  const router = useRouter()
  const searchRef = React.useRef<HTMLInputElement>(null)

  const [search, setSearch] = React.useState('')
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [customerName, setCustomerName] = React.useState('')
  const [customerPhone, setCustomerPhone] = React.useState('')
  const [discountTaka, setDiscountTaka] = React.useState('')
  const [tenderMethod, setTenderMethod] = React.useState<TenderMethod>('cash')
  const [amountReceivedTaka, setAmountReceivedTaka] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Keyboard: "/" focuses search, unless the user is already typing somewhere.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const addToCart = React.useCallback((product: PosProduct, variant?: PosVariant) => {
    const key = variant ? `${product.id}:${variant.id}` : product.id
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key)
      if (existing) {
        return prev.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line))
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId: variant?.id ?? null,
          name: product.name,
          variantName: variant?.name ?? null,
          unitPrice: variant?.price ?? product.price,
          qty: 1,
        },
      ]
    })
  }, [])

  function updateQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((line) => line.key !== key)
        : prev.map((line) => (line.key === key ? { ...line, qty } : line)),
    )
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key))
  }

  // Barcode-scanner-friendly: scanners type the code then send Enter. An exact
  // sku/barcode match on Enter auto-adds instead of requiring a grid click.
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    const query = search.trim().toLowerCase()
    if (!query) return

    const match = products.find(
      (product) =>
        product.sku?.toLowerCase() === query ||
        product.barcode?.toLowerCase() === query ||
        product.variants.some((variant) => variant.sku?.toLowerCase() === query),
    )
    if (!match) return

    event.preventDefault()
    const variantMatch = match.variants.find((variant) => variant.sku?.toLowerCase() === query)
    addToCart(match, variantMatch ?? (match.variants.length === 1 ? match.variants[0] : undefined))
    setSearch('')
  }

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
  const discountAmount = Math.min(toPaisa(discountTaka), subtotal)
  const total = Math.max(subtotal - discountAmount, 0)
  const amountReceived = amountReceivedTaka.trim() ? toPaisa(amountReceivedTaka) : undefined
  const changeDue =
    tenderMethod === 'cash' && amountReceived !== undefined ? Math.max(amountReceived - total, 0) : 0

  function resetTicket() {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setDiscountTaka('')
    setAmountReceivedTaka('')
    setTenderMethod('cash')
  }

  async function completeSale() {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    if (tenderMethod === 'cash' && amountReceived !== undefined && amountReceived < total) {
      toast.error('Amount received is less than the total due')
      return
    }

    setIsSubmitting(true)
    const input: PosCheckoutInput = {
      customerName,
      customerPhone,
      paymentMethod: tenderMethod,
      amountReceived,
      discountAmount,
      items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, qty: line.qty })),
    }

    const result = await posCheckoutAction(input)
    setIsSubmitting(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    const sale = result.data
    toast.success(`Sale complete — ${sale?.orderNo}`, {
      description: sale && sale.changeDue > 0 ? `Change due: دج${(sale.changeDue / 100).toFixed(2)}` : undefined,
    })

    if (sale) {
      window.open(`/print/thermal/${sale.orderId}`, '_blank', 'noopener,noreferrer')
    }

    resetTicket()
    router.refresh()
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <ProductGrid
        products={products}
        categories={categories}
        search={search}
        onSearchChange={setSearch}
        onSearchKeyDown={handleSearchKeyDown}
        searchRef={searchRef}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        onAdd={addToCart}
      />
      <CartPanel
        cart={cart}
        onUpdateQty={updateQty}
        onRemove={removeLine}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        customerPhone={customerPhone}
        onCustomerPhoneChange={setCustomerPhone}
        discountTaka={discountTaka}
        onDiscountTakaChange={setDiscountTaka}
        tenderMethod={tenderMethod}
        onTenderMethodChange={setTenderMethod}
        amountReceivedTaka={amountReceivedTaka}
        onAmountReceivedTakaChange={setAmountReceivedTaka}
        subtotal={subtotal}
        discountAmount={discountAmount}
        total={total}
        changeDue={changeDue}
        isSubmitting={isSubmitting}
        onCompleteSale={completeSale}
      />
    </div>
  )
}
