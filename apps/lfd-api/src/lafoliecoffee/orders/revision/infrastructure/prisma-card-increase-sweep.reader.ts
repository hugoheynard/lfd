import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { CardIncreaseSweepReader } from "../domain/ports/card-increase-sweep.reader.js";

/**
 * Les listes des balayages des hausses, par les index `(state,
 * next_attempt_at)` et `(state, expires_at)` de la migration S2.a.
 */
@Injectable()
export class PrismaCardIncreaseSweepReader extends CardIncreaseSweepReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dueForApply(wallNow: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.orderRevisionProposal.findMany({
      where: {
        state: "ready",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: wallNow } }],
        AND: [{ OR: [{ leasedUntil: null }, { leasedUntil: { lt: wallNow } }] }],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async expired(now: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.orderRevisionProposal.findMany({
      where: { state: "awaiting_payment", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async awaitingSince(bornBefore: Date, now: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.orderRevisionProposal.findMany({
      where: {
        state: "awaiting_payment",
        createdAt: { lt: bornBefore },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
