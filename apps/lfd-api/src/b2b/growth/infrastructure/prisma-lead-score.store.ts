import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LeadScoreStore } from "../domain/ports/lead-score.store.js";
import type { LeadScoreView } from "@lfd/contracts";

/**
 * Adaptateur Prisma du read-model `lead_score`. `replaceAll` est **tout-ou-rien** :
 * dans une transaction, on vide la table puis on ré-insère la queue fraîche — le
 * cockpit ne voit jamais un état à moitié recalculé. Le read-model est une
 * projection intégralement dérivée du journal, donc un `deleteMany` global est
 * légitime (aucune donnée propre n'y vit).
 */
@Injectable()
export class PrismaLeadScoreStore extends LeadScoreStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async replaceAll(rows: readonly LeadScoreView[]): Promise<void> {
    const data = rows.map((row) => ({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      label: row.label,
      play: row.play,
      score: row.score,
      reason: row.reason,
      // Colonnes des anciens coups « personne » (retirés au lot P3,
      // 2026-10-25) : gardées en base, plus jamais remplies.
      momentum: null,
      monetaryCents: 0,
      recencyDays: row.recencyDays,
      computedAt: new Date(row.computedAt),
    }));

    await this.prisma.$transaction([
      this.prisma.leadScore.deleteMany({}),
      this.prisma.leadScore.createMany({ data }),
    ]);
  }
}
