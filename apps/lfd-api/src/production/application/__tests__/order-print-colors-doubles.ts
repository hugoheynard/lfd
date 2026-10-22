import { OrderPrintColorsReader } from "../../channels/commerce/order-print-colors.reader.js";

/**
 * Le commerce doublé : une couleur par commande, ou aucune. Compte les
 * commandes demandées, pour vérifier qu'un papier relu de l'archive ne relit
 * pas les couleurs.
 */
export class FixedOrderPrintColors extends OrderPrintColorsReader {
  readonly asked: string[][] = [];

  constructor(private readonly colors: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    this.asked.push([...orderIds]);
    return Promise.resolve(
      new Map([...this.colors].filter(([orderId]) => orderIds.includes(orderId))),
    );
  }
}
