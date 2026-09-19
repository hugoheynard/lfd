import { Injectable } from "@nestjs/common";

import { Prisma } from "../platform/database/client/client.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import {
  ProductHistoryJournal,
  UnknownHistoryAnchorError,
  type HistoryFact,
  type HistoryPage,
  type HistoryPageRequest,
  type HistoryThread,
} from "../pim/journal/product-history-journal.js";

/** Un ordre TOTAL : à la même milliseconde, l'`id` départage. */
const NEWEST_FIRST = Prisma.sql`ORDER BY occurred_at DESC, id DESC`;

/**
 * **L'historique d'une fiche, lu dans le journal d'activité.**
 *
 * Il vit à la racine de composition, avec les deux autres adaptateurs du
 * journal du référentiel (`journal.module.ts`), et pour la même raison : la
 * table appartient au schéma `growth`, que le référentiel ne voit pas. Il ne
 * lit QUE cette table — les identifiants de familles, de taux, d'ingrédients
 * et de révisions arrivent résolus par le référentiel. Aucune jointure
 * `growth` × `pim`.
 *
 * Tous les fils dans UNE requête, triée et paginée par la base : une fusion en
 * mémoire de listes par fil demanderait de lire chaque fil en entier pour en
 * montrer vingt lignes.
 *
 * L'instantané se découpe par le **couple** `(occurred_at, id)`, pas par
 * `id <= asOf` : l'`id` vient de l'horloge applicative, `occurred_at` de
 * l'instant de l'acte — deux horloges, deux ordres qui peuvent diverger. Seul
 * le couple reproduit l'ordre de lecture (cf. le journal tarifaire).
 */
@Injectable()
export class PrismaProductHistoryJournal extends ProductHistoryJournal {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(request: HistoryPageRequest): Promise<HistoryPage> {
    const scope = scopeOf(request.threads);
    if (scope === null) {
      return { facts: [], total: 0, asOf: null };
    }
    const asOf = await this.anchorOf(scope, request.asOf);
    if (asOf === null) {
      return { facts: [], total: 0, asOf: null };
    }
    const where = Prisma.sql`(${scope}) AND ${upToAnchor(asOf)}`;
    const [ids, total] = await Promise.all([
      this.prisma.$queryRaw<readonly { readonly id: string }[]>`
        SELECT id FROM growth.activity_events
        WHERE ${where}
        ${NEWEST_FIRST}
        LIMIT ${request.pageSize} OFFSET ${(request.page - 1) * request.pageSize}
      `,
      this.countOf(where),
    ]);
    // Les colonnes se relisent par Prisma — par clé primaire, donc sans coût —
    // pour rester typées jusqu'au port.
    const rows = await this.prisma.activityEvent.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: COLUMNS,
    });
    return { facts: rows.map(toFact), total, asOf };
  }

  /**
   * L'ancre : celle que l'appelant désigne — à condition qu'elle soit un fait
   * de CES fils —, ou le fait le plus récent des fils. `null` : rien encore.
   */
  private async anchorOf(scope: Prisma.Sql, asOf: string | null): Promise<string | null> {
    if (asOf === null) {
      const [latest] = await this.prisma.$queryRaw<readonly { readonly id: string }[]>`
        SELECT id FROM growth.activity_events WHERE ${scope} ${NEWEST_FIRST} LIMIT 1
      `;
      return latest?.id ?? null;
    }
    const [anchor] = await this.prisma.$queryRaw<readonly { readonly id: string }[]>`
      SELECT id FROM growth.activity_events WHERE (${scope}) AND id = ${asOf}
    `;
    if (anchor === undefined) {
      throw new UnknownHistoryAnchorError(asOf);
    }
    return anchor.id;
  }

  private async countOf(where: Prisma.Sql): Promise<number> {
    const [row] = await this.prisma.$queryRaw<readonly { readonly total: bigint }[]>`
      SELECT count(*) AS total FROM growth.activity_events WHERE ${where}
    `;
    return Number(row?.total ?? 0n);
  }
}

/** Les fils, joints par `OR` ; `null` si aucun ne porte de sujet. */
function scopeOf(threads: readonly HistoryThread[]): Prisma.Sql | null {
  const clauses = threads
    .filter((thread) => thread.subjectIds.length > 0)
    .map((thread) => threadClause(thread));
  return clauses.length === 0 ? null : Prisma.join(clauses, " OR ");
}

/**
 * Un fil : sa sorte de sujet, ses sujets, ses types. `starts_with` et non
 * `LIKE` : les préfixes portent des `_` (`product_category.`), qu'un `LIKE`
 * lirait comme un joker.
 */
function threadClause(thread: HistoryThread): Prisma.Sql {
  const types =
    "prefix" in thread.types
      ? Prisma.sql`starts_with(type, ${thread.types.prefix})`
      : Prisma.sql`type IN (${Prisma.join([...thread.types.exactly])})`;
  return Prisma.sql`(subject_type = ${thread.subjectType}
    AND subject_id IN (${Prisma.join([...thread.subjectIds])})
    AND ${types})`;
}

/** L'ancre et tout ce qui la suit dans l'ordre de lecture. */
function upToAnchor(asOf: string): Prisma.Sql {
  return Prisma.sql`(occurred_at, id) <= (
    SELECT anchor.occurred_at, anchor.id FROM growth.activity_events anchor WHERE anchor.id = ${asOf}
  )`;
}

const COLUMNS = {
  id: true,
  type: true,
  subjectType: true,
  subjectId: true,
  occurredAt: true,
  actorName: true,
  actorType: true,
  payload: true,
} as const;

function toFact(row: {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  occurredAt: Date;
  actorName: string | null;
  actorType: string;
  payload: unknown;
}): HistoryFact {
  return {
    id: row.id,
    type: row.type,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt,
    actorName: row.actorName,
    actorType: actorTypeOf(row.actorType),
    payload: row.payload,
  };
}

/**
 * La colonne est un texte libre en base ; le contrat en connaît trois. Une
 * valeur inattendue se lit `system` — c'est ce qu'écrit le recorder hors
 * requête —, jamais un membre ou un client qu'on inventerait.
 */
function actorTypeOf(value: string): HistoryFact["actorType"] {
  return value === "staff" || value === "customer" ? value : "system";
}
