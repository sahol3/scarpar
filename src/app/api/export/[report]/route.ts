// CSV export endpoint for the reports module (docs/architecture.md §11, docs/conventions.md).
// GET /api/export/{sales|products|delivery|mushak}?from=yyyy-mm-dd&to=yyyy-mm-dd

import type { NextRequest } from 'next/server'

import { requireOrg } from '@/lib/auth'
import { csvResponse, toCsv } from '@/lib/csv'
import { requireModule } from '@/lib/modules'
import { fromPaisa } from '@/lib/money'
import { codSuccessByDistrict, mushakSalesRegister, resolveRange, salesByDay, topProducts } from '@/modules/reports/queries'

export const dynamic = 'force-dynamic'

const VALID_REPORTS = ['sales', 'products', 'delivery', 'mushak'] as const
type ReportKey = (typeof VALID_REPORTS)[number]

function isReportKey(value: string): value is ReportKey {
  return (VALID_REPORTS as readonly string[]).includes(value)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params

  if (!isReportKey(report)) {
    return new Response('Not found', { status: 404 })
  }

  const ctx = await requireOrg()
  requireModule(ctx.org, 'reports')

  const { searchParams } = new URL(request.url)
  const range = resolveRange({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  })
  const filename = `scarpar-${report}-${range.from}-${range.to}.csv`

  switch (report) {
    case 'sales': {
      const rows = await salesByDay(ctx.org.id, range)
      const csv = toCsv(
        rows.map((row) => ({ date: row.date, revenue: fromPaisa(row.revenue), orders: row.orders })),
        [
          { key: 'date', label: 'Date' },
          { key: 'revenue', label: 'Revenue (DZD)' },
          { key: 'orders', label: 'Orders' },
        ],
      )
      return csvResponse(filename, csv)
    }
    case 'products': {
      const rows = await topProducts(ctx.org.id, range)
      const csv = toCsv(
        rows.map((row) => ({ product: row.productName, revenue: fromPaisa(row.revenue), units: row.units })),
        [
          { key: 'product', label: 'Product' },
          { key: 'revenue', label: 'Revenue (DZD)' },
          { key: 'units', label: 'Units' },
        ],
      )
      return csvResponse(filename, csv)
    }
    case 'delivery': {
      const rows = await codSuccessByDistrict(ctx.org.id, range)
      const csv = toCsv(
        rows.map((row) => ({
          district: row.district,
          delivered: row.delivered,
          failed: row.failed,
          rate: row.rate.toFixed(1),
        })),
        [
          { key: 'district', label: 'District' },
          { key: 'delivered', label: 'Delivered' },
          { key: 'failed', label: 'Failed' },
          { key: 'rate', label: 'Success Rate (%)' },
        ],
      )
      return csvResponse(filename, csv)
    }
    case 'mushak': {
      const rows = await mushakSalesRegister(ctx.org.id, range)
      const csv = toCsv(
        rows.map((row) => ({
          date: row.date,
          invoiceNo: row.invoiceNo,
          customer: row.customer,
          subtotal: fromPaisa(row.subtotal),
          vat: fromPaisa(row.vat),
          total: fromPaisa(row.total),
        })),
        [
          { key: 'date', label: 'Date' },
          { key: 'invoiceNo', label: 'Invoice/Order No' },
          { key: 'customer', label: 'Customer' },
          { key: 'subtotal', label: 'Subtotal (DZD)' },
          { key: 'vat', label: 'VAT (DZD)' },
          { key: 'total', label: 'Total (DZD)' },
        ],
      )
      return csvResponse(filename, csv)
    }
    default: {
      return new Response('Not found', { status: 404 })
    }
  }
}
