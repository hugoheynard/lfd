import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
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

  async claim(
    slot: DossierDispatchSlot,
    recipientName: string,
    at: Date,
    planVersion: number | null = null,
  ): Promise<boolean> {
    const { count } = await this.prisma.productionDossierDispatch.createMany({
      data: [{ ...slot, recipientName, outcome: "pending", claimedAt: at, planVersion }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    slot: DossierDispatchSlot,
    outcome: DossierDispatchOutcome,
    at: Date,
  ): Promise<void> {
    // Conditionnée en base : une issue posée ne se réécrit pas (cf. le port).
    await this.prisma.productionDossierDispatch.updateMany({
      where: { ...slot, outcome: "pending" },
      data:
        outcome.kind === "sent"
          ? { outcome: "sent", providerId: outcome.providerId, settledAt: at }
          : { outcome: "failed", failure: outcome.failure, settledAt: at },
    });
  }
}
