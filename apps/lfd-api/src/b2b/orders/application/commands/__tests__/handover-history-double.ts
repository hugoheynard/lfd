import { ShipmentHandoverReader } from "../../../../../handover/channels/commerce/index.js";

/**
 * Les commandes dont un envoi, quel qu'il soit, est déjà retiré — aucune par
 * défaut. Hérite du port, comme les autres doubles.
 */
export class FixedHandoverHistory extends ShipmentHandoverReader {
  constructor(private readonly handedOver: readonly string[] = []) {
    super();
  }

  anyHandedOver(orderId: string): Promise<boolean> {
    return Promise.resolve(this.handedOver.includes(orderId));
  }
}
