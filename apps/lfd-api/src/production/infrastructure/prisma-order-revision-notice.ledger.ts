import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderRevisionNoticeLedger } from "../domain/ports/order-revision-notice.ledger.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * Les notes de révision, en ajout seul : une ligne par journée et par
 * révision. Par le client routé : dans l'unité de travail du commerce.
 */
@Injectable()
export class PrismaOrderRevisionNoticeLedger extends OrderRevisionNoticeLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(day: ServiceDay, orderId: string, revision: number, at: Date): Promise<void> {
    await this.prisma.orderRevisionNotice.create({
      data: { orderId, serviceDay: day.value, revision, notedAt: at },
    });
  }
}
