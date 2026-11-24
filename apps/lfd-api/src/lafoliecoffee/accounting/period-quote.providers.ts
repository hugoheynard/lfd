import type { Provider } from "@nestjs/common";

import { ReceivePeriodQuoteCommitmentHandler } from "./application/commands/receive-period-quote-commitment.handler.js";
import { ResendPeriodQuoteHandler } from "./application/commands/resend-period-quote.handler.js";
import { SendPeriodQuote } from "./application/handlers/send-period-quote.handler.js";
import { GetPeriodQuoteSpecimenHandler } from "./application/queries/get-period-quote-specimen.handler.js";
import { PeriodQuoteDocumentRenderer } from "./application/services/period-quote-document-renderer.js";
import { PeriodQuoteNoticeSender } from "./application/services/period-quote-notice-sender.js";
import { PeriodQuoteInvoicePlanner } from "./application/services/period-quote-invoice-planner.js";
import { PeriodQuoteInvoicing } from "./application/services/period-quote-invoicing.js";
import { PeriodQuoteReviser } from "./application/services/period-quote-reviser.js";
import { PeriodQuoteShelver } from "./application/services/period-quote-shelver.js";
import { PeriodQuoteOrdersReader } from "./domain/ports/period-quote-orders.reader.js";
import { PeriodQuoteReader } from "./domain/ports/period-quote.reader.js";
import { PeriodQuoteRepository } from "./domain/ports/period-quote.repository.js";
import { PrismaPeriodQuoteOrdersReader } from "./infrastructure/prisma-period-quote-orders.reader.js";
import { PrismaPeriodQuoteReader } from "./infrastructure/prisma-period-quote.reader.js";
import { PrismaPeriodQuoteRepository } from "./infrastructure/prisma-period-quote.repository.js";
import { PrismaQuotedOrdersReader } from "./infrastructure/prisma-quoted-orders.reader.js";

/**
 * Les providers du devis de période (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies) : le rangement à la clôture (Q3) ; le document, l'envoi, le
 * renvoi et l'exemple de la planche (Q4) ; « Engagement reçu » et sa facture,
 * le devis en attente d'une commande (Q5). La mercuriale citée et l'écriture
 * du numéro sur les commandes sont reliées par `appBootstrap`
 * (`QuoteMercurialeModule`, `PeriodQuoteCommitmentModule`). À part du module, qui dépasse
 * déjà la taille d'un fichier.
 */
export const PERIOD_QUOTE_PROVIDERS: readonly Provider[] = [
  { provide: PeriodQuoteRepository, useClass: PrismaPeriodQuoteRepository },
  { provide: PeriodQuoteReader, useClass: PrismaPeriodQuoteReader },
  { provide: PeriodQuoteOrdersReader, useClass: PrismaPeriodQuoteOrdersReader },
  PeriodQuoteShelver,
  PeriodQuoteReviser,
  PeriodQuoteDocumentRenderer,
  PeriodQuoteNoticeSender,
  SendPeriodQuote,
  ResendPeriodQuoteHandler,
  GetPeriodQuoteSpecimenHandler,
  PeriodQuoteInvoicePlanner,
  PeriodQuoteInvoicing,
  ReceivePeriodQuoteCommitmentHandler,
  PrismaQuotedOrdersReader,
];
