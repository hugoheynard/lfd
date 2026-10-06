import type { Provider, Type } from "@nestjs/common";

import { GetRoundPaperPdfHandler } from "./application/queries/get-round-paper-pdf.handler.js";
import { RoundPaperReader } from "./domain/ports/round-paper.reader.js";
import { DeliveryRoundPaperController } from "./http/delivery-round-paper.controller.js";
import { PrismaRoundPaperReader } from "./infrastructure/prisma-round-paper.reader.js";

/**
 * **La feuille de tournée en PDF**, rangée à part pour que `delivery.module.ts`
 * reste lisible. `DeliveryOrdersReader` et `DeliveryProceduresReader` viennent
 * du fil relié dans `appBootstrap/delivery-feed.module.ts` ;
 * `StaffAuthorDirectory` du module global de l'annuaire ; `Clock` du
 * `ContextModule` global.
 */
export const ROUND_PAPER_CONTROLLERS: readonly Type[] = [DeliveryRoundPaperController];

export const ROUND_PAPER_PROVIDERS: readonly Provider[] = [
  GetRoundPaperPdfHandler,
  { provide: RoundPaperReader, useClass: PrismaRoundPaperReader },
];
