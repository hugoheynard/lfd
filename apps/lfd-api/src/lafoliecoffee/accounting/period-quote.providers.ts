import type { Provider } from "@nestjs/common";

import { PeriodQuoteShelver } from "./application/services/period-quote-shelver.js";
import { PeriodQuoteRepository } from "./domain/ports/period-quote.repository.js";
import { PrismaPeriodQuoteRepository } from "./infrastructure/prisma-period-quote.repository.js";

/**
 * Les providers du devis de période (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, Q3) : le rangement à la clôture. À part du module, qui dépasse
 * déjà la taille d'un fichier.
 */
export const PERIOD_QUOTE_PROVIDERS: readonly Provider[] = [
  { provide: PeriodQuoteRepository, useClass: PrismaPeriodQuoteRepository },
  PeriodQuoteShelver,
];
