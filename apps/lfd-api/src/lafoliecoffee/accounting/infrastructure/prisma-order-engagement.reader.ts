import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import {
  OrderEngagementReader,
  type OrderEngagementFacts,
} from "../domain/ports/order-engagement.reader.js";

/**
 * L'engagement comptable d'une commande, en trois lectures courtes. Par le
 * client ROUTÉ : appelé dans la transaction de l'annulation, sous le verrou
 * de sa ligne `orders`.
 *
 * Pas de jointure vers `orders` : la commande n'est connue que par son
 * identifiant opaque, comme partout dans la comptabilité.
 */
@Injectable()
export class PrismaOrderEngagementReader extends OrderEngagementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async factsOf(orderId: string): Promise<OrderEngagementFacts> {
    const invoiced = await this.prisma.invoiceOrder.findFirst({
      where: { orderId, invoiceType: COMMERCIAL_INVOICE },
      select: { invoice: { select: { number: true, issuedOn: true } } },
    });
    const row = await this.prisma.orderCollection.findUnique({
      where: { orderId },
      select: {
        state: true,
        line: {
          select: {
            batch: { select: { requestedCollectionDay: true } },
            statement: { select: { id: true, status: true } },
          },
        },
      },
    });
    return {
      invoice:
        invoiced === null
          ? null
          : { number: invoiced.invoice.number, issuedOn: dayOf(invoiced.invoice.issuedOn) },
      collection:
        row === null
          ? null
          : {
              state: row.state,
              collectionDay: nullableDayOf(row.line?.batch.requestedCollectionDay ?? null),
              statementId: row.line?.statement?.status === "active" ? row.line.statement.id : null,
            },
      rejectedBefore: await this.rejectedBefore(orderId),
    };
  }

  /** Relevé ACTIF qui la porte → sa ligne → un retour bancaire (C5.5). */
  private async rejectedBefore(orderId: string): Promise<boolean> {
    const hit = await this.prisma.billingStatementOrder.findFirst({
      where: {
        orderId,
        statement: { status: "active", line: { bankReturn: { isNot: null } } },
      },
      select: { orderId: true },
    });
    return hit !== null;
  }
}

/** Une colonne `@db.Date` : minuit UTC, le jour est la partie date. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nullableDayOf(date: Date | null): string | null {
  return date === null ? null : dayOf(date);
}
