import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricingJournalReader, type JournalEntry } from "../domain/ports/pricing-journal.reader.js";
import { PRICING_ACTS, type PricingActKind } from "../domain/pricing-act.js";
import type { PricingEventRow } from "./pricing-journal.writer.js";

/** Au-delà, l'écran ne montre plus une histoire mais un fichier de logs. */
const MAX_ENTRIES = 200;

@Injectable()
export class PrismaPricingJournalReader extends PricingJournalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forSubject(subjectType: string, subjectId: string): Promise<JournalEntry[]> {
    const rows = await this.prisma.pricingEvent.findMany({
      where: { subjectType, subjectId },
      orderBy: { occurredAt: "desc" },
      take: MAX_ENTRIES,
    });
    return rows.map(entryFromRow);
  }

  async recent(limit: number): Promise<JournalEntry[]> {
    const rows = await this.prisma.pricingEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: Math.min(Math.max(limit, 1), MAX_ENTRIES),
    });
    return rows.map(entryFromRow);
  }
}

/**
 * Un acte inconnu **ne lève pas**, à la différence d'une règle illisible.
 *
 * La dissymétrie est voulue : une règle illisible facturerait un prix que
 * personne n'a décidé, alors qu'un acte illisible ne fait rien du tout. Refuser
 * de rendre le journal entier parce qu'une de ses trois cents lignes vient d'une
 * version plus récente reviendrait à perdre l'historique pour protéger de rien.
 * Le verbe inconnu se range en `posed`, la phrase figée, elle, reste exacte.
 */
function entryFromRow(row: PricingEventRow): JournalEntry {
  return {
    id: row.id,
    subjectType: row.subjectType === "floor" ? "floor" : "rule",
    subjectId: row.subjectId,
    kind: actOf(row.act),
    actor: row.actor,
    at: row.occurredAt,
    reason: row.reason,
    summary: row.summary,
  };
}

function actOf(value: string): PricingActKind {
  return PRICING_ACTS.find((candidate) => candidate === value) ?? "posed";
}
