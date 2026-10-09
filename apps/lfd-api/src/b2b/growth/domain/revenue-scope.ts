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
 * **Règlements porteurs de CA** (plan
 * `documentation/order/commande-carte-reglee.md`, §2.5, §4.7) : une
 * commande ne compte que réglée — au compte ou gratuite (`not_required`), ou
 * encaissée par carte (`paid`). Une carte en attente (`pending`) ou refusée
 * (`failed`) n'est pas un chiffre d'affaires : Hugo lisait 3 € pour 1,90 €
 * encaissés le 2026-10-09.
 *
 * ⚠️ `refunded` est exclu aussi : la commande entière a été rendue. Un
 * remboursement PARTIEL laisse `paid` et n'est pas déduit — les lecteurs de CA
 * ne lisent pas `order_refunds` (vérifié le 2026-10-09).
 */
export const REVENUE_PAYMENT_STATUSES = ["not_required", "paid"] as const;

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
