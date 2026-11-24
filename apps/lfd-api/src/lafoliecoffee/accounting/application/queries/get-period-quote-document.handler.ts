import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import {
  PeriodQuoteDocumentNotRenderedError,
  PeriodQuoteNotFoundError,
} from "../../domain/errors/period-quote-errors.js";
import { PeriodQuoteReader } from "../../domain/ports/period-quote.reader.js";
import {
  periodQuoteDocumentKey,
  periodQuoteFileName,
} from "../../domain/services/period-quote-pdf.js";
import type { InvoiceDocument } from "../invoice-document-support.js";
import { GetPeriodQuoteDocumentQuery } from "./get-period-quote-document.query.js";

/**
 * **Le PDF rangé d'une version de devis**, pour le staff (QD7) — la figure du
 * PDF d'une facture en comptabilité. Une lecture : elle ne rend rien, elle
 * relit ce que l'envoi a rangé sous `quotes/<entité>/<numéro>-v<version>.pdf`.
 * Une version jamais envoyée n'a pas de document : 404 nommé, et « Renvoyer
 * le devis » le rend.
 *
 * @throws {PeriodQuoteNotFoundError} aucun devis sous cet identifiant.
 * @throws {PeriodQuoteDocumentNotRenderedError} pas encore rendu.
 */
@QueryHandler(GetPeriodQuoteDocumentQuery)
export class GetPeriodQuoteDocumentHandler implements IQueryHandler<
  GetPeriodQuoteDocumentQuery,
  InvoiceDocument
> {
  constructor(
    private readonly quotes: PeriodQuoteReader,
    private readonly store: CustomerDocumentStore,
  ) {}

  async execute(query: GetPeriodQuoteDocumentQuery): Promise<InvoiceDocument> {
    const quote = await this.quotes.byId(query.quoteId);
    if (quote === null) {
      throw new PeriodQuoteNotFoundError(query.quoteId);
    }
    const bytes = await this.store.readIfPresent(periodQuoteDocumentKey(quote));
    if (bytes === null) {
      throw new PeriodQuoteDocumentNotRenderedError(quote.number, quote.version);
    }
    return { fileName: periodQuoteFileName(quote), bytes };
  }
}
