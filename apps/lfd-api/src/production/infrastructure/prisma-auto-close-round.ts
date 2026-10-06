import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { AutoCloseAttempts, type AutoCloseOutcome } from "../domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "../domain/ports/auto-close-round.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Ce que le tour lit : la journée du fournil, et la trace de sa tentative. */
@Injectable()
export class PrismaAutoCloseRoundReader extends AutoCloseRoundReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isPlanClosed(day: ServiceDay): Promise<boolean> {
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay: day.value },
      select: { closedAt: true },
    });
    return row?.closedAt != null;
  }

  async isAttempted(day: ServiceDay): Promise<boolean> {
    const row = await this.prisma.productionAutoCloseAttempt.findUnique({
      where: { serviceDay: day.value },
      select: { serviceDay: true },
    });
    return row !== null;
  }
}

/**
 * La trace des tentatives, dans `production.production_auto_close_attempt`.
 *
 * `createMany … skipDuplicates` = `INSERT … ON CONFLICT DO NOTHING` : la
 * seconde instance n'écrit rien, sans erreur Postgres, et le compte rendu dit
 * laquelle a pris la tentative.
 */
@Injectable()
export class PrismaAutoCloseAttempts extends AutoCloseAttempts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(day: ServiceDay, at: Date): Promise<boolean> {
    const pending: AutoCloseOutcome = "pending";
    const { count } = await this.prisma.productionAutoCloseAttempt.createMany({
      data: [{ serviceDay: day.value, attemptedAt: at, outcome: pending }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    day: ServiceDay,
    outcome: Exclude<AutoCloseOutcome, "pending">,
    failure: string | null,
    at: Date,
  ): Promise<void> {
    await this.prisma.productionAutoCloseAttempt.update({
      where: { serviceDay: day.value },
      data: { outcome, failure, settledAt: at },
    });
  }
}
