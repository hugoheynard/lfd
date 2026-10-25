import type { AdminOrderShortfall, PackingAbandonedLine } from '@lfd/contracts';

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
      quantity: line.due - line.packed,
    }));
}

/** « Reste abandonné : 2 Croissant » — le mot de Hugo. */
export function abandonedSentence(line: PackingAbandonedLine): string {
  return `Reste abandonné : ${String(line.quantity)} ${line.productName}`;
}
