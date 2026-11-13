import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CardInvoiceScopeReader } from "../domain/ports/card-invoice-scope.reader.js";
import type { CardInvoiceScope } from "../domain/services/card-invoicing.js";

/**
 * Le périmètre de la facture carte, sur la ligne `orders` seule (clé
 * primaire, cinq colonnes). Pas de mur tenant : l'appelant est un abonné
 * durable, la clé est l'id de la commande.
 */
@Injectable()
export class PrismaCardInvoiceScopeReader extends CardInvoiceScopeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async scopeOf(orderId: string): Promise<CardInvoiceScope | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        companyId: true,
        clientele: true,
        status: true,
        totalCents: true,
        paymentStatus: true,
      },
    });
    if (order === null) {
      return null;
    }
    return {
      companyId: order.companyId,
      clientele: order.clientele,
      cancelled: order.status === "cancelled",
      totalCents: order.totalCents,
      paymentStatus: order.paymentStatus,
    };
  }
}
