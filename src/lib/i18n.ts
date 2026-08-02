// Tiny storefront i18n dict (ar/fr). Admin stays English per conventions.md.
// Arabic is RTL — pair with `dir="rtl"` on the storefront root when lang === 'ar'
// and the `.font-arabic` class (see globals.css) on rendered text.

export type Lang = 'ar' | 'fr'

export type StringKey =
  | 'add_to_cart'
  | 'checkout'
  | 'place_order'
  | 'your_cart'
  | 'cart_empty'
  | 'subtotal'
  | 'delivery_charge'
  | 'total'
  | 'advance_payable'
  | 'cash_on_delivery'
  | 'phone'
  | 'name'
  | 'address'
  | 'district'
  | 'wilaya'
  | 'track_order'
  | 'order_placed'
  | 'continue_shopping'
  | 'search'
  | 'all_products'
  | 'out_of_stock'
  | 'quantity'
  | 'remove'
  | 'payment_method'
  | 'send_money_instructions'
  | 'transaction_id'
  // Delivery/track-page statuses (src/lib/status.ts DeliveryStatus) — shared across
  // the public /track/[code] page and any storefront delivery-status display.
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'returned'

export const STRINGS: Record<StringKey, { ar: string; fr: string }> = {
  add_to_cart: { ar: 'أضف إلى السلة', fr: 'Ajouter au panier' },
  checkout: { ar: 'إتمام الطلب', fr: 'Commander' },
  place_order: { ar: 'تأكيد الطلب', fr: 'Passer la commande' },
  your_cart: { ar: 'سلتك', fr: 'Votre panier' },
  cart_empty: { ar: 'سلتك فارغة', fr: 'Votre panier est vide' },
  subtotal: { ar: 'المجموع الفرعي', fr: 'Sous-total' },
  delivery_charge: { ar: 'رسوم التوصيل', fr: 'Frais de livraison' },
  total: { ar: 'المجموع الكلي', fr: 'Total' },
  advance_payable: { ar: 'الدفعة المقدمة', fr: 'Avance à payer' },
  cash_on_delivery: { ar: 'الدفع عند الاستلام', fr: 'Paiement à la livraison' },
  phone: { ar: 'رقم الهاتف', fr: 'Numéro de téléphone' },
  name: { ar: 'الاسم', fr: 'Nom' },
  address: { ar: 'العنوان', fr: 'Adresse' },
  district: { ar: 'الولاية', fr: 'Wilaya' },
  wilaya: { ar: 'الولاية', fr: 'Wilaya' },
  track_order: { ar: 'تتبع الطلب', fr: 'Suivre la commande' },
  order_placed: { ar: 'تم إرسال الطلب', fr: 'Commande passée' },
  continue_shopping: { ar: 'متابعة التسوق', fr: 'Continuer les achats' },
  search: { ar: 'بحث', fr: 'Rechercher' },
  all_products: { ar: 'جميع المنتجات', fr: 'Tous les produits' },
  out_of_stock: { ar: 'غير متوفر', fr: 'Rupture de stock' },
  quantity: { ar: 'الكمية', fr: 'Quantité' },
  remove: { ar: 'إزالة', fr: 'Retirer' },
  payment_method: { ar: 'طريقة الدفع', fr: 'Mode de paiement' },
  send_money_instructions: { ar: 'تعليمات تحويل المبلغ', fr: "Instructions pour l'envoi" },
  transaction_id: { ar: 'مرجع التحويل', fr: 'Référence de virement' },
  pending: { ar: 'قيد الانتظار', fr: 'En attente' },
  assigned: { ar: 'تم التعيين', fr: 'Assignée' },
  picked_up: { ar: 'تم الاستلام', fr: 'Ramassée' },
  in_transit: { ar: 'في الطريق', fr: 'En transit' },
  delivered: { ar: 'تم التوصيل', fr: 'Livrée' },
  failed: { ar: 'فشلت', fr: 'Échec' },
  returned: { ar: 'مرتجعة', fr: 'Retournée' },
}

export function t(key: StringKey, lang: Lang = 'ar'): string {
  return STRINGS[key]?.[lang] ?? STRINGS[key]?.ar ?? key
}

/** Text direction helper for the storefront root — Arabic is RTL, French is LTR. */
export function langDir(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}
