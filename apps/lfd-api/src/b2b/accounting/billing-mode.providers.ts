import type { Provider, Type } from "@nestjs/common";

import { CancelBillingModeDatesHandler } from "./application/commands/cancel-billing-mode-dates.handler.js";
import { CancelPayerBillingModeHandler } from "./application/commands/cancel-payer-billing-mode.handler.js";
import { ScheduleBillingModeDatesHandler } from "./application/commands/schedule-billing-mode-dates.handler.js";
import { SetPayerBillingModeHandler } from "./application/commands/set-payer-billing-mode.handler.js";
import { GetBillingRhythmsCalendarHandler } from "./application/queries/get-billing-rhythms-calendar.handler.js";
import { GetPayerBillingModeHandler } from "./application/queries/get-payer-billing-mode.handler.js";
import { BillingModeDatesReader } from "./domain/ports/billing-mode-dates.reader.js";
import { BillingModeDatesRepository } from "./domain/ports/billing-mode-dates.repository.js";
import { PayerBillingModeRepository } from "./domain/ports/payer-billing-mode.repository.js";
import { PayerBillingModesReader } from "./domain/ports/payer-billing-modes.reader.js";
import { PayerStandingReader } from "./domain/ports/payer-standing.reader.js";
import { AdminBillingModesController } from "./http/admin-billing-modes.controller.js";
import { PrismaBillingModeDatesReader } from "./infrastructure/prisma-billing-mode-dates.reader.js";
import { PrismaBillingModeDatesRepository } from "./infrastructure/prisma-billing-mode-dates.repository.js";
import { PrismaPayerBillingModeRepository } from "./infrastructure/prisma-payer-billing-mode.repository.js";
import { PrismaPayerBillingModesReader } from "./infrastructure/prisma-payer-billing-modes.reader.js";
import { PrismaPayerStandingReader } from "./infrastructure/prisma-payer-standing.reader.js";

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
  ScheduleBillingModeDatesHandler,
  CancelBillingModeDatesHandler,
  SetPayerBillingModeHandler,
  CancelPayerBillingModeHandler,
  GetPayerBillingModeHandler,
  GetBillingRhythmsCalendarHandler,
];

export const BILLING_MODE_CONTROLLERS: readonly Type[] = [AdminBillingModesController];
