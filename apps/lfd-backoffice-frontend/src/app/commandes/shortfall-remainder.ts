import type { AdminOrderShortfall, OrderLineView, PackingAbandonedLine } from '@lfd/contracts';
import type { DepartedCell } from '@lfd/b2b-ui/order';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Le reste abandonné, ligne par ligne** (Hugo, 2026-10-25 : « dommage de
 * perdre visuellement le reliquat ») : sur la fiche commande, relu sur le
 * manque décidé — le dû d'origine moins ce qui est parti, qui est ce que le
 * colisage avait au bac au signal. Rien tant que rien n'est décidé.
 *
 * Le poste de colisage et la Supervision le reçoivent déjà calculé
 * (`PackingSheet.abandonedRemainder`).
 */
export function abandonedOfShortfall(
  shortfall: AdminOrderShortfall | null,
  names: ReadonlyMap<string, string>,
): readonly PackingAbandonedLine[] {
  if (shortfall?.decision == null) {
    return [];
  }
  return shortfall.lines
    .filter((line) => line.packed < line.due)
    .map((line) => ({
      sku: line.sku,
      productName: names.get(line.sku) ?? line.sku,
      // Au poids, des grammes : le dû moins le lot qui était au bac (P6).
      quantity: line.due - line.packed,
      saleUnit: line.saleUnit,
    }));
}

/** « Reste abandonné : 2 Croissant », « Reste abandonné : 250 g Saumon » — le mot de Hugo. */
export function abandonedSentence(line: PackingAbandonedLine): string {
  return `Reste abandonné : ${saleQuantityLabel(line.quantity, line.saleUnit)} ${line.productName}`;
}

/**
 * **La colonne « Parti »** de la composition (`documentation/commandes/reliquat/reliquat.md`, § 7), lue sur la décision du départ : par SKU, ce qui est parti, et le
 * reste quand une part est restée. Un article de la commande absent de
 * `departing` n'est pas parti. `null` — pas de colonne — sans décision, ou
 * quand le serveur ne sert pas encore ce qui part.
 */
export function departedCells(
  shortfall: AdminOrderShortfall | null,
  lines: readonly Pick<OrderLineView, 'sku' | 'quantity' | 'saleUnit'>[],
): ReadonlyMap<string, DepartedCell> | null {
  const departing = shortfall?.decision?.departing;
  if (departing === undefined) {
    return null;
  }
  const departed = new Map<string, number>();
  for (const line of departing) {
    departed.set(line.sku, (departed.get(line.sku) ?? 0) + line.quantity);
  }
  const ordered = new Map<string, Pick<OrderLineView, 'quantity' | 'saleUnit'>>();
  for (const line of lines) {
    const seen = ordered.get(line.sku);
    ordered.set(line.sku, {
      quantity: (seen?.quantity ?? 0) + line.quantity,
      saleUnit: seen?.saleUnit ?? line.saleUnit,
    });
  }
  const cells = new Map<string, DepartedCell>();
  for (const [sku, { quantity, saleUnit }] of ordered) {
    const gone = departed.get(sku) ?? 0;
    const left = quantity - gone;
    cells.set(sku, {
      label: saleQuantityLabel(gone, saleUnit),
      remainder: left > 0 ? `${saleQuantityLabel(left, saleUnit)} en reliquat` : null,
    });
  }
  return cells;
}
