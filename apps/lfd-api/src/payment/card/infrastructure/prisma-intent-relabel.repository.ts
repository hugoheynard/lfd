import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IntentRelabel, type IntentRelabelState } from "../domain/entities/intent-relabel.js";
import { IntentRelabelQueue } from "../domain/ports/intent-relabel-queue.reader.js";
import { IntentRelabelRepository } from "../domain/ports/intent-relabel.repository.js";

/** Une ligne lue, telle que Prisma la rend. */
interface RelabelRow {
  readonly paymentId: string;
  readonly description: string;
  readonly metadata: unknown;
  readonly revision: number;
  readonly state: IntentRelabelState;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly lastFailure: string | null;
  readonly updatedAt: Date;
}

/** Les clés gardées : un objet de chaînes, écrit par ce seul dépôt. Le reste est ignoré. */
function metadataOf(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const kept: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      kept[key] = entry;
    }
  }
  return kept;
}

function relabelOf(row: RelabelRow): IntentRelabel {
  return IntentRelabel.rehydrate({ ...row, metadata: metadataOf(row.metadata) });
}

/**
 * **Les libellés à poser**, dans `payment.card_intent_relabel` — l'écrivain
 * UNIQUE de la table. Par le client ambiant. Aucun verrou : chaque écriture
 * se conditionne à la révision lue, et une course perdue rend `false`.
 *
 * Pas de mur tenant : les appelants sont l'abonné du sujet par son canal et
 * le balayage machine — aucun ne parle au nom d'une société.
 */
@Injectable()
export class PrismaIntentRelabelRepository extends IntentRelabelRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(paymentId: string): Promise<IntentRelabel | null> {
    const row = await this.prisma.cardIntentRelabel.findUnique({ where: { paymentId } });
    return row === null ? null : relabelOf(row);
  }

  async save(relabel: IntentRelabel): Promise<boolean> {
    const { paymentId, metadata, ...columns } = relabel.toSnapshot();
    const data = { ...columns, metadata: { ...metadata } };
    if (relabel.loadedRevision === null) {
      const created = await this.prisma.cardIntentRelabel.createMany({
        data: [{ paymentId, ...data }],
        skipDuplicates: true,
      });
      return created.count === 1;
    }
    const written = await this.prisma.cardIntentRelabel.updateMany({
      where: { paymentId, revision: relabel.loadedRevision },
      data,
    });
    return written.count === 1;
  }
}

/** La file du balayage : `pending` et dus, le plus ancien d'abord. */
@Injectable()
export class PrismaIntentRelabelQueue extends IntentRelabelQueue {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async due(at: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.cardIntentRelabel.findMany({
      where: { state: "pending", nextAttemptAt: { lte: at } },
      orderBy: [{ nextAttemptAt: "asc" }, { paymentId: "asc" }],
      take: limit,
      select: { paymentId: true },
    });
    return rows.map((row) => row.paymentId);
  }
}
