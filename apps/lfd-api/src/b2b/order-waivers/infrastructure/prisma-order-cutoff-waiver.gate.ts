import { Injectable } from "@nestjs/common";

import { OrderCutoffWaiverGate } from "../../orders/domain/ports/order-cutoff-waiver.gate.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

@Injectable()
export class PrismaOrderCutoffWaiverGate extends OrderCutoffWaiverGate {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async openFor(companyId: string, fulfillmentDate: string): Promise<{ id: string } | null> {
    return this.prisma.orderCutoffWaiver.findFirst({
      where: {
        companyId,
        fulfillmentDate: new Date(`${fulfillmentDate}T00:00:00.000Z`),
        usedByOrderId: null,
      },
      select: { id: true },
    });
  }

  /**
   * Le `where` porte `usedByOrderId: null` : deux commandes qui tenteraient de
   * consommer la même autorisation au même instant n'en verraient qu'une
   * aboutir. Le second `updateMany` ne touche aucune ligne, et c'est le bon
   * comportement — l'autorisation n'a servi qu'une fois.
   *
   * `updateMany` et non `update` pour cette raison précise : `update` lèverait
   * sur zéro ligne, et transformerait une course perdue en erreur de commande.
   */
  async consume(waiverId: string, orderId: string, at: Date): Promise<void> {
    await this.prisma.orderCutoffWaiver.updateMany({
      where: { id: waiverId, usedByOrderId: null },
      data: { usedByOrderId: orderId, usedAt: at },
    });
  }
}
