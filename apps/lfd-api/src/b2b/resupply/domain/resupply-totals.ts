/** Une ligne à cumuler : ce que portent les lignes d'un réassort. */
export interface ResupplyQuantity {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
}

/**
 * **Le cumul par article** des réassorts d'une journée : ce que le fournil a
 * à produire, tous points confondus. L'ordre est celui de la première
 * demande ; le libellé, celui de la première ligne qui l'a figé.
 */
export function resupplyTotals(
  lineGroups: readonly (readonly ResupplyQuantity[])[],
): readonly ResupplyQuantity[] {
  const totals = new Map<string, ResupplyQuantity>();
  for (const line of lineGroups.flat()) {
    const known = totals.get(line.sku);
    totals.set(line.sku, {
      sku: line.sku,
      label: known?.label ?? line.label,
      quantity: (known?.quantity ?? 0) + line.quantity,
    });
  }
  return [...totals.values()];
}
