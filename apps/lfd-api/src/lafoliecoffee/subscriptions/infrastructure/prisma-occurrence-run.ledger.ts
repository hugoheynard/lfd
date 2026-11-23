import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OccurrenceRunLedger,
  type OccurrenceRefusalCause,
  type OccurrenceRunEntry,
  type OccurrenceRunRecorded,
  type OccurrenceRunState,
} from "../domain/ports/occurrence-run.ledger.js";
import { IsoDate } from "../domain/value-objects/iso-date.js";

const OUTCOMES = ["generated", "refused", "missed_deadline"] as const;
const CAUSES = [
  "buyer_left",
  "deadline_closed",
  "item_limit_exceeded",
  "reserved_elsewhere",
  "unavailable_sku",
  "day_closed",
  "plan_closed",
  "no_settlement",
] as const satisfies readonly OccurrenceRefusalCause[];
const outcomeSchema = z.enum(OUTCOMES);
const causeSchema = z.enum(CAUSES).nullable();
/** Seul un refus se réécrit ; une échéance générée ou manquée est close. */
const REWRITABLE = "refused";

/** Adaptateur Prisma du registre : l'unicité tranche l'insertion, un refus se réécrit sous condition. */
@Injectable()
export class PrismaOccurrenceRunLedger extends OccurrenceRunLedger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async record(entry: OccurrenceRunEntry): Promise<OccurrenceRunRecorded> {
    const columns = toColumns(entry);
    const key = { subscriptionId: entry.subscriptionId, occurrenceDate: entry.date.toUtcDate() };
    // L'insertion d'abord : la contrainte d'unicité tranche entre deux
    // balayages concurrents, sans lecture préalable qui laisserait passer
    // les deux.
    const inserted = await this.prisma.subscriptionOccurrenceRun.createMany({
      data: [{ id: this.ids.next(), ...key, ...columns }],
      skipDuplicates: true,
    });
    if (inserted.count === 1) {
      return { written: true, newCause: columns.cause !== null };
    }
    const before = await this.prisma.subscriptionOccurrenceRun.findUniqueOrThrow({
      where: { subscriptionId_occurrenceDate: key },
      select: { cause: true },
    });
    // L'écriture est conditionnée au statut en base : une échéance close
    // entre la lecture et l'écriture n'est pas rouverte.
    const updated = await this.prisma.subscriptionOccurrenceRun.updateMany({
      where: { ...key, outcome: REWRITABLE },
      data: columns,
    });
    return {
      written: updated.count === 1,
      newCause: updated.count === 1 && columns.cause !== null && columns.cause !== before.cause,
    };
  }

  async runsBetween(
    subscriptionId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<readonly OccurrenceRunState[]> {
    const rows = await this.prisma.subscriptionOccurrenceRun.findMany({
      where: {
        subscriptionId,
        occurrenceDate: { gte: from.toUtcDate(), lte: to.toUtcDate() },
      },
      orderBy: { occurrenceDate: "asc" },
      select: { occurrenceDate: true, outcome: true, cause: true },
    });
    return rows.map((row) => ({
      date: IsoDate.fromDate(row.occurrenceDate),
      outcome: outcomeSchema.parse(row.outcome),
      cause: causeSchema.parse(row.cause),
    }));
  }
}

function toColumns(entry: OccurrenceRunEntry): {
  outcome: (typeof OUTCOMES)[number];
  orderId: string | null;
  cause: OccurrenceRefusalCause | null;
  reason: string | null;
  recordedAt: Date;
} {
  const { outcome } = entry;
  if (outcome.kind === "generated") {
    return {
      outcome: "generated",
      orderId: outcome.orderId,
      cause: null,
      reason: null,
      recordedAt: entry.at,
    };
  }
  return {
    outcome: outcome.kind,
    orderId: null,
    cause: outcome.cause,
    reason: outcome.reason,
    recordedAt: entry.at,
  };
}
