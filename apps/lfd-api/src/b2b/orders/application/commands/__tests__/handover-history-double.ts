import { ShipmentHandoverReader } from "../../../../../handover/channels/commerce/index.js";

/**
 * Les commandes dont un envoi est déjà retiré — aucune par défaut. `handedOver`
 * porte le rang 1, `remainders` un reste (rang 2) seul. Hérite du port, comme
 * les autres doubles.
 */
export class FixedHandoverHistory extends ShipmentHandoverReader {
  constructor(
    private readonly handedOver: readonly string[] = [],
    private readonly remainders: readonly string[] = [],
  ) {
    super();
  }

  handedOverRanks(orderId: string): Promise<readonly number[]> {
    const ranks = [
      ...(this.handedOver.includes(orderId) ? [1] : []),
      ...(this.remainders.includes(orderId) ? [2] : []),
    ];
    return Promise.resolve(ranks);
  }
}
