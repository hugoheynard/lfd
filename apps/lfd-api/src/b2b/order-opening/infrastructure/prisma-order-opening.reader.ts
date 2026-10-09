import { DEFAULT_ORDER_OPENING, type OrderOpeningView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderOpeningReader } from "../domain/ports/order-opening.reader.js";
import { ORDER_OPENING_KEY } from "./order-opening.key.js";

/**
 * Adaptateur Prisma de la lecture du réglage.
 *
 * **Ligne absente = ouverte aux deux**, sans semis : une base neuve ou remise à
 * zéro prend les commandes, comme la production d'avant le réglage.
 */
@Injectable()
export class PrismaOrderOpeningReader extends OrderOpeningReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<OrderOpeningView> {
    const row = await this.prisma.orderOpening.findUnique({
      where: { key: ORDER_OPENING_KEY },
      select: {
        ordersOpenToB2b: true,
        ordersOpenToB2c: true,
        updatedAt: true,
        updatedByName: true,
      },
    });
    if (row === null) {
      return DEFAULT_ORDER_OPENING;
    }
    return {
      ordersOpenToB2b: row.ordersOpenToB2b,
      ordersOpenToB2c: row.ordersOpenToB2c,
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne
      // l'invente pas.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}
