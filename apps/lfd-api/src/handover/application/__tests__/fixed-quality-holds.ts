import { QualityHoldsReader } from "../../../production/channels/handover/index.js";

/**
 * La retenue qualité, doublée : les commandes nommées sont retenues, quel que
 * soit le jour. Elle note chaque question posée — c'est ce qui prouve qu'une
 * file de N commandes pose UNE question, pas N.
 */
export class FixedQualityHolds extends QualityHoldsReader {
  readonly asked: { readonly serviceDay: string; readonly orderIds: readonly string[] }[] = [];

  constructor(private readonly held: readonly string[] = []) {
    super();
  }

  heldOrders(serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push({ serviceDay, orderIds });
    return Promise.resolve(new Set(orderIds.filter((orderId) => this.held.includes(orderId))));
  }
}
