import { Injectable } from "@nestjs/common";

import { OrderCutoffWaiverSpentError } from "../../orders/domain/errors/order-errors.js";
import { OrderCutoffWaiverGate } from "../../orders/domain/ports/order-cutoff-waiver.gate.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

@Injectable()
export class PrismaOrderCutoffWaiverGate extends OrderCutoffWaiverGate {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Le `where` porte `usedByOrderId: null` : de deux passations qui ont lu la
   * même autorisation, une seule l'écrit. L'autre ne touche aucune ligne, et
   * c'est une course PERDUE : sa commande passerait tard sans décision. Le
   * compte le dit, et le refus annule la transaction de la commande.
   *
   * `updateMany` plutôt qu'`update` : le compte nomme le cas, là où `update`
   * lèverait une erreur Prisma qui ne dit pas laquelle des deux passations a
   * perdu.
   */
  async consume(waiverId: string, orderId: string, at: Date): Promise<void> {
    const { count } = await this.prisma.orderCutoffWaiver.updateMany({
      where: { id: waiverId, usedByOrderId: null },
      data: { usedByOrderId: orderId, usedAt: at },
    });
    if (count === 0) {
      throw new OrderCutoffWaiverSpentError(waiverId);
    }
  }
}
