import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CustomerCancellationSubjectReader,
  type CustomerCancellationSubject,
} from "../domain/ports/customer-cancellation-subject.reader.js";
import { fulfillmentOf } from "./order-fulfillment.parse.js";

/**
 * Adaptateur de la vue « annulation par le client » : la commande, son
 * créneau figé, et la fiche de qui l'a passée. Lecture par id, sans mur : le
 * mur est la décision du handler (C6.2), qui la lit d'abord.
 */
@Injectable()
export class PrismaCustomerCancellationSubjectReader extends CustomerCancellationSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(orderId: string): Promise<CustomerCancellationSubject | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        companyId: true,
        placedByUserId: true,
        requestedDeliveryDate: true,
        fulfillment: true,
        createdAt: true,
        placedBy: { select: { auth0Sub: true, status: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      orderId: row.id,
      companyId: row.companyId,
      placedByUserId: row.placedByUserId,
      // `@db.Date` lu à minuit UTC : on garde le jour tel quel.
      serviceDay:
        row.requestedDeliveryDate === null
          ? null
          : row.requestedDeliveryDate.toISOString().slice(0, 10),
      windowStart: fulfillmentOf(row.fulfillment).window.value?.start ?? null,
      placedAt: row.createdAt,
      buyer: {
        hasAccount: row.placedBy.auth0Sub !== null,
        active: row.placedBy.status !== "disabled",
      },
    };
  }
}
