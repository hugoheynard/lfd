import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SettledOrderWriter } from "../domain/ports/settled-order.writer.js";

/**
 * Le solde d'une commande en partie retirée. `handed_over_at`, `received_on`
 * restent ceux de la première remise (choix 8, CHECK B4) : seul le statut
 * change, et seulement depuis `partially_handed_over` — c'est la base qui
 * arbitre un rejeu.
 */
@Injectable()
export class PrismaSettledOrderWriter extends SettledOrderWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async settle(orderId: string): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.partially_handed_over },
      data: { status: OrderStatus.fulfilled },
    });
    return count === 1;
  }
}
