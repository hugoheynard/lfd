/**
 * **Ce qu'une révision de commande peut changer** — le résumé que le journal
 * garde (`order.revised`, plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M1). Des VALEURS écrites au journal : elles ne se renomment que par
 * migration.
 *
 * Dans un fichier `.values` sans dépendance, pour que le catalogue du journal
 * les lise sans embarquer le contrat des commandes.
 */
export const ORDER_REVISION_CHANGES = [
  "lines",
  "date",
  "method",
  "pickup_point",
  "delivery_address",
  "window",
  "contact",
  "signature",
  "note",
] as const;
export type OrderRevisionChange = (typeof ORDER_REVISION_CHANGES)[number];
