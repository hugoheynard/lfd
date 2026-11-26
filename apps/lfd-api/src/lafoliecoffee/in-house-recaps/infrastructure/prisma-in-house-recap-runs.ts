import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InHouseRecapRuns, type InHouseRecapRun } from "../domain/ports/in-house-recap-runs.js";
import {
  InHouseRecapRunsReader,
  type RecapRunView,
} from "../domain/ports/in-house-recap-runs.reader.js";

/**
 * L'issue d'un (payeur, mois) : `INSERT … ON CONFLICT DO NOTHING` sur
 * l'unicité `(payer_id, month)`. Un refus d'unicité dans la transaction
 * l'annulerait tout entière ; `DO NOTHING` rend zéro ligne, et le passage se
 * tait.
 */
@Injectable()
export class PrismaInHouseRecapRuns extends InHouseRecapRuns {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(run: InHouseRecapRun): Promise<boolean> {
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "public"."in_house_recap_run" ("id", "payer_id", "month", "recap_id", "attempted_at")
      VALUES (${run.id}, ${run.payerId}, ${run.month}, ${run.recapId}, ${run.attemptedAt})
      ON CONFLICT ("payer_id", "month") DO NOTHING`;
    return inserted === 1;
  }
}

/** Les issues d'un payeur, du plus ancien mois au plus récent. */
@Injectable()
export class PrismaInHouseRecapRunsReader extends InHouseRecapRunsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  runsOf(payerId: string): Promise<readonly RecapRunView[]> {
    return this.prisma.inHouseRecapRun.findMany({
      where: { payerId },
      select: { month: true, recapId: true, attemptedAt: true },
      orderBy: { month: "asc" },
    });
  }
}
