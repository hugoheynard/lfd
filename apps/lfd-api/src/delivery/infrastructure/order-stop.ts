/**
 * **Les arrêts de commande seulement** (plan du transfert interne, §5, lot
 * T1). `order_id` est nullable depuis que `delivery_round_stop` porte aussi
 * les arrêts de transfert ; le CHECK `delivery_round_stop_kind_check` garantit
 * qu'un arrêt `order` en porte un. Les lecteurs de la porte, des décisions,
 * des ratés, du ramené, de l'historique et des positions les IGNORENT : le
 * filtre `ORDER_STOP` dans le `where`, puis `orderStopsOnly` pour que le type
 * le dise aussi.
 */
export const ORDER_STOP = { kind: "order" } as const;

/** Les lignes qui portent une commande, typées comme telles. */
export function orderStopsOnly<T extends { readonly orderId: string | null }>(
  rows: readonly T[],
): (T & { readonly orderId: string })[] {
  return rows.flatMap((row) => {
    const { orderId } = row;
    return orderId === null ? [] : [{ ...row, orderId }];
  });
}
