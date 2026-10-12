import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AutopilotCoverageReader,
  type AutopilotCoverage,
} from "../domain/ports/autopilot-coverage.reader.js";

/**
 * Les tentatives (`collection_autopilot_run`), le dernier lot vivant
 * (`collection_batch`, hors `cancelled`) et le plancher (`collection_floor`)
 * d'une entité. Une entité tente au plus une clôture par semaine : la liste
 * des tentatives reste courte.
 */
@Injectable()
export class PrismaAutopilotCoverageReader extends AutopilotCoverageReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async coverageOf(legalEntityId: string, before: Date): Promise<AutopilotCoverage> {
    const [floor, runs, batch] = await Promise.all([
      this.prisma.collectionFloor.findUnique({ where: { id: true } }),
      this.prisma.collectionAutopilotRun.findMany({
        where: { legalEntityId, cycleClosesAt: { lt: before } },
        select: { cycleClosesAt: true },
      }),
      this.prisma.collectionBatch.findFirst({
        where: { legalEntityId, status: { not: "cancelled" }, cycleClosesAt: { lte: before } },
        orderBy: { cycleClosesAt: "desc" },
        select: { cycleClosesAt: true },
      }),
    ]);
    return {
      floorAt: floor?.floorAt ?? null,
      attemptedClosures: runs.map((run) => run.cycleClosesAt),
      lastLiveBatchClosesAt: batch?.cycleClosesAt ?? null,
    };
  }
}
