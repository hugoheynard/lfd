import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderDeliveryDays } from "../domain/ports/order-delivery-days.js";

/** `orders.received_on`, posée par une écriture conditionnée — la base arbitre. */
@Injectable()
export class PrismaOrderDeliveryDays extends OrderDeliveryDays {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordFirst(orderId: string, day: string): Promise<boolean> {
    // `@db.Date` : minuit UTC du jour, dont la date ISO EST le jour de Paris.
    //
    // `handedOverAt: { not: null }` (2026-10-24) : depuis que
    // `PrismaOrderRepository.markFulfilled` pose la date avec la remise, cet
    // abonné et celui de la remise écoutent le même fait sans ordre entre eux.
    // Passé AVANT la remise, il posait la date par une instruction de plus —
    // une ligne de plus dans `public.day_change` selon l'ordre de livraison
    // (`dev-scenario-stability` rouge en CI), et une date sans remise, que
    // B4 interdira (Q5). La remise la pose elle-même ; ici, il ne reste que
    // le rattrapage d'une commande déjà remise.
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, receivedOn: null, handedOverAt: { not: null } },
      data: { receivedOn: new Date(`${day}T00:00:00.000Z`) },
    });
    return count === 1;
  }
}
