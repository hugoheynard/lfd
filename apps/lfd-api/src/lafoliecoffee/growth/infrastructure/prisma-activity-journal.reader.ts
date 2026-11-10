import { Injectable } from "@nestjs/common";

import type { ActivityEventView, ActivityPageView, ActivityQuery } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { moduleOf } from "../domain/activity-module.js";
import type { ActivitySlice } from "../domain/activity-slice.js";
import { ActivityJournalReader } from "../domain/ports/activity-journal.reader.js";
import { activitySnapshotWhereOf, activityWhereOf } from "./activity-journal.where.js";

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
 * Ce qui borne une lecture sans venir de la requête : les références de
 * l'acteur filtré, et la tranche posée par le serveur. L'ancre, le total et les
 * pages les partagent — un bord oublié dans l'un annoncerait des pages qui
 * n'existent pas, ou en montrerait qui ne sont pas à lui.
 */
interface Scope {
  readonly actorIds: readonly string[] | null;
  readonly slice: ActivitySlice | null;
}

/**
 * Lecture paginée du journal (`growth.activity_events`), de deux façons.
 *
 * **Par curseur** (`before`) — la première, que le front en ligne lit : le flux
 * est append-only et se lit du plus récent au plus ancien, et un curseur ne
 * glisse jamais.
 *
 * **Par numéro de page** (`page`, 2026-09-19) — pour un paginateur, qui saute à
 * une page et annonce un total. Un `OFFSET` nu glisserait d'une ligne à chaque
 * fait écrit pendant la lecture ; il est donc lu dans un **instantané** : tout
 * ce qui précède l'ancre `asOf`, fixée par la première page et renvoyée par les
 * suivantes. L'`id` est un ULID : trier par `id` décroissant trie par le temps,
 * et borner par `id` découpe exactement ce que la première page a vu.
 */
@Injectable()
export class PrismaActivityJournalReader extends ActivityJournalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(
    query: ActivityQuery,
    actorIds: readonly string[] | null,
    slice: ActivitySlice | null,
  ): Promise<ActivityPageView> {
    const scope = { actorIds, slice };
    const asOf = query.asOf ?? (await this.latestMatching(query, scope));
    const page = query.page ?? null;
    if (asOf === null) {
      // Aucun fait ne répond aux filtres : pas d'instantané à lire.
      return { events: [], nextBefore: null, total: 0, page: page ?? firstPageOr(query), asOf };
    }
    const offset = page === null ? 0 : (page - 1) * query.limit;
    // Une ligne de plus que demandé : sa présence dit qu'il y a une suite.
    const [ids, total] = await Promise.all([
      this.prisma.$queryRaw<readonly { readonly id: string }[]>`
        SELECT id FROM growth.activity_events
        WHERE ${activityWhereOf(query, actorIds, asOf, slice)}
        ORDER BY id DESC
        LIMIT ${query.limit + 1} OFFSET ${offset}
      `,
      this.countOf(query, scope, asOf),
    ]);
    // Les filtres sont en SQL (cf. `activityWhereOf`) ; les colonnes, elles,
    // se relisent par Prisma — par clé primaire, donc sans coût — pour rester
    // typées jusqu'à la vue.
    const kept = ids.slice(0, query.limit).map((row) => row.id);
    const rows = await this.prisma.activityEvent.findMany({
      where: { id: { in: kept } },
      orderBy: { id: "desc" },
      select: COLUMNS,
    });

    return {
      events: rows.map(toView),
      nextBefore: ids.length > query.limit ? (kept.at(-1) ?? null) : null,
      total,
      page: page ?? firstPageOr(query),
      asOf,
    };
  }

  /** L'ancre d'un instantané neuf : le fait le plus récent qui répond aux filtres. */
  private async latestMatching(query: ActivityQuery, scope: Scope): Promise<string | null> {
    const [latest] = await this.prisma.$queryRaw<readonly { readonly id: string }[]>`
      SELECT id FROM growth.activity_events
      WHERE ${activitySnapshotWhereOf(query, scope.actorIds, null, scope.slice)}
      ORDER BY id DESC
      LIMIT 1
    `;
    return latest?.id ?? null;
  }

  /** Le total de l'instantané — filtres et recherche compris, curseur exclu. */
  private async countOf(query: ActivityQuery, scope: Scope, asOf: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<readonly { readonly total: bigint }[]>`
      SELECT count(*) AS total FROM growth.activity_events
      WHERE ${activitySnapshotWhereOf(query, scope.actorIds, asOf, scope.slice)}
    `;
    return Number(row?.total ?? 0n);
  }
}

/**
 * Sans `page`, une lecture sans curseur est la première page ; lue par curseur,
 * sa position n'est pas calculée — cf. `ActivityPageView.page`.
 */
function firstPageOr(query: ActivityQuery): number | null {
  return query.before === undefined ? 1 : null;
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
