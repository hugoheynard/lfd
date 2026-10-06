import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { StopDecision } from "../domain/entities/stop-decision.js";
import { StopDecisionStaleError } from "../domain/errors/delivery-decision-errors.js";
import { StopDecisionRepository } from "../domain/ports/stop-decision.repository.js";
import { outcomeOf, sourceOf } from "./stop-decision.mapper.js";

/**
 * **Adaptateur Prisma de la décision du commercial** (`delivery.stop_decision`,
 * `a-la-porte.md`, § 10 bis).
 *
 * L'ouverture est un `createMany … skipDuplicates` : deux signalements
 * simultanés sur le même arrêt ouvrent UNE décision, la première. Une
 * réponse est conditionnée par la version lue, dans le `where` — en plus du
 * verrou de la tournée que l'application tient déjà.
 */
@Injectable()
export class PrismaStopDecisionRepository extends StopDecisionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(stopId: string): Promise<StopDecision | null> {
    const row = await this.prisma.deliveryStopDecision.findUnique({ where: { stopId } });
    if (row === null) {
      return null;
    }
    return StopDecision.restore(
      {
        stopId: row.stopId,
        roundId: row.roundId,
        orderId: row.orderId,
        serviceDay: row.serviceDay,
        openedByIncidentId: row.openedByIncidentId,
        openedAt: row.openedAt,
        outcome: outcomeOf(row.outcome),
        source: sourceOf(row.source),
        decidedAt: row.decidedAt,
        decidedBy: row.decidedBy,
        decidedByName: row.decidedByName,
      },
      row.version,
    );
  }

  async save(decision: StopDecision, label: string): Promise<void> {
    const snapshot = decision.toSnapshot();
    if (decision.loadedVersion === null) {
      await this.prisma.deliveryStopDecision.createMany({
        data: [{ ...snapshot }],
        skipDuplicates: true,
      });
      return;
    }
    const written = await this.prisma.deliveryStopDecision.updateMany({
      where: { stopId: snapshot.stopId, version: decision.loadedVersion },
      data: {
        outcome: snapshot.outcome,
        source: snapshot.source,
        decidedAt: snapshot.decidedAt,
        decidedBy: snapshot.decidedBy,
        decidedByName: snapshot.decidedByName,
        version: decision.loadedVersion + 1,
      },
    });
    if (written.count === 0) {
      throw new StopDecisionStaleError(label);
    }
  }
}
