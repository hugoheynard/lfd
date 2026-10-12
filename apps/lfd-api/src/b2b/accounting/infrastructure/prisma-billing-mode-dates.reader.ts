import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import type { ModeTimelines } from "../domain/services/payer-timeline.js";
import { modeTimelinesOf } from "./billing-mode.mapper.js";

/** Les segments VIVANTS des trois modes d'une entité, relus par les factories. */
@Injectable()
export class PrismaBillingModeDatesReader extends BillingModeDatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async timelinesOf(legalEntityId: string): Promise<ModeTimelines> {
    const rows = await this.prisma.billingModeDates.findMany({
      where: { legalEntityId, cancelledAt: null },
      select: MODE_DATES_SELECT,
    });
    return modeTimelinesOf(rows);
  }
}

/** Ce qu'une timeline lit d'une ligne — partagé avec l'adaptateur du rythme. */
export const MODE_DATES_SELECT = {
  mode: true,
  effectiveFrom: true,
  days: true,
  cancelledAt: true,
  cancelledByStaffId: true,
  createdAt: true,
  createdByStaffId: true,
} as const;
