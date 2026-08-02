// Money helpers. DB bigint smallest-unit ("paisa" naming kept for API/DB
// stability) -> TS number (1 DZD = 100 centimes). No float DZD math —
// toPaisa parses via string math to avoid float artifacts.

const DZD_SYMBOL = 'دج'

export function fromPaisa(paisa: number): number {
  return paisa / 100
}

/**
 * Parses a DZD amount (string or number) into integer centimes via string
 * math — avoids classic float-multiplication artifacts (e.g. 1234.5 * 100).
 * Rounds half-up on the 3rd decimal digit if more than 2 fraction digits are given.
 */
export function toPaisa(taka: string | number): number {
  const raw = String(taka).trim()
  if (raw === '' || raw === '-') return 0

  const negative = raw.startsWith('-')
  const clean = (negative ? raw.slice(1) : raw).replace(/,/g, '')
  const [wholeRaw, fracRaw = ''] = clean.split('.')
  const whole = wholeRaw === '' ? '0' : wholeRaw

  const fracExtended = (fracRaw + '000').slice(0, 3)
  const keep = fracExtended.slice(0, 2)
  const roundUp = Number(fracExtended[2] ?? '0') >= 5

  let paisa = Number(whole) * 100 + Number(keep === '' ? '0' : keep)
  if (roundUp) paisa += 1

  return negative ? -paisa : paisa
}

/** "دج1,234" — drops .00, shows decimals only when the centime remainder is non-zero. */
export function formatMoney(paisa: number, opts?: { symbol?: boolean }): string {
  const showSymbol = opts?.symbol ?? true
  const negative = paisa < 0
  const abs = Math.abs(Math.round(paisa))
  const whole = Math.floor(abs / 100)
  const frac = abs % 100

  const wholeFormatted = whole.toLocaleString('en-US')
  const amount =
    frac === 0 ? wholeFormatted : `${wholeFormatted}.${frac.toString().padStart(2, '0')}`

  return `${negative ? '-' : ''}${showSymbol ? DZD_SYMBOL : ''}${amount}`
}

const ONES = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

/** French 0-99, handling the soixante-dix/quatre-vingt(-dix) irregularities. */
function twoDigitsToWordsFR(n: number): string {
  if (n < 17) return ONES[n]
  if (n < 20) return ONES[n]
  if (n < 70) {
    const tensDigit = Math.floor(n / 10)
    const onesDigit = n % 10
    if (onesDigit === 0) return TENS[tensDigit]
    if (onesDigit === 1 && tensDigit !== 8) return `${TENS[tensDigit]} et un`
    return `${TENS[tensDigit]}-${ONES[onesDigit]}`
  }
  // 70-79: soixante-dix..soixante-dix-neuf ; 80-89: quatre-vingts..quatre-vingt-dix-neuf's teens
  if (n < 80) {
    const rest = n - 60
    return rest === 11 ? 'soixante et onze' : `soixante-${ONES[rest]}`
  }
  if (n === 80) return 'quatre-vingts'
  if (n < 90) return `quatre-vingt-${ONES[n - 80]}`
  const rest = n - 80
  return `quatre-vingt-${ONES[rest]}`
}

function threeDigitsToWordsFR(n: number, isLastGroup: boolean): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []

  if (hundreds) {
    parts.push(hundreds === 1 ? 'cent' : `${ONES[hundreds]} cent`)
    if (hundreds > 1 && rest === 0 && isLastGroup) parts[parts.length - 1] += 's'
  }
  if (rest) parts.push(twoDigitsToWordsFR(rest))

  return parts.join(' ')
}

/** Standard international grouping (thousand/million/milliard), French words. */
function integerToWordsFR(n: number): string {
  if (n === 0) return 'zéro'

  const milliard = Math.floor(n / 1_000_000_000)
  const million = Math.floor((n % 1_000_000_000) / 1_000_000)
  const millier = Math.floor((n % 1_000_000) / 1_000)
  const rest = n % 1000

  const parts: string[] = []
  if (milliard) parts.push(`${milliard === 1 ? 'un' : threeDigitsToWordsFR(milliard, true)} milliard${milliard > 1 ? 's' : ''}`)
  if (million) parts.push(`${million === 1 ? 'un' : threeDigitsToWordsFR(million, true)} million${million > 1 ? 's' : ''}`)
  if (millier) parts.push(millier === 1 ? 'mille' : `${threeDigitsToWordsFR(millier, true)} mille`)
  if (rest) parts.push(threeDigitsToWordsFR(rest, true))

  return parts.join(' ')
}

/** French amount-in-words for receipts, e.g. "Mille cinq cents dinars algériens". */
export function moneyToWords(paisa: number): string {
  const negative = paisa < 0
  const abs = Math.abs(Math.round(paisa))
  const whole = Math.floor(abs / 100)
  const frac = abs % 100

  let words = `${negative ? 'moins ' : ''}${integerToWordsFR(whole)} dinar${whole > 1 ? 's' : ''} algérien${whole > 1 ? 's' : ''}`
  if (frac > 0) {
    words += ` et ${integerToWordsFR(frac)} centime${frac > 1 ? 's' : ''}`
  }

  return words.charAt(0).toUpperCase() + words.slice(1)
}

function trimTrailingZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** Compact DZD display: "1.2k" / "3.4M" (million) / "2.1Md" (milliard). No symbol by default. */
export function formatCompact(paisa: number, opts?: { symbol?: boolean }): string {
  const showSymbol = opts?.symbol ?? false
  const negative = paisa < 0
  const taka = Math.abs(paisa) / 100

  let value: string
  if (taka >= 1_000_000_000) {
    value = `${trimTrailingZero((taka / 1_000_000_000).toFixed(1))}Md`
  } else if (taka >= 1_000_000) {
    value = `${trimTrailingZero((taka / 1_000_000).toFixed(1))}M`
  } else if (taka >= 1000) {
    value = `${trimTrailingZero((taka / 1000).toFixed(1))}k`
  } else {
    value = trimTrailingZero(taka.toFixed(Number.isInteger(taka) ? 0 : 1))
  }

  return `${negative ? '-' : ''}${showSymbol ? DZD_SYMBOL : ''}${value}`
}
