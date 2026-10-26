import type { Provider, Type } from "@nestjs/common";

import { GetDayRoundsDossierPdfHandler } from "./application/queries/get-day-rounds-dossier-pdf.handler.js";
import { GetDayRoundsDossierSpecimenHandler } from "./application/queries/get-day-rounds-dossier-specimen.handler.js";
import { DayRoundsDossierChecks } from "./application/day-rounds-dossier-checks.js";
import { RoundPaperAssembler } from "./application/round-paper-assembly.js";
import { GetRoundPaperPdfHandler } from "./application/queries/get-round-paper-pdf.handler.js";
import { GetRoundPaperSpecimenHandler } from "./application/queries/get-round-paper-specimen.handler.js";
import { DayRoundPapersReader, RoundPaperReader } from "./domain/ports/round-paper.reader.js";
import { AdminRoundPaperSpecimenController } from "./http/admin-round-paper-specimen.controller.js";
import { DeliveryRoundPaperController } from "./http/delivery-round-paper.controller.js";
import {
  PrismaDayRoundPapersReader,
  PrismaRoundPaperReader,
} from "./infrastructure/prisma-round-paper.reader.js";

/**
 * **La feuille de tournée en PDF**, rangée à part pour que `delivery.module.ts`
 * reste lisible. `DeliveryOrdersReader` et `DeliveryProceduresReader` viennent
 * du fil relié dans `appBootstrap/delivery-feed.module.ts` ;
 * `StaffAuthorDirectory` du module global de l'annuaire ; `Clock` du
 * `ContextModule` global.
 */
export const ROUND_PAPER_CONTROLLERS: readonly Type[] = [
  DeliveryRoundPaperController,
  // La feuille d'EXEMPLE de la planche des documents (Comptabilité, 2026-10-20).
  AdminRoundPaperSpecimenController,
];

export const ROUND_PAPER_PROVIDERS: readonly Provider[] = [
  GetRoundPaperPdfHandler,
  GetRoundPaperSpecimenHandler,
  { provide: RoundPaperReader, useClass: PrismaRoundPaperReader },
  // Le dossier des tournées du jour (décision de Hugo du 2026-10-26).
  GetDayRoundsDossierPdfHandler,
  GetDayRoundsDossierSpecimenHandler,
  RoundPaperAssembler,
  DayRoundsDossierChecks,
  { provide: DayRoundPapersReader, useClass: PrismaDayRoundPapersReader },
];
