import { Injectable } from "@nestjs/common";

import { QualityHoldsReader } from "../../channels/handover/quality-holds.reader.js";
import { QualityHeldOrdersReader } from "../../channels/packing/quality-held-orders.reader.js";

/**
 * L'implémentation du port publié `QualityHeldOrdersReader` (K3a) : la même
 * réponse que celle servie au retrait, par le même adaptateur
 * (`PrismaQualityHoldsReader`). Deux canaux, une seule règle — `heldOrderIds`.
 */
@Injectable()
export class ChannelQualityHeldOrdersReader extends QualityHeldOrdersReader {
  constructor(private readonly holds: QualityHoldsReader) {
    super();
  }

  heldOrders(serviceDay: string, orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.holds.heldOrders(serviceDay, orderIds);
  }
}
