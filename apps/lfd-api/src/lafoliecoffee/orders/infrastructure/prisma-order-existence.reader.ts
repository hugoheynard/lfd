import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderExistenceReader } from "../domain/ports/order-existence.reader.js";

/** L'existence d'une commande, par sa clé primaire — l'identifiant seul est lu. */
@Injectable()
export class PrismaOrderExistenceReader extends OrderExistenceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(orderId: string): Promise<boolean> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    return row !== null;
  }
}
