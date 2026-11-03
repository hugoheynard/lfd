import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { BinDesk } from "../channels/delivery/index.js";
import {
  CounterPackingSheetReader,
  type CounterPackingSheetSource,
} from "../domain/ports/counter-packing-sheet.reader.js";
import { reservedOf } from "../domain/services/stock-reservations.js";
import { boardOrderOf, ORDER_SELECT } from "./prisma-packing-board.reader.js";
import { reservationsOn } from "./packing-stock-reservation.rows.js";

/** La première fiche, celle de la commande ; les suivantes sont des envois (L3b). */
const ORDER_RANK = 1;

/**
 * La fiche d'une commande, lue dans les tables du colisage sans verrou : une
 * feuille par clé primaire partielle, puis les réserves de ses seuls articles.
 * Même mapper que le poste (`boardOrderOf`) : un contenant dont le bac n'est
 * plus vivant n'y compte pas non plus.
 */
@Injectable()
export class PrismaCounterPackingSheetReader extends CounterPackingSheetReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly desk: BinDesk,
  ) {
    super();
  }

  async latestOf(orderId: string): Promise<CounterPackingSheetSource | null> {
    const row = await this.prisma.packingOrder.findFirst({
      where: { orderId, rank: ORDER_RANK, withdrawnAt: null },
      select: { ...ORDER_SELECT, serviceDay: true },
      orderBy: [{ serviceDay: "desc" }, { drawnAt: "desc" }],
    });
    if (row === null) {
      return null;
    }
    const skus = row.lines.map((line) => line.sku);
    const [liveBins, stocks, reservations] = await Promise.all([
      this.desk.liveBins(row.containers.flatMap((container) => container.binId ?? [])),
      this.prisma.packingStock.findMany({
        where: { serviceDay: row.serviceDay, sku: { in: skus } },
        select: { sku: true, received: true, returned: true, packed: true, sentToShop: true },
      }),
      reservationsOn(this.prisma, row.serviceDay),
    ]);
    return {
      order: boardOrderOf(row, liveBins),
      stocks: stocks.map((stock) => ({
        ...stock,
        reserved: reservedOf(reservations.get(stock.sku) ?? []),
      })),
    };
  }
}
