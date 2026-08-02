'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

function dismissKey(text: string): string {
  return `scarpar-announcement-dismissed:${text}`
}

/** settings.storefront.announcement text — dismissible, remembered for the browser session. */
export function AnnouncementBar({ text }: { text: string }) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(dismissKey(text)) === '1') setDismissed(true)
    } catch {
      // sessionStorage unavailable — bar just stays visible for this load
    }
  }, [text])

  if (!text || dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(dismissKey(text), '1')
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative flex items-center justify-center bg-primary px-10 py-2 text-center text-xs font-medium text-primary-foreground">
      <span className="font-arabic">{text}</span>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={handleDismiss}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 opacity-80 transition-opacity hover:bg-black/10 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
