import type { SaleUnit } from "@lfd/money";

import type {
  ProducedItemSnapshot,
  ProductionLineSnapshot,
} from "../entities/production-day.snapshot.js";

/**
 * **Le marqueur « sur mesure » sur les papiers du fournil** (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M3).
 *
 * Un MOT et jamais un pictogramme : un pictogramme sur papier noir et blanc ne
 * se lit pas sans légende. Pas d'astérisque non plus — le bon de livraison et
 * la confirmation de commande l'emploient déjà pour autre chose.
 */
export const MADE_TO_ORDER_MENTION = "SUR MESURE";

/** La ligne porte-t-elle le marqueur ? `null` et l'absence ne disent rien. */
export function isMadeToOrder(line: Pick<ProductionLineSnapshot, "madeToOrder">): boolean {
  return line.madeToOrder === true;
}

/** Une ligne du compte à produire, telle que le papier l'imprime. */
export interface CountPaperRow {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  readonly madeToOrder: boolean;
}

/** Ce que les lignes de commande disent d'un SKU : de quoi isoler la part sur mesure. */
interface OrderedLines {
  readonly lines: readonly ProductionLineSnapshot[];
}

/**
 * **Les lignes du compte à produire, la part sur mesure À PART** (Q2,
 * décidée par défaut le 2026-10-30 : une ligne séparée — c'est souvent une
 * recette différente).
 *
 * Le compte arrêté reste UN total par SKU : c'est lui que les fournées
 * cochent, et il est rangé par SKU en base. La séparation se fait donc ici,
 * au papier, depuis les lignes de commande figées — jamais depuis le
 * catalogue. Le total de l'article est inchangé : la part sur mesure en est
 * retirée et imprimée sur sa propre ligne, le reste (commandes non marquées
 * et réassorts, qui ne portent pas le marqueur) garde la sienne.
 *
 * Une part sur mesure qui dépasserait le compte — un compte ne baisse jamais,
 * mais une commande peut avoir été retirée — est bornée au compte : le
 * papier ne fabrique pas de pièces.
 */
export function countPaperRowsOf(
  counts: readonly ProducedItemSnapshot[],
  orders: readonly OrderedLines[],
): readonly CountPaperRow[] {
  const madeToOrder = madeToOrderQuantities(orders);
  return counts.flatMap((item) => {
    const marked = Math.min(madeToOrder.get(item.sku) ?? 0, item.quantity);
    const row = {
      sku: item.sku,
      productName: item.productName,
      saleUnit: item.saleUnit,
    };
    const rest = item.quantity - marked;
    return [
      ...(rest > 0 || marked === 0 ? [{ ...row, quantity: rest, madeToOrder: false }] : []),
      ...(marked > 0 ? [{ ...row, quantity: marked, madeToOrder: true }] : []),
    ];
  });
}

/** La quantité sur mesure de chaque SKU, toutes commandes confondues. */
function madeToOrderQuantities(orders: readonly OrderedLines[]): ReadonlyMap<string, number> {
  const bySku = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      if (isMadeToOrder(line)) {
        bySku.set(line.sku, (bySku.get(line.sku) ?? 0) + line.quantity);
      }
    }
  }
  return bySku;
}
