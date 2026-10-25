import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  OrderPackingStateReader,
  type OrderPackingState,
} from "../channels/commerce/order-packing-state.reader.js";

/**
 * L'état au colisage, lu dans `packing_order` (plan A1, lot A1.3). Les
 * feuilles sont lues par jour croissant : la dernière journée l'emporte.
 * `packed_at` et `withdrawn_at` ne coexistent pas — le retrait refuse une
 * feuille fermée, et une feuille retirée ne se ferme plus.
 */
@Injectable()
export class PrismaOrderPackingStateReader extends OrderPackingStateReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async packedAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderPackingState>> {
    const states = new Map<string, OrderPackingState>();
    if (orderIds.length === 0) {
      return states;
    }
    const rows = await this.prisma.packingOrder.findMany({
      where: { orderId: { in: [...orderIds] } },
      select: { orderId: true, packedAt: true, withdrawnAt: true },
      orderBy: { serviceDay: "asc" },
    });
    for (const row of rows) {
      const state = stateOf(row.packedAt, row.withdrawnAt);
      if (state === null) {
        states.delete(row.orderId);
      } else {
        states.set(row.orderId, state);
      }
    }
    return states;
  }
}

function stateOf(packedAt: Date | null, withdrawnAt: Date | null): OrderPackingState | null {
  if (withdrawnAt !== null) {
    return "withdrawn";
  }
  return packedAt === null ? null : "packed";
}
