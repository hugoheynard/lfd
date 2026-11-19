import type { OrderSaleUnit } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/** Une ligne comparée : un article, sa quantité, et l'unité dans laquelle elle se lit. */
export interface DriftLine {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
}

/**
 * **L'écart entre un modèle et la demande qu'on en a tirée**, en une phrase
 * du comptoir : « +2 Croissant, −1 Tradition, 1 article ajouté, 1 retiré »
 * (plan `plan-modeles-de-reassort.md`, § 4). Les quantités changées sont
 * nommées, dans l'ordre de la demande puis du modèle ; les articles ajoutés ou
 * retirés sont comptés. Au poids, l'écart se dit en grammes ou en kilos
 * (`saleQuantityLabel`) : « +250 g Saumon », jamais « +250 ».
 *
 * `null` : la demande dit exactement le modèle, il n'y a rien à mettre à jour.
 */
export function templateDrift(
  template: readonly DriftLine[],
  current: readonly DriftLine[],
  labelOf: (sku: string) => string,
): string | null {
  const before = new Map(template.map((line) => [line.sku, line] as const));
  const after = new Map(current.map((line) => [line.sku, line] as const));
  const changed = current.flatMap((line) => {
    const previous = before.get(line.sku);
    if (previous === undefined || previous.quantity === line.quantity) {
      return [];
    }
    const delta = line.quantity - previous.quantity;
    const sign = delta > 0 ? '+' : '−';
    return [`${sign}${saleQuantityLabel(Math.abs(delta), line.saleUnit)} ${labelOf(line.sku)}`];
  });
  const added = current.filter((line) => !before.has(line.sku)).length;
  const removed = template.filter((line) => !after.has(line.sku)).length;
  const counts = countsPhrase(added, removed);
  const parts = [...changed, ...counts];
  return parts.length === 0 ? null : parts.join(', ');
}

/** « 1 article ajouté, 2 retirés » — le mot « article » une fois, sur le premier compte. */
function countsPhrase(added: number, removed: number): string[] {
  const parts: string[] = [];
  if (added > 0) {
    parts.push(
      `${String(added)} ${plural(added, 'article', 'articles')} ${plural(added, 'ajouté', 'ajoutés')}`,
    );
  }
  if (removed > 0) {
    const noun = parts.length === 0 ? `${plural(removed, 'article', 'articles')} ` : '';
    parts.push(`${String(removed)} ${noun}${plural(removed, 'retiré', 'retirés')}`);
  }
  return parts;
}

function plural(count: number, one: string, many: string): string {
  return count > 1 ? many : one;
}
