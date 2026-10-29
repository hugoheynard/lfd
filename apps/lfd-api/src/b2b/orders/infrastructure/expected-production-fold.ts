import type { ExpectedDayProduction } from "../../../production/channels/commerce/index.js";
import type { SaleSkuAliases } from "../../catalog/domain/sale-sku-aliases.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";

/** Une commande lue pour le prévisionnel : son jour, ses lignes. */
export interface ExpectedOrderRow {
  readonly requestedDeliveryDate: Date | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly productNameSnapshot: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }[];
}

/** Ce qu'un article pèse une journée, en cours de pli. */
interface ExpectedSum {
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: "piece" | "weight";
}

/**
 * **Le pli du prévisionnel, par jour puis par ARTICLE** — l'article étant la
 * référence canonique de la ligne (`SaleSkuAliases.canonical`), jamais sa
 * graphie ni sa référence produit
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 2 b). Le
 * jour de la bascule, une ligne `PAI-001` d'avant et une `PAI-001-1` d'après
 * font une seule ligne au fournil.
 */
export function foldExpectedByArticle(
  rows: readonly ExpectedOrderRow[],
  aliases: SaleSkuAliases,
): readonly ExpectedDayProduction[] {
  const byDay = new Map<string, Map<string, ExpectedSum>>();
  const orderCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.requestedDeliveryDate === null) {
      continue;
    }
    const day = row.requestedDeliveryDate.toISOString().slice(0, 10);
    orderCounts.set(day, (orderCounts.get(day) ?? 0) + 1);
    const items = byDay.get(day) ?? new Map<string, ExpectedSum>();
    for (const line of row.lines) {
      const sku = aliases.canonical(line.sku);
      const known = items.get(sku);
      items.set(sku, {
        productName: known?.productName ?? line.productNameSnapshot,
        // Une somme par article : un article n'a qu'une unité (figée à la
        // publication), ses grammes s'additionnent entre eux (P6).
        quantity: (known?.quantity ?? 0) + line.quantity,
        saleUnit: orderLineSaleUnitOf(line.sku, line.saleUnit),
      });
    }
    byDay.set(day, items);
  }
  return [...byDay.entries()].map(([day, items]) => ({
    day,
    items: [...items.entries()].map(([sku, item]) => ({ sku, ...item })),
    // Compté sur les LIGNES de commande lues, et non par une requête de plus :
    // une commande sans ligne ne pèse rien au fournil, et n'a rien à faire
    // dans un compte qu'on lit comme « combien de piles à répartir ».
    orderCount: orderCounts.get(day) ?? 0,
  }));
}
