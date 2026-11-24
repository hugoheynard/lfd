import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PeriodQuoteSnapshot } from "../domain/entities/period-quote.js";
import { PeriodQuoteReader } from "../domain/ports/period-quote.reader.js";
import { PERIOD_QUOTE_SELECT, periodQuoteSnapshotOf } from "./period-quote-row.js";

/** Un devis de période et ses commandes (`period_quote`, `period_quote_order`). */
@Injectable()
export class PrismaPeriodQuoteReader extends PeriodQuoteReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byId(quoteId: string): Promise<PeriodQuoteSnapshot | null> {
    const row = await this.prisma.periodQuote.findUnique({
      where: { id: quoteId },
      select: PERIOD_QUOTE_SELECT,
    });
    return row === null ? null : periodQuoteSnapshotOf(row);
  }
}
