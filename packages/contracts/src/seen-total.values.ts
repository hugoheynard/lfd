/**
 * **Le code du refus « le total a changé », sans zod** — lu par la boutique
 * (via `@lfd/contracts/shop-values`), la saisie de l'équipe et l'API.
 *
 * Hors de `order.ts` parce que ce module importe zod : une valeur prise au
 * baril ramène zod dans le bundle initial de la boutique (cf. `shop-values.ts`).
 *
 * Le refus (409) tombe quand le TTC recomposé à la passation n'est pas celui
 * que le client a vu (`expectedTotalCentsSchema`). La réponse porte
 * `expectedTotalCents` et `totalCents` ; le front redemande son devis, compare
 * terme à terme, et montre l'écart avant de laisser confirmer (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, T3).
 */
export const ORDER_TOTAL_CHANGED = "orders.total_changed";
