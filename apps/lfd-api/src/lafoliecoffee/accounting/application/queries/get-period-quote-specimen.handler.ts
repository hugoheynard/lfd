import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceFontSource } from "../../domain/ports/invoice-font-source.js";
import {
  periodQuoteFileName,
  renderPeriodQuotePdf,
} from "../../domain/services/period-quote-pdf.js";
import {
  SPECIMEN_QUOTE_MERCURIALE,
  SPECIMEN_QUOTE_SELLER,
  specimenPeriodQuote,
  specimenQuoteOrders,
} from "../document-specimens/specimen-period-quote.js";
import type { InvoiceDocument } from "../invoice-document-support.js";
import { GetPeriodQuoteSpecimenQuery } from "./get-period-quote-specimen.query.js";

/** Le mot posé en travers du devis d'exemple, comme sur la facture d'exemple. */
const SPECIMEN_WATERMARK = "EXEMPLE";

/**
 * **Rend le devis de période d'exemple** par le rendu même des devis
 * (`renderPeriodQuotePdf`), sans `PeriodQuoteDocumentRenderer`, qui range :
 * un exemple ne se range pas.
 */
@QueryHandler(GetPeriodQuoteSpecimenQuery)
export class GetPeriodQuoteSpecimenHandler implements IQueryHandler<
  GetPeriodQuoteSpecimenQuery,
  InvoiceDocument
> {
  constructor(
    private readonly clock: Clock,
    private readonly fonts: InvoiceFontSource,
  ) {}

  async execute(): Promise<InvoiceDocument> {
    const now = this.clock.now();
    const orders = specimenQuoteOrders(now);
    const quote = specimenPeriodQuote(now, orders);
    const bytes = await renderPeriodQuotePdf({
      quote,
      orders,
      seller: SPECIMEN_QUOTE_SELLER,
      mercuriale: SPECIMEN_QUOTE_MERCURIALE,
      fonts: await this.fonts.load(),
      watermark: SPECIMEN_WATERMARK,
    });
    return { bytes, fileName: `exemple-${periodQuoteFileName(quote)}` };
  }
}
