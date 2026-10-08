import type { CardInvoiceSignalsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CardInvoiceSignalsReader } from "../../domain/ports/card-invoice-signals.reader.js";
import { GetCardInvoiceSignalsQuery } from "./card-invoice-queries.js";

/** Les factures carte signalées, les plus récentes d'abord (lot E5a). */
@QueryHandler(GetCardInvoiceSignalsQuery)
export class GetCardInvoiceSignalsHandler implements IQueryHandler<
  GetCardInvoiceSignalsQuery,
  CardInvoiceSignalsView
> {
  constructor(private readonly signals: CardInvoiceSignalsReader) {}

  async execute(): Promise<CardInvoiceSignalsView> {
    return { signaled: await this.signals.signaled() };
  }
}
