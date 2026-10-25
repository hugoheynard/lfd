import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderWithdrawalLedger } from "../domain/ports/order-withdrawal.ledger.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * `INSERT … ON CONFLICT (order_id) DO NOTHING` (`skipDuplicates`) : deux
 * retraits de la même commande n'en écrivent qu'un, et c'est la base qui
 * arbitre. Par le client routé : dans l'unité de travail du commerce.
 */
@Injectable()
export class PrismaOrderWithdrawalLedger extends OrderWithdrawalLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(
    day: ServiceDay,
    orderId: string,
    at: Date,
    afterInscription: boolean,
  ): Promise<void> {
    await this.prisma.orderWithdrawal.createMany({
      data: [{ orderId, serviceDay: day.value, withdrawnAt: at, afterInscription }],
      skipDuplicates: true,
    });
  }
}
