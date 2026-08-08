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
 * **CA marchandises HT** d'une commande, en centimes : `subtotal − discount`.
 *
 * C'est la base pilotable — elle exclut la TVA et les frais de livraison, qui
 * font bouger le total sans qu'un euro de marchandise ait changé. À utiliser pour
 * le panier moyen et les analyses de mix ; `totalCents` (TTC) reste la vérité
 * d'encaissement.
 */
export function goodsCents(order: { subtotalCents: number; discountCents: number }): number {
  return Math.max(0, order.subtotalCents - order.discountCents);
}
