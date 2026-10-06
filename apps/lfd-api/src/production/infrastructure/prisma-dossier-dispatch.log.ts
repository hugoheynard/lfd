import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  DossierDispatchLog,
  type DossierDispatchOutcome,
  type DossierDispatchSlot,
} from "../domain/ports/dossier-dispatch.log.js";

/** La trace d'envoi, dans `production.production_dossier_dispatch`. */
@Injectable()
export class PrismaDossierDispatchLog extends DossierDispatchLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(slot: DossierDispatchSlot, recipientName: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.productionDossierDispatch.createMany({
      data: [{ ...slot, recipientName, outcome: "pending", claimedAt: at }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    slot: DossierDispatchSlot,
    outcome: DossierDispatchOutcome,
    at: Date,
  ): Promise<void> {
    await this.prisma.productionDossierDispatch.update({
      where: { serviceDay_occasionAt_recipientId: slot },
      data:
        outcome.kind === "sent"
          ? { outcome: "sent", providerId: outcome.providerId, settledAt: at }
          : { outcome: "failed", failure: outcome.failure, settledAt: at },
    });
  }
}
