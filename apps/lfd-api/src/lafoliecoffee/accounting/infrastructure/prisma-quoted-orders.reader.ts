import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  QuotedOrdersReader,
  type QuotedOrder,
} from "../../orders/domain/ports/quoted-orders.reader.js";
import { AWAITING_QUOTE_STATE } from "./prisma-period-quote.repository.js";

/**
 * L'implémentation, par la comptabilité, du port que la commande déclare :
 * le devis de période en attente qui porte une commande, lu sur
 * `period_quote_order.quote_state` (tenu par la clé étrangère composite).
 * L'index unique partiel `period_quote_order_awaiting_once` garantit qu'il
 * n'y en a qu'un. Client ROUTÉ : lu dans la transaction de l'appelant, sous
 * son verrou.
 */
@Injectable()
export class PrismaQuotedOrdersReader extends QuotedOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async awaitingQuoteOf(orderId: string): Promise<QuotedOrder | null> {
    const row = await this.prisma.periodQuoteOrder.findFirst({
      where: { orderId, quoteState: AWAITING_QUOTE_STATE },
      select: { quoteId: true, quote: { select: { number: true } } },
    });
    return row === null ? null : { quoteId: row.quoteId, quoteNumber: row.quote.number };
  }
}
