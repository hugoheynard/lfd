import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PendingCommerceOrdersReader } from "../../../production/channels/commerce/index.js";
import type { ServiceDay } from "../../../production/channels/commerce/index.js";

/**
 * Ce que le commerce n'a pas encore basculé — **les trois retards possibles**.
 *
 * Un par fait que le fournil annonce : la clôture, le colisage, la remise. Les
 * trois passent par le même bus en processus, donc les trois peuvent se perdre ;
 * seul le premier se voyait avant le 2026-09-08.
 *
 * ## La journée
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

  /**
   * **En arrière du colisage** : le bac est fait, la commande n'a pas avancé.
   *
   * Les statuts attendus sont `ready` et tout ce qui vient après — une commande
   * déjà remise n'est pas en retard, elle est en avance. On compte donc ce qui
   * est resté **avant**, et l'énuméré est lu ici parce que c'est le commerce qui
   * sait ce que ses mots veulent dire.
   *
   * Une liste vide ne pose aucune requête : `in: []` est une question dont on
   * connaît la réponse, et c'est le cas normal d'une journée sans colisage.
   */
  async behindOnPacking(references: readonly string[]): Promise<number> {
    return this.countAmong(references, [OrderStatus.placed, OrderStatus.confirmed]);
  }

  /**
   * **En arrière de la remise** : le fournil a attesté, la commande n'est pas
   * close. Tout ce qui n'est pas `fulfilled` est en retard — y compris
   * `cancelled`, et c'est voulu : une commande annulée qu'on a pourtant remise
   * est une divergence qu'on veut voir, pas un cas à taire.
   */
  async behindOnHandover(references: readonly string[]): Promise<number> {
    return this.countAmong(references, [
      OrderStatus.placed,
      OrderStatus.confirmed,
      OrderStatus.in_production,
      OrderStatus.ready,
      OrderStatus.cancelled,
      OrderStatus.draft,
    ]);
  }

  /** Le comptage commun aux deux : mêmes références, statuts différents. */
  private async countAmong(
    references: readonly string[],
    statuses: readonly OrderStatus[],
  ): Promise<number> {
    if (references.length === 0) {
      return 0;
    }
    return this.prisma.order.count({
      where: { orderNumber: { in: [...references] }, status: { in: [...statuses] } },
    });
  }
}
