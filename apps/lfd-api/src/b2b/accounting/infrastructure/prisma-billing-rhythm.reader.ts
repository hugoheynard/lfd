import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BillingRhythmReader } from "../domain/ports/billing-rhythm.reader.js";
import type { ModeDatesTimeline } from "../domain/services/mode-dates-timeline.js";
import { modeTimelinesOf } from "./billing-mode.mapper.js";
import { MODE_DATES_SELECT } from "./prisma-billing-mode-dates.reader.js";

/**
 * ⚠️ L'adaptateur de TRANSITION de M1 (cf. le port) : la timeline du mode
 * MENSUEL de l'entité, lue dans `billing_mode_dates`. Aucune ligne = le 1er,
 * le comportement d'avant le rythme.
 */
@Injectable()
export class PrismaBillingRhythmReader extends BillingRhythmReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async timelineOf(legalEntityId: string): Promise<ModeDatesTimeline | null> {
    const entity = await this.prisma.legalEntity.findUnique({
      where: { id: legalEntityId },
      select: {
        billingModeDates: {
          where: { mode: "monthly", cancelledAt: null },
          select: MODE_DATES_SELECT,
        },
      },
    });
    return entity === null ? null : modeTimelinesOf(entity.billingModeDates).monthly;
  }
}
