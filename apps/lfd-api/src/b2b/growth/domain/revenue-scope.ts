/**
 * **Périmètre du chiffre d'affaires** — partagé par tous les lecteurs de CA pour
 * qu'ils comptent exactement la même chose.
 *
 * Statuts porteurs de CA : une commande passée engage le client. Sont EXCLUS
 * `draft` (panier jamais validé) et `cancelled` (annulée — l'argent n'existe pas).
 * Les compter gonflait mécaniquement tous les graphes de CA.
 */
export const REVENUE_ORDER_STATUSES = [
  "placed",
  "confirmed",
  "in_production",
  "fulfilled",
] as const;

/**
 * **CA marchandises HT** d'une commande, en centimes :
 * `subtotal − discount − voucherDiscount`.
 *
 * Le bon de fidélité (`voucher_discount_cents`) est une réduction HT au même
 * titre que la remise : le calcul de TVA des commandes les additionne
 * (`orders/domain/services/vat.ts`, vérifié le 2026-09-27). L'oublier
 * surestimait le CA marchandises dès le premier bon utilisé.
 *
 * C'est la base pilotable — elle exclut la TVA et les frais de livraison, qui
 * font bouger le total sans qu'un euro de marchandise ait changé. À utiliser pour
 * le panier moyen et les analyses de mix ; `totalCents` (TTC) reste la vérité
 * d'encaissement.
 */
export function goodsCents(order: {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
}): number {
  return Math.max(0, order.subtotalCents - order.discountCents - order.voucherDiscountCents);
}
