import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LeadScoreReader } from "../domain/ports/lead-score.reader.js";
import type { LeadScoreView, MomentumTrajectory, PlayType } from "@lfd/contracts";

/** Valeurs valides — narrowing défensif à la lecture (le read-model n'a pas de contrainte SQL). */
const PLAYS: readonly PlayType[] = ["lock_in", "rescue", "upgrade", "win_back", "nurture"];
const MOMENTA: readonly MomentumTrajectory[] = ["accelerating", "stable", "cooling", "dormant"];

/**
 * Adaptateur Prisma de lecture du read-model `lead_score` : les `limit` lignes de
 * plus fort score. Aucun calcul — le score est déjà matérialisé par le recompute.
 * On ne relit jamais le journal ici (c'est tout l'intérêt du read-model).
 */
@Injectable()
export class PrismaLeadScoreReader extends LeadScoreReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async topPlays(limit: number): Promise<LeadScoreView[]> {
    const rows = await this.prisma.leadScore.findMany({
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
      momentum: toMomentum(row.momentum),
      monetaryCents: row.monetaryCents,
      recencyDays: row.recencyDays,
      computedAt: row.computedAt.toISOString(),
    }));
  }
}

/** Narrowing du sujet stocké (`user` | `company` | `lead`), défaut `user`. */
function toSubjectType(value: string): "user" | "company" | "lead" {
  if (value === "company" || value === "lead") {
    return value;
  }
  return "user";
}

function isPlay(value: string): value is PlayType {
  return (PLAYS as readonly string[]).includes(value);
}

function toPlay(value: string): PlayType {
  return isPlay(value) ? value : "lock_in";
}

function isMomentum(value: string): value is MomentumTrajectory {
  return (MOMENTA as readonly string[]).includes(value);
}

function toMomentum(value: string | null): MomentumTrajectory | null {
  return value !== null && isMomentum(value) ? value : null;
}
