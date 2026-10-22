import { TransferOrderColorsReader } from "../../channels/commerce/index.js";

/** Le commerce doublé : une couleur par commande, ou aucune ; compte ses lectures. */
export class FixedTransferOrderColors extends TransferOrderColorsReader {
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
