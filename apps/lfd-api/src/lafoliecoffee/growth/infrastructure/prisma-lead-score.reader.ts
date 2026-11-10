import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LeadScoreReader } from "../domain/ports/lead-score.reader.js";
import type { LeadScoreView, PlayType } from "@lfd/contracts";

/** Valeurs valides — narrowing défensif à la lecture (le read-model n'a pas de contrainte SQL). */
const PLAYS: readonly PlayType[] = ["rescue", "nurture"];
/** Les sujets que le cockpit montre encore — une personne n'en est plus un (lot P3). */
const SUBJECT_TYPES = ["company", "lead"] as const;

/**
 * Adaptateur Prisma de lecture du read-model `lead_score` : les `limit` lignes de
 * plus fort score. Aucun calcul — le score est déjà matérialisé par le recompute.
 * On ne relit jamais le journal ici (c'est tout l'intérêt du read-model).
 *
 * Le filtre sur le sujet et la play écarte les lignes « personne » qu'un
 * read-model calculé avant le lot P3 (2026-10-25) porte encore jusqu'au
 * prochain recompute : sans lui, un particulier resterait en tête du cockpit
 * jusqu'au passage du cron.
 */
@Injectable()
export class PrismaLeadScoreReader extends LeadScoreReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async topPlays(limit: number): Promise<LeadScoreView[]> {
    const rows = await this.prisma.leadScore.findMany({
      where: { subjectType: { in: [...SUBJECT_TYPES] }, play: { in: [...PLAYS] } },
      orderBy: [{ score: "desc" }, { recencyDays: "asc" }],
      take: limit,
    });

    return rows.map((row) => ({
      subjectType: toSubjectType(row.subjectType),
      subjectId: row.subjectId,
      label: row.label,
      play: toPlay(row.play),
      score: row.score,
      reason: row.reason,
      recencyDays: row.recencyDays,
      computedAt: row.computedAt.toISOString(),
    }));
  }
}

/** Narrowing du sujet stocké (`company` | `lead`) ; la requête a déjà écarté le reste. */
function toSubjectType(value: string): "company" | "lead" {
  return value === "company" ? "company" : "lead";
}

function isPlay(value: string): value is PlayType {
  return (PLAYS as readonly string[]).includes(value);
}

function toPlay(value: string): PlayType {
  return isPlay(value) ? value : "nurture";
}
