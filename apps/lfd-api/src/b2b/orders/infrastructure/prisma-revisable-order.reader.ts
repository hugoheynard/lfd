import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { RevisableOrder } from "../domain/entities/order-revision.js";
import { RevisableOrderReader } from "../domain/ports/revisable-order.reader.js";
import { REVISABLE_ORDER_SELECT, toRevisableOrder } from "./revisable-order.row.js";

/** La commande telle qu'on la modifie, lue sans verrou. */
@Injectable()
export class PrismaRevisableOrderReader extends RevisableOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(orderId: string): Promise<RevisableOrder | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: REVISABLE_ORDER_SELECT,
    });
    return row === null ? null : toRevisableOrder(row);
  }
}
