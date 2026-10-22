import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { PackingStockSnapshot } from "../domain/entities/packing-stock.js";
import { PackingDayStocksReader } from "../domain/ports/packing-day-stocks.reader.js";
import { reservationsOn } from "./packing-stock-reservation.rows.js";

/** Les réserves d'une journée et leurs réservations, sans verrou (R4b). */
@Injectable()
export class PrismaPackingDayStocksReader extends PackingDayStocksReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async on(serviceDay: string): Promise<readonly PackingStockSnapshot[]> {
    const [rows, reservations] = await Promise.all([
      this.prisma.packingStock.findMany({
        where: { serviceDay },
        select: { sku: true, received: true, returned: true, packed: true },
        orderBy: { sku: "asc" },
      }),
      reservationsOn(this.prisma, serviceDay),
    ]);
    return rows.map((row) => ({
      serviceDay,
      ...row,
      reservations: reservations.get(row.sku) ?? [],
    }));
  }
}
