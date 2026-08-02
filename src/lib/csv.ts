// CSV export helpers used by report/export server actions (docs/architecture.md §11).

export interface CsvColumn {
  key: string
  label: string
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = value instanceof Date ? value.toISOString() : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(rows: Record<string, unknown>[], columns?: CsvColumn[]): string {
  const cols =
    columns ?? (rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key })) : [])

  const header = cols.map((c) => escapeCsvValue(c.label)).join(',')
  const lines = rows.map((row) => cols.map((c) => escapeCsvValue(row[c.key])).join(','))

  return [header, ...lines].join('\r\n')
}

// UTF-8 BOM, written as an escape sequence (not a literal char) so it stays
// visible/greppable in source instead of an invisible byte.
const UTF8_BOM = '\uFEFF'

/** BOM-prefixed so Excel renders Arabic/French headers and content correctly. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(UTF8_BOM + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
