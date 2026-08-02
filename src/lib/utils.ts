import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware class merge — used by every UI primitive in @/components/ui. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function truncate(text: string, maxLength: number, suffix = '…'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, Math.max(0, maxLength - suffix.length)) + suffix
}

const RANDOM_KEY_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** nanoid-style random key, generated from Web Crypto (no nanoid dependency). */
export function randomKey(len = 8): string {
  const bytes = new Uint8Array(len)

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256)
  }

  let out = ''
  for (let i = 0; i < len; i++) {
    out += RANDOM_KEY_ALPHABET[bytes[i] % RANDOM_KEY_ALPHABET.length]
  }
  return out
}

/**
 * Unicode-aware slugify — keeps Arabic (and other non-Latin) letters/digits
 * instead of stripping them, since product/category names may be in Arabic or French.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}
