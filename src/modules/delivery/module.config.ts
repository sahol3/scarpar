import type { ModuleDef } from '@/modules/types'

export const config: ModuleDef = {
  key: 'delivery',
  name: 'Delivery',
  description: 'Delivery zones, riders, couriers, and COD settlement.',
  nav: [
    { label: 'Deliveries', href: '/admin/deliveries', icon: 'Truck' },
    { label: 'Zones', href: '/admin/delivery-zones', icon: 'Truck' },
    { label: 'Courier Pricing', href: '/admin/delivery-pricing', icon: 'Truck' },
    { label: 'Riders', href: '/admin/riders', icon: 'Truck' },
    { label: 'COD', href: '/admin/cod', icon: 'Truck' },
  ],
  dashboardWidgets: ['deliveries-pending', 'cod-outstanding'],
}
