import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { FIRST_SHIPMENT_RANK } from "../domain/value-objects/shipment-ref.value-object.js";
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
      // La commande elle-même (rang 1) : un reliquat porte son propre jour, et
      // `findFirst` sans ordre rendrait l'un ou l'autre (plan E7 reliquat, L3b).
      where: { orderId, rank: FIRST_SHIPMENT_RANK },
      select: { serviceDay: true },
    });
    return row?.serviceDay ?? null;
  }
}
