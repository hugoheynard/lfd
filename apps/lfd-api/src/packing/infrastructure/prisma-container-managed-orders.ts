import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ContainerManagedOrders } from "../channels/delivery/index.js";

/**
 * « Cette commande se gère-t-elle au colisage ? » — une commande inscrite en
 * mode `listed`, quelle que soit sa journée. Implémente le port que le
 * colisage publie pour la livraison (K2b, §5.1, B1).
 */
@Injectable()
export class PrismaContainerManagedOrders extends ContainerManagedOrders {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isManaged(orderId: string): Promise<boolean> {
    const managed = await this.prisma.packingOrder.count({
      where: { orderId, containerMode: "listed" },
    });
    return managed > 0;
  }
}
