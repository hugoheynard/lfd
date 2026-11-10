import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  UnpaidLinkOrderReader,
  type UnpaidLinkOrder,
} from "../domain/ports/unpaid-link-order.reader.js";

/** `AAAA-MM-JJ` : la colonne est un `date` Postgres, lu à minuit UTC. */
const ISO_DAY_LENGTH = 10;

/**
 * Adaptateur Prisma du rappel de règlement.
 *
 * Aucun mur `company_id` : c'est une passe d'exploitation sur toutes les
 * commandes, déclenchée par un cron, et non une lecture au nom d'un client —
 * comme le balayage de clôture.
 *
 * « Réglée par lien » se lit à l'intention Stripe : `link` en crée une,
 * `account` et un total nul n'en ont pas (`PlaceOrderForCustomerHandler.settle`,
 * vérifié le 2026-09-26).
 */
@Injectable()
export class PrismaUnpaidLinkOrderReader extends UnpaidLinkOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async awaitingSettlement(): Promise<readonly UnpaidLinkOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.placed,
        paymentStatus: { in: [PaymentStatus.pending, PaymentStatus.failed] },
        placedByStaffId: { not: null },
        stripePaymentIntentId: { not: null },
      },
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        requestedDeliveryDate: true,
        createdAt: true,
        company: { select: { raisonSociale: true, enseigne: true } },
      },
    });
    return rows.map((row) => ({
      orderId: row.id,
      orderNumber: row.orderNumber,
      // La règle de `Company.displayName()` : l'enseigne, à défaut la raison sociale.
      companyName:
        row.company === null
          ? null
          : row.company.enseigne === ""
            ? row.company.raisonSociale
            : row.company.enseigne,
      serviceDay:
        row.requestedDeliveryDate === null
          ? null
          : row.requestedDeliveryDate.toISOString().slice(0, ISO_DAY_LENGTH),
      placedAt: row.createdAt,
    }));
  }
}
