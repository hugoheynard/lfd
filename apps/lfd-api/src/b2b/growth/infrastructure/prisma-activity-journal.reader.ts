import { Injectable } from "@nestjs/common";

import type { ActivityEventView, ActivityPageView, ActivityQuery } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { moduleOf, prefixesOf } from "../domain/activity-module.js";
import { ActivityJournalReader } from "../domain/ports/activity-journal.reader.js";

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
    const rows = await this.prisma.activityEvent.findMany({
      where: whereOf(query),
      orderBy: { id: "desc" },
      take: query.limit + 1,
      select: COLUMNS,
    });

    const page = rows.slice(0, query.limit);
    return {
      events: page.map(toView),
      nextBefore: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

/**
 * Les filtres, assemblés sous un `AND` **explicite**.
 *
 * Deux clés `OR` dans un même objet `where` s'écrasent silencieusement — la
 * seconde gagne, la première ne filtre rien. Ici le module et la fenêtre de
 * temps produisent chacun leur clause, d'où le tableau.
 */
function whereOf(query: ActivityQuery): Prisma.ActivityEventWhereInput {
  const clauses: Prisma.ActivityEventWhereInput[] = [];

  if (query.module !== undefined) {
    clauses.push({
      OR: prefixesOf(query.module).map((prefix) => ({ type: { startsWith: prefix } })),
    });
  }
  if (query.type !== undefined) {
    clauses.push({ type: query.type });
  }
  if (query.subjectType !== undefined) {
    clauses.push({ subjectType: query.subjectType });
  }
  if (query.subjectId !== undefined) {
    clauses.push({ subjectId: query.subjectId });
  }
  if (query.actorId !== undefined) {
    clauses.push({ actorId: query.actorId });
  }
  if (query.since !== undefined) {
    clauses.push({ occurredAt: { gte: new Date(query.since) } });
  }
  if (query.until !== undefined) {
    clauses.push({ occurredAt: { lt: new Date(query.until) } });
  }
  // Le curseur : strictement AVANT la dernière ligne rendue (ULID décroissant).
  if (query.before !== undefined) {
    clauses.push({ id: { lt: query.before } });
  }

  return clauses.length === 0 ? {} : { AND: clauses };
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
