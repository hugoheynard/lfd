import { Injectable } from "@nestjs/common";

import { TransferOrdersReader } from "../channels/commerce/index.js";
import { type OrderTransferStatus, TransferStatusReader } from "../channels/handover/index.js";
import { CarriedOrderTransfers } from "../domain/ports/carried-order-transfers.reader.js";
import { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";

/**
 * **« Arrivée au site ? »** — l'implémentation, par la livraison, du port
 * qu'elle publie pour le comptoir du retrait (plan du transfert interne,
 * §6.1 ; lots T2, T3).
 *
 * Trois lectures, pour tout le lot :
 *
 * 1. le transfert qui porte chaque commande, et où il en est ;
 * 2. ses bacs non annulés, comptés (lot T3) — ce que le site doit recevoir ;
 * 3. 🔴 **les retraits d'un site servi par transfert qu'aucun transfert ne
 *    porte encore** (faille F4, lot T3) — le commerce le dit
 *    (`TransferOrdersReader`). Une telle commande, passée avant la clôture,
 *    se remettait sans refus : la marchandise n'est pourtant pas au site.
 *    Elle est `awaiting`, et le comptoir la refuse.
 */
@Injectable()
export class TransferArrivalStatus extends TransferStatusReader {
  constructor(
    private readonly carried: CarriedOrderTransfers,
    private readonly bins: TransferBinCounts,
    private readonly transferOrders: TransferOrdersReader,
  ) {
    super();
  }

  async statusOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderTransferStatus>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const carried = await this.carried.carriedAmong(orderIds);
    const loose = orderIds.filter((orderId) => !carried.has(orderId));
    const [counts, awaiting] = await Promise.all([
      this.bins.liveBinCounts([...new Set([...carried.values()].map((row) => row.transferId))]),
      loose.length === 0 ? [] : this.transferOrders.transferOrdersAmong(loose),
    ]);
    const statuses = new Map<string, OrderTransferStatus>();
    for (const [orderId, row] of carried) {
      statuses.set(orderId, { ...row, binCount: counts.get(row.transferId) ?? 0 });
    }
    for (const order of awaiting) {
      statuses.set(order.orderId, { state: "awaiting", siteLabel: order.siteLabel });
    }
    return statuses;
  }
}
