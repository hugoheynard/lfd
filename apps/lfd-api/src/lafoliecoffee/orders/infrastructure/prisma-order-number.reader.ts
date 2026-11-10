import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderNumberReader } from "../domain/ports/order-number.reader.js";

/**
 * Les numéros de commandes, en Postgres. Pas de mur `company_id` : l'appelant
 * cite des commandes tirées du livre de SON titulaire, et ne reçoit que leur
 * numéro.
 */
@Injectable()
export class PrismaOrderNumberReader extends OrderNumberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async numbersOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { id: true, orderNumber: true },
    });
    return new Map(rows.map((row) => [row.id, row.orderNumber]));
  }
}
