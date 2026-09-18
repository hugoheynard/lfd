import { Injectable } from "@nestjs/common";

import type { ActivityEventView, ActivityPageView, ActivityQuery } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { moduleOf } from "../domain/activity-module.js";
import { ActivityJournalReader } from "../domain/ports/activity-journal.reader.js";
import { activityWhereOf } from "./activity-journal.where.js";

/** Une ligne du journal, réduite aux colonnes que la vue expose. */
const COLUMNS = {
  id: true,
  type: true,
  occurredAt: true,
  subjectType: true,
  subjectId: true,
  actorType: true,
  actorId: true,
  actorName: true,
  actorRole: true,
  traceId: true,
  payload: true,
} as const;

/**
 * Lecture paginée du journal (`growth.activity_events`).
 *
 * **Pagination par curseur, pas par offset** : le flux est append-only et se
 * lit du plus récent au plus ancien ; un `skip` glisserait d'une ligne à chaque
 * fait écrit pendant la lecture. L'`id` est un ULID, donc trier par `id`
 * décroissant trie par le temps — sans jointure ni index supplémentaire.
 */
@Injectable()
export class PrismaActivityJournalReader extends ActivityJournalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(query: ActivityQuery): Promise<ActivityPageView> {
    // Une ligne de plus que demandé : sa présence dit qu'il y a une suite, sans
    // second `count` sur une table qui grossit.
    const ids = await this.prisma.$queryRaw<readonly { readonly id: string }[]>`
      SELECT id FROM growth.activity_events
      WHERE ${activityWhereOf(query)}
      ORDER BY id DESC
      LIMIT ${query.limit + 1}
    `;
    // Les filtres sont en SQL (cf. `activityWhereOf`) ; les colonnes, elles,
    // se relisent par Prisma — par clé primaire, donc sans coût — pour rester
    // typées jusqu'à la vue.
    const page = ids.slice(0, query.limit).map((row) => row.id);
    const rows = await this.prisma.activityEvent.findMany({
      where: { id: { in: page } },
      orderBy: { id: "desc" },
      select: COLUMNS,
    });

    return {
      events: rows.map(toView),
      nextBefore: ids.length > query.limit ? (page.at(-1) ?? null) : null,
    };
  }
}

function toView(row: {
  id: string;
  type: string;
  occurredAt: Date;
  subjectType: string;
  subjectId: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  traceId: string;
  payload: Prisma.JsonValue;
}): ActivityEventView {
  return {
    id: row.id,
    type: row.type,
    module: moduleOf(row.type),
    occurredAt: row.occurredAt.toISOString(),
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actorType: actorTypeOf(row.actorType),
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    traceId: row.traceId,
    payload: payloadOf(row.payload),
  };
}

/** La colonne est un `String` libre ; la vue en fait une union close. */
function actorTypeOf(raw: string): ActivityEventView["actorType"] {
  return raw === "customer" || raw === "staff" ? raw : "system";
}

/** Un payload non-objet (null, tableau, scalaire) est rendu vide plutôt qu'inventé. */
function payloadOf(raw: Prisma.JsonValue): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  // Étalé, et non transtypé : la copie porte le bon type sans forcer la main.
  return { ...raw };
}
