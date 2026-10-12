import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderInscriptionReader } from "../channels/commerce/order-inscription.reader.js";

/**
 * Lit `production_order` par l'identifiant opaque de la commande. Une commande
 * n'a qu'un jour de service : la première ligne trouvée dit le jour.
 */
@Injectable()
export class PrismaOrderInscriptionReader extends OrderInscriptionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async inscribedDayOf(orderId: string): Promise<string | null> {
    const row = await this.prisma.productionOrder.findFirst({
      where: { orderId },
      select: { serviceDay: true },
    });
    return row?.serviceDay ?? null;
  }
}
