// Settings engine registry (docs/architecture.md §5 — binding contract).
// Settings UI (src/app/(admin)/admin/settings) renders groups from SETTING_DEFS.
import type { Role } from '@/types/db'

export type SettingType = 'boolean' | 'number' | 'text' | 'select' | 'json'

export type SettingGroup =
  | 'checkout'
  | 'payments'
  | 'delivery'
  | 'fraud'
  | 'inventory'
  | 'notifications'
  | 'tax'
  | 'localization'
  | 'printing'
  | 'storefront'

export interface SettingOption {
  value: string
  label: string
}

export interface SettingDef {
  key: string
  group: SettingGroup
  label: string
  help?: string
  type: SettingType
  options?: SettingOption[]
  default: unknown
  /** Roles allowed to view/edit this setting. Unset = any admin-side role. */
  roles?: Role[]
}

export const SETTING_GROUPS: SettingGroup[] = [
  'checkout',
  'payments',
  'delivery',
  'fraud',
  'inventory',
  'notifications',
  'tax',
  'localization',
  'printing',
  'storefront',
]

export const SETTING_DEFS: SettingDef[] = [
  // checkout ------------------------------------------------------------
  {
    key: 'checkout.guest_enabled',
    group: 'checkout',
    label: 'Allow guest checkout',
    type: 'boolean',
    default: true,
  },
  {
    key: 'checkout.min_order',
    group: 'checkout',
    label: 'Minimum order amount (paisa)',
    type: 'number',
    default: 0,
  },

  // payments --------------------------------------------------------------
  {
    key: 'payments.cod_enabled',
    group: 'payments',
    label: 'Enable cash on delivery',
    type: 'boolean',
    default: true,
  },
  {
    key: 'payments.advance_required',
    group: 'payments',
    label: 'Require advance payment',
    type: 'boolean',
    default: false,
  },
  {
    key: 'payments.advance_amount',
    group: 'payments',
    label: 'Advance amount (paisa)',
    help: 'Used when advance_type is "fixed"',
    type: 'number',
    default: 12000,
  },
  {
    key: 'payments.advance_type',
    group: 'payments',
    label: 'Advance type',
    type: 'select',
    options: [
      { value: 'fixed', label: 'Fixed amount' },
      { value: 'percent', label: 'Percent of total' },
    ],
    default: 'fixed',
  },
  {
    key: 'payments.methods',
    group: 'payments',
    label: 'Enabled payment methods',
    help: 'Subset of cod, bank, cash',
    type: 'json',
    default: ['cod'],
  },
  {
    key: 'payments.bank_details',
    group: 'payments',
    label: 'Bank transfer instructions',
    help: 'Shown at checkout when an advance payment is required (account name/number, bank, RIB)',
    type: 'text',
    default: '',
  },

  // delivery ----------------------------------------------------------------
  {
    key: 'delivery.default_zone_fallback',
    group: 'delivery',
    label: 'Fallback delivery charge (paisa)',
    help: 'Used when the customer district matches no configured delivery zone',
    type: 'number',
    default: 0,
  },
  {
    key: 'delivery.free_above',
    group: 'delivery',
    label: 'Free delivery above (paisa)',
    help: '0 disables free delivery',
    type: 'number',
    default: 0,
  },

  // fraud ---------------------------------------------------------------
  {
    key: 'fraud.enabled',
    group: 'fraud',
    label: 'Enable fraud checks',
    type: 'boolean',
    default: false,
  },
  {
    key: 'fraud.provider',
    group: 'fraud',
    label: 'Fraud provider',
    type: 'select',
    options: [
      { value: 'internal_blocklist', label: 'Internal blocklist (self-hosted)' },
      { value: 'disabled', label: 'Disabled' },
    ],
    default: 'disabled',
  },
  {
    key: 'fraud.high_risk_action',
    group: 'fraud',
    label: 'Action on high-risk orders',
    type: 'select',
    options: [
      { value: 'block', label: 'Block order' },
      { value: 'require_full_advance', label: 'Require full advance' },
      { value: 'flag', label: 'Flag only' },
    ],
    default: 'flag',
  },

  // inventory -----------------------------------------------------------
  {
    key: 'inventory.track_stock',
    group: 'inventory',
    label: 'Track stock levels',
    type: 'boolean',
    default: true,
  },
  {
    key: 'inventory.allow_backorder',
    group: 'inventory',
    label: 'Allow backorders',
    type: 'boolean',
    default: false,
  },
  {
    key: 'inventory.low_stock_threshold',
    group: 'inventory',
    label: 'Low stock threshold',
    type: 'number',
    default: 5,
  },

  // notifications -------------------------------------------------------
  {
    key: 'notifications.events',
    group: 'notifications',
    label: 'Notification channels per event',
    help: 'Map of event name to channel list. Events not listed default to ["inapp"].',
    type: 'json',
    default: {},
  },

  // tax -------------------------------------------------------------------
  {
    key: 'tax.mode',
    group: 'tax',
    label: 'Tax mode',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'inclusive', label: 'Inclusive' },
      { value: 'exclusive', label: 'Exclusive' },
    ],
    default: 'none',
  },
  {
    key: 'tax.vat_rate',
    group: 'tax',
    label: 'VAT rate (%)',
    type: 'number',
    default: 19,
  },
  {
    key: 'tax.mushak_enabled',
    group: 'tax',
    label: 'Enable Mushak 6.3',
    type: 'boolean',
    default: false,
  },

  // localization ----------------------------------------------------------
  {
    key: 'localization.language',
    group: 'localization',
    label: 'Default language',
    type: 'select',
    options: [
      { value: 'ar', label: 'العربية (Arabic)' },
      { value: 'fr', label: 'Français (French)' },
    ],
    default: 'ar',
  },

  // printing ------------------------------------------------------------
  {
    key: 'printing.invoice_template',
    group: 'printing',
    label: 'Invoice template',
    type: 'select',
    options: [
      { value: 'a4_default', label: 'A4 default' },
      { value: 'a4_mushak', label: 'A4 with Mushak 6.3' },
    ],
    default: 'a4_default',
  },
  {
    key: 'printing.footer_text',
    group: 'printing',
    label: 'Print footer text',
    type: 'text',
    default: '',
  },

  // storefront ------------------------------------------------------------
  {
    key: 'storefront.announcement',
    group: 'storefront',
    label: 'Announcement bar text',
    help: 'Empty hides the bar',
    type: 'text',
    default: '',
  },
  {
    key: 'storefront.whatsapp_number',
    group: 'storefront',
    label: 'WhatsApp float button number',
    type: 'text',
    default: '',
  },
  {
    key: 'storefront.primary_color',
    group: 'storefront',
    label: 'Storefront accent color',
    type: 'text',
    default: '#059669',
  },
]

export const DEFAULT_SETTINGS: Record<string, unknown> = Object.fromEntries(
  SETTING_DEFS.map((def) => [def.key, def.default]),
)
