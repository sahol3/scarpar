import type { ModuleDef } from '@/modules/types'

export const config: ModuleDef = {
  key: 'pos',
  name: 'POS',
  description: 'In-store point-of-sale for walk-in cash and bank-transfer sales.',
  nav: [{ label: 'POS', href: '/admin/pos', icon: 'CreditCard' }],
}
