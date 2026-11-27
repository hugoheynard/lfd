import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type WithdrawalAfterInscription,
  WithdrawalsAfterInscriptionReader,
} from "../domain/ports/withdrawals-after-inscription.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Les retraits après inscription d'une journée, par l'index `service_day`. */
@Injectable()
export class PrismaWithdrawalsAfterInscriptionReader extends WithdrawalsAfterInscriptionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async afterInscriptionOn(day: ServiceDay): Promise<readonly WithdrawalAfterInscription[]> {
    const rows = await this.prisma.orderWithdrawal.findMany({
      where: { serviceDay: day.value, afterInscription: true },
      select: { orderId: true, withdrawnAt: true },
      orderBy: { orderId: "asc" },
    });
    return rows.map((row) => ({ orderId: row.orderId, at: row.withdrawnAt }));
  }
}
