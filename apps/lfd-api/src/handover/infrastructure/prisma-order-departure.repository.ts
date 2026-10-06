import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderDepartureRepository } from "../domain/ports/order-departure.repository.js";

/**
 * Les départs annoncés (`production.order_departure`, rangée avec
 * `order_handover` : le retrait n'a pas de schéma à lui).
 *
 * **Monotone par instant, pas par ordre d'arrivée** (`plan-depart-durable.md`,
 * §5, B1, 2026-10-06). Départ et retour arrivent par la boîte d'envoi, qui
 * peut livrer l'un des heures après l'autre : chaque écriture est donc gardée
 * DANS le `where` par l'instant qu'elle porte, et un fait plus ancien que
 * l'état ne fait rien. Un second départ, plus récent que le retour (un autre
 * passage), réécrit l'instant et efface le retour.
 */
@Injectable()
export class PrismaOrderDepartureRepository extends OrderDepartureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Deux écritures dans une transaction : la ligne naît si elle manque (une
   * ligne déjà là est laissée), puis elle avance seulement si `departed_at`
   * est nul ou `<= at` ET `returned_at` nul ou `< at`. Un départ rejoué APRÈS un retour
   * plus récent que lui ne remet donc pas la commande « partie ».
   */
  async recordDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    if (orderIds.length === 0) {
      return;
    }
    const ids = [...orderIds];
    await this.prisma.$transaction([
      this.prisma.orderDeparture.createMany({
        data: ids.map((orderId) => ({ orderId, departedAt: at })),
        skipDuplicates: true,
      }),
      this.prisma.orderDeparture.updateMany({
        where: {
          orderId: { in: ids },
          AND: [
            { OR: [{ departedAt: null }, { departedAt: { lte: at } }] },
            { OR: [{ returnedAt: null }, { returnedAt: { lt: at } }] },
          ],
        },
        data: { departedAt: at, returnedAt: null },
      }),
    ]);
  }

  /**
   * Même forme que le départ : la ligne naît si elle manque — sans départ
   * connu, un retour livré AVANT son départ (B1) —, puis le retour avance
   * seulement si `departed_at` est nul ou `<= at` ET `returned_at` nul ou
   * `< at`. Une annonce tardive ne ramène pas une commande déjà repartie.
   */
  async recordReturned(orderIds: readonly string[], at: Date): Promise<void> {
    if (orderIds.length === 0) {
      return;
    }
    const ids = [...orderIds];
    await this.prisma.$transaction([
      this.prisma.orderDeparture.createMany({
        data: ids.map((orderId) => ({ orderId, departedAt: null, returnedAt: at })),
        skipDuplicates: true,
      }),
      this.prisma.orderDeparture.updateMany({
        where: {
          orderId: { in: ids },
          AND: [
            { OR: [{ departedAt: null }, { departedAt: { lte: at } }] },
            { OR: [{ returnedAt: null }, { returnedAt: { lt: at } }] },
          ],
        },
        data: { returnedAt: at },
      }),
    ]);
  }
}
