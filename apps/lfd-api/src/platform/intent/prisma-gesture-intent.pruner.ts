import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import type { PurgeCensus } from "../retention/purge-mode.js";
import { GestureIntentPruner } from "./gesture-intent-pruner.js";

/**
 * La purge de `platform.gesture_intent`.
 *
 * Une suppression PHYSIQUE, admise ici (décision de Hugo du 2026-11-12) : la
 * table n'est pas un agrégat métier mais la mémoire anti-doublon des clics ;
 * le geste lui-même a laissé sa trace là où il a écrit.
 *
 * La règle porte sur `claimed_at` : une intention résolue l'est quelques
 * secondes après sa réclamation, et une intention jamais résolue a perdu son
 * bail depuis longtemps. L'index `gesture_intent_claimed_at_idx` borne la
 * lecture. Par lots : on choisit les plus anciennes, puis on les supprime par
 * identifiant.
 */
@Injectable()
export class PrismaGestureIntentPruner extends GestureIntentPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const summary = await this.prisma.gestureIntent.aggregate({
      where: { claimedAt: { lt: cutoff } },
      _count: { _all: true },
      _min: { claimedAt: true },
    });
    return { count: summary._count._all, oldest: summary._min.claimedAt };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const rows = await this.prisma.gestureIntent.findMany({
      where: { claimedAt: { lt: cutoff } },
      orderBy: { claimedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.gestureIntent.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return count;
  }
}
