import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  UnconfirmedDeliveriesReader,
  type UnconfirmedDelivery,
} from "../domain/ports/unconfirmed-deliveries.reader.js";
import { accountOrderWhere } from "./billable-order-criterion.js";

/** `AAAA-MM-JJ`. */
const DAY_LENGTH = 10;

/** `@db.Date` : minuit UTC du jour, dont la date ISO EST le jour de Paris. */
function utcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Les bons à constater : l'assiette sans sa fenêtre (`accountOrderWhere`),
 * `received_on` nul, jour demandé passé. Surface staff : aucune société
 * n'est filtrée, c'est la comptabilité qui lit.
 */
@Injectable()
export class PrismaUnconfirmedDeliveriesReader extends UnconfirmedDeliveriesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async servedBefore(day: string): Promise<readonly UnconfirmedDelivery[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...accountOrderWhere(),
        receivedOn: null,
        requestedDeliveryDate: { lt: utcMidnight(day) },
      },
      orderBy: [{ requestedDeliveryDate: "asc" }, { orderNumber: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        companyId: true,
        requestedDeliveryDate: true,
        fulfillmentMethod: true,
        totalCents: true,
        createdAt: true,
        billedCompanyId: true,
        company: { select: { raisonSociale: true } },
      },
    });
    return rows.flatMap((row) =>
      row.companyId === null || row.requestedDeliveryDate === null
        ? []
        : [
            {
              orderId: row.id,
              orderNumber: row.orderNumber,
              companyId: row.companyId,
              companyName: row.company?.raisonSociale ?? "",
              serviceDay: row.requestedDeliveryDate.toISOString().slice(0, DAY_LENGTH),
              fulfillmentMethod: row.fulfillmentMethod === "pickup" ? "pickup" : "delivery",
              totalCents: row.totalCents,
              placedAt: row.createdAt,
              billedCompanyId: row.billedCompanyId,
            },
          ],
    );
  }
}
