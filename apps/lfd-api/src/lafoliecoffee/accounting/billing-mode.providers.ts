import type { Provider, Type } from "@nestjs/common";

import { CancelBillingModeDatesHandler } from "./application/commands/cancel-billing-mode-dates.handler.js";
import { ChooseInitialPayerBillingModeHandler } from "./application/commands/choose-initial-payer-billing-mode.handler.js";
import { CancelPayerBillingModeHandler } from "./application/commands/cancel-payer-billing-mode.handler.js";
import { ScheduleBillingModeDatesHandler } from "./application/commands/schedule-billing-mode-dates.handler.js";
import { SetPayerBillingModeHandler } from "./application/commands/set-payer-billing-mode.handler.js";
import { GetBillingRhythmsCalendarHandler } from "./application/queries/get-billing-rhythms-calendar.handler.js";
import { GetInitialPayerBillingModeHandler } from "./application/queries/get-initial-payer-billing-mode.handler.js";
import { ListBillingModeEntitiesHandler } from "./application/queries/list-billing-mode-entities.handler.js";
import { GetPayerBillingModeHandler } from "./application/queries/get-payer-billing-mode.handler.js";
import { BillingModeDatesReader } from "./domain/ports/billing-mode-dates.reader.js";
import { BillingModeDatesRepository } from "./domain/ports/billing-mode-dates.repository.js";
import { PayerBillingModeRepository } from "./domain/ports/payer-billing-mode.repository.js";
import { PayerBillingModesReader } from "./domain/ports/payer-billing-modes.reader.js";
import { PayerOrderHistoryReader } from "./domain/ports/payer-order-history.reader.js";
import { PayerStandingReader } from "./domain/ports/payer-standing.reader.js";
import { PayerStandingsReader } from "./domain/ports/payer-standings.reader.js";
import { AdminCompanyBillingModeController } from "./http/admin-company-billing-mode.controller.js";
import { AdminBillingModesController } from "./http/admin-billing-modes.controller.js";
import { PrismaBillingModeDatesReader } from "./infrastructure/prisma-billing-mode-dates.reader.js";
import { PrismaBillingModeDatesRepository } from "./infrastructure/prisma-billing-mode-dates.repository.js";
import { PrismaPayerBillingModeRepository } from "./infrastructure/prisma-payer-billing-mode.repository.js";
import { PrismaPayerBillingModesReader } from "./infrastructure/prisma-payer-billing-modes.reader.js";
import { PrismaPayerOrderHistoryReader } from "./infrastructure/prisma-payer-order-history.reader.js";
import { PrismaPayerStandingReader } from "./infrastructure/prisma-payer-standing.reader.js";
import { PrismaPayerStandingsReader } from "./infrastructure/prisma-payer-standings.reader.js";

/**
 * Les providers du lot M1 (plan `plan-rythme-de-facturation.md`, §16) : les
 * dates des modes, le mode des payeurs. L'adaptateur de transition
 * `BillingRhythmReader` (le mode mensuel) est retiré en M4a : plus aucun
 * lecteur (vérifié le 2026-10-12).
 * À part du module, qui dépasse déjà la taille d'un fichier.
 */
export const BILLING_MODE_PROVIDERS: readonly Provider[] = [
  { provide: BillingModeDatesRepository, useClass: PrismaBillingModeDatesRepository },
  { provide: BillingModeDatesReader, useClass: PrismaBillingModeDatesReader },
  { provide: PayerBillingModeRepository, useClass: PrismaPayerBillingModeRepository },
  { provide: PayerBillingModesReader, useClass: PrismaPayerBillingModesReader },
  { provide: PayerStandingReader, useClass: PrismaPayerStandingReader },
  { provide: PayerOrderHistoryReader, useClass: PrismaPayerOrderHistoryReader },
  { provide: PayerStandingsReader, useClass: PrismaPayerStandingsReader },
  ScheduleBillingModeDatesHandler,
  CancelBillingModeDatesHandler,
  SetPayerBillingModeHandler,
  ChooseInitialPayerBillingModeHandler,
  CancelPayerBillingModeHandler,
  GetPayerBillingModeHandler,
  GetInitialPayerBillingModeHandler,
  ListBillingModeEntitiesHandler,
  GetBillingRhythmsCalendarHandler,
];

export const BILLING_MODE_CONTROLLERS: readonly Type[] = [
  AdminBillingModesController,
  AdminCompanyBillingModeController,
];
