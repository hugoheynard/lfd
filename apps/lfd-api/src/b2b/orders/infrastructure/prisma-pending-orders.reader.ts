import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PendingCommerceOrdersReader } from "../../../production/channels/commerce/index.js";
import type { ServiceDay } from "../../../production/channels/commerce/index.js";

/**
 * Ce que le commerce n'a pas encore basculé sur une journée donnée.
 *
 * `placed` et rien d'autre : c'est exactement ce que l'abonné aurait dû
 * changer. Une commande annulée ou déjà `ready` n'est pas en retard — elle a
 * suivi un autre chemin, et la compter ferait crier une divergence qui n'existe
 * pas.
 *
 * La condition est la MÊME que celle du `where` d'`absorbIntoPlan`, et ce n'est
 * pas une coïncidence : ce compteur mesure précisément ce que cette écriture
 * aurait pris. Si les deux divergeaient, le compteur mentirait dans le sens
 * rassurant.
 */
@Injectable()
export class PrismaPendingOrdersReader extends PendingCommerceOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pendingFor(day: ServiceDay, closedAt: Date): Promise<number> {
    return this.prisma.order.count({
      where: {
        requestedDeliveryDate: new Date(`${day.value}T00:00:00.000Z`),
        status: "placed",
        // Bornée à ce que la clôture a VU. Une commande arrivée après est en
        // retard, pas perdue — la compter ferait crier une divergence qui
        // n'existe pas, et l'alerte deviendrait du bruit.
        createdAt: { lte: closedAt },
      },
    });
  }
}
