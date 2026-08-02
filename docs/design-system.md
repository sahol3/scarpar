# Scarpar — Design System (binding contract)

Read this before building any UI (docs/conventions.md). Source of truth: `src/app/globals.css`
(tokens) + `src/styles/print.css` (receipts/labels). Aesthetic: **operational calm** — zinc
neutrals, borders over shadows, one accent (deep emerald), dense/fast/keyboard-friendly.

## a) Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` / `foreground` | zinc-50 / zinc-950 | zinc-950 / zinc-50 | page canvas / body text |
| `card`, `popover` (+`-foreground`) | white / zinc-950 | zinc-900 / zinc-50 | panel & menu surface |
| `muted` / `muted-foreground` | zinc-100 / zinc-600 | zinc-800 / zinc-400 | subdued fill / secondary text |
| `border`, `input` | zinc-200 | zinc-800 | hairlines, field outline |
| `accent` / `-foreground` | zinc-100 / zinc-900 | zinc-800 / zinc-50 | hover/highlight surface |
| `secondary` / `-foreground` | zinc-100 / zinc-900 | zinc-800 / zinc-50 | secondary button fill |
| `primary` / `-foreground` | emerald-800 / emerald-50 | emerald-500 / emerald-950 | the one accent: CTAs, active nav, links |
| `success` / `-foreground` | emerald-800 / emerald-50 | emerald-500 / emerald-950 | positive status (same hue as primary) |
| `warning` / `-foreground` | amber-600 / amber-950 | amber-500 / amber-950 | COD/pending-cash, low stock — nothing else |
| `destructive` / `-foreground` | red-700 / red-50 | red (brightened) / red-50 | destructive / failed |
| `ring` | = primary | = primary | focus-visible outline, 2px (globals.css) |
| `chart-1`…`chart-4` | emerald-600, amber-700, blue-600, violet-600 | emerald-500, amber-500, blue-500, violet-500 | data-viz only — exempt from "one accent" |
| `sidebar`, `-accent`, `-border` (+`-foreground`) | mirrors `background`/`accent`/`border` | mirrors dark col | nav rail recedes to page bg, border-separated |
| `radius` (`-sm/-md/-lg/-xl`) | 4 / 6 / 8 / 12px | same | inputs+buttons = md(6), cards = lg(8) |
| `font-sans`, `font-arabic` | Inter, Noto Naskh Arabic | same | next/font vars, body-scoped |

Brand/status colors (primary, success, warning, destructive) are **theme-invariant** — same
meaning, same weight in both themes. Only neutrals and chart marks adapt per theme.

## b) Typography scale

| px | Token | Line-height | Usage |
|---|---|---|---|
| 11 | `text-2xs` | 15 | micro labels, uppercase table headers |
| 12 | `text-xs` | 16 | captions, badge text, helper/error text |
| 13 | `text-sm` | 20 | **base** — body text, table cells, inputs |
| 14 | `text-base` | 22 | emphasized body, card titles |
| 16 | `text-lg` | 24 | stat/KPI numbers, dialog titles |
| 20 | `text-xl` | 28 | PageHeader title |
| 24 | `text-2xl` | 32 | rare — onboarding/empty-state headline |

## c) Component conventions

- **Buttons** — 32px default / 28px compact height, `radius-md`. Variants: primary (solid
  emerald), secondary (zinc-100 fill), outline (border, transparent fill), ghost (transparent,
  hover = accent), destructive (solid red), link. Icon-only buttons are square at the same height.
- **Inputs** — 32px height, `radius-md`. Label 12px medium, 4px above the field (never inline or
  floating). Placeholder = `muted-foreground`. Helper/error text 12px below the field.
- **Tables** — 36px row height, 12px uppercase `muted-foreground` header with letter-spacing.
  1px `border` under each row. Money/qty columns right-aligned + `tabular-nums`. Row hover = accent.
- **Cards** — 1px `border` + `radius-lg`, `card` background. Never a shadow. Padding 16–24px.
- **Page structure** — `PageHeader`: 20px (`text-xl`) title left, actions right (32px buttons).
  Content: no `max-w` cap, `px-6` gutters, 24px section gaps.
- **Empty states** — icon (muted-foreground) + one line message + one primary action. No stock
  illustrations.
- **Status badges** — tinted pill (light bg + saturated text) + a text label, always together —
  color is never the only signal (deuteranopia-safe by construction). Exactly 4 semantic colors,
  reused across every entity:
  - **Neutral** zinc-100/zinc-700 · dark zinc-800/zinc-300 — in progress, nothing to flag
  - **Warning** amber-100/amber-900 · dark amber-950/amber-200 — needs attention soon
  - **Success** emerald-100/emerald-800 · dark emerald-950/emerald-200 — landed positively
  - **Destructive** red-100/red-800 · dark red-950/red-200 — failed / errored

  | Entity | Neutral | Warning | Success | Destructive |
  |---|---|---|---|---|
  | Order (`orders.status`) | pending, confirmed, packed, dispatched, cancelled | returned | delivered, completed | failed |
  | Payment (`orders.payment_status`) | advance_paid, refunded, partial_refund | unpaid | paid | — |
  | Delivery (`deliveries.status`) | pending, assigned, picked_up, in_transit | returned | delivered | failed |
  | Stock (derived) | backorder | low_stock | in_stock | out_of_stock |

  `cancelled` is neutral, not destructive — it's a stopped process, not a failure. `returned` is
  warning on both order and delivery — goods/cash need reconciling, it isn't an error either.

## d) Motion rules

Transitions ≤150ms, ease-out only — no bounce/spring/elastic anywhere in the admin. Animate
`transform`/`opacity`/color/border only, never layout (`width`/`height`/`top`/`left`). Skeleton
shimmer capped at a 1s loop, low amplitude. Table/page content changes render instantly — a dense
data UI is read, not watched. Toasts (sonner): its default 200ms slide+fade is fine as-is.

## e) Dark mode

Class-strategy (`.dark` on `<html>`). Neutrals are fully re-themed per theme (never a CSS
`invert()`); primary/success/warning/destructive keep identical values in both themes. Sidebar
background matches the page background exactly (recedes); cards sit one step lighter for
separation; borders — never shadows — mark every seam.

## f) DO NOT

1. No gradients anywhere in the admin/data UI (screen or print).
2. No shadows beyond a 1px page-edge hint in print preview — border + background-step separate
   surfaces, never elevation.
3. No more than one accent (emerald) as a dominant fill per view — status tints and chart series
   are the only documented exceptions.
4. No skeleton shimmer loop longer than 1s, and never high-contrast/flashy.
5. No color-only status signaling — a badge always ships with a text label.
6. No hex/rgb literals in components — reference tokens or the exposed Tailwind color utilities.
7. No bounce/spring/elastic easing, no transition over 150ms outside route-level page loads.
8. No decorative icons — every icon is a nav/action affordance or a status marker.
9. No amber outside COD/pending-cash and low-stock — it is not a general "notice" color.
10. No centered/symmetric hero-style layouts in the admin shell — dense left-nav + content, not
    a marketing page.
