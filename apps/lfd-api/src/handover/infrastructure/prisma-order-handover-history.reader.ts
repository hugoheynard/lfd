import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../channels/commerce/order-handover-history.reader.js";
import { handoverViaOf } from "./handover-via.mapper.js";

/**
 * **Ce que le retrait dit au dossier de facturation** (`order_handover`,
 * `order_handover_proof`) : deux lectures par lot, quel que soit le nombre de
 * bons. Un adaptateur à part du dépôt qui atteste (ISP).
 */
@Injectable()
export class PrismaOrderHandoverHistoryReader extends OrderHandoverHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofOrders(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const ids = [...orderIds];
    const [handovers, proofs] = await Promise.all([
      this.prisma.orderHandover.findMany({
        where: { orderId: { in: ids } },
        select: { orderId: true, handedOverAt: true, handedOverVia: true },
      }),
      this.prisma.orderHandoverProof.findMany({
        where: { orderId: { in: ids } },
        select: { orderId: true },
      }),
    ]);
    const atDoor = new Set(proofs.map((proof) => proof.orderId));
    return new Map(
      handovers.map((row) => [
        row.orderId,
        {
          orderId: row.orderId,
          handedOverAt: row.handedOverAt,
          via: handoverViaOf(row.handedOverVia),
          atDoor: atDoor.has(row.orderId),
        },
      ]),
    );
  }
}
