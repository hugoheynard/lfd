import { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CatalogItemState, LocalDecision } from "../domain/entities/catalog-item.js";

/**
 * Le nom SQL de chaque champ de la décision.
 *
 * 🔴 **Ce tableau remplace l'étalement `{ ...state.decision }`** de l'ancien
 * `upsert`, et il en garde la propriété : une décision ajoutée à
 * `LocalDecision` sans colonne ici ne compile pas (`satisfies`). Les deux
 * colonnes de prix décidé n'y sont pas (lot D, 2026-10-15) : jamais écrites,
 * elles gardent ce qu'elles portaient. `is_featured` non plus depuis le
 * 2026-10-18 : recopiée vers ses deux audiences, colonne morte.
 */
const DECISION_SQL_NAMES = {
  isHidden: "is_hidden",
  isHiddenPublic: "is_hidden_public",
  isFeaturedPro: "is_featured_pro",
  isFeaturedPublic: "is_featured_public",
  decidedBy: "decided_by",
} as const satisfies Record<keyof LocalDecision, string>;

const DECISION_FIELDS = Object.keys(DECISION_SQL_NAMES).filter(
  (key): key is keyof LocalDecision => key in DECISION_SQL_NAMES,
);

/** Les écritures de décision d'un lot, déjà réparties — exposé pour les tests. */
export interface DecisionWrites {
  /** Plus rien de décidé : drapeaux remis à `false` sur une ligne existante. */
  readonly cleared: readonly string[];
  /** Une décision posée : la ligne est créée ou ses drapeaux réécrits. */
  readonly posed: readonly { readonly sku: string; readonly decision: LocalDecision }[];
}

export function decisionWritesOf(states: readonly CatalogItemState[]): DecisionWrites {
  const cleared: string[] = [];
  const posed: { sku: string; decision: LocalDecision }[] = [];
  for (const state of states) {
    if (state.decision === null) {
      cleared.push(state.facts.sku);
    } else {
      posed.push({ sku: state.facts.sku, decision: state.decision });
    }
  }
  return { cleared, posed };
}

function column(field: keyof LocalDecision | "sku" | "decidedAt"): Prisma.Sql {
  if (field === "sku") {
    return Prisma.raw(`"sku"`);
  }
  return Prisma.raw(field === "decidedAt" ? `"decided_at"` : `"${DECISION_SQL_NAMES[field]}"`);
}

/** L'upsert des décisions posées, en UNE instruction paramétrée. */
export function posedDecisionsStatement(
  posed: DecisionWrites["posed"],
  decidedAt: Date,
): Prisma.Sql {
  const values = posed.map(
    ({ sku, decision }) =>
      Prisma.sql`(${sku}, ${Prisma.join(DECISION_FIELDS.map((field) => Prisma.sql`${decision[field]}`))}, ${decidedAt})`,
  );
  const set = Prisma.join(
    [...DECISION_FIELDS, "decidedAt" as const].map(
      (field) => Prisma.sql`${column(field)} = EXCLUDED.${column(field)}`,
    ),
  );
  return Prisma.sql`
    INSERT INTO public.catalog_item_overrides
      (${column("sku")}, ${Prisma.join(DECISION_FIELDS.map(column))}, ${column("decidedAt")})
    VALUES ${Prisma.join(values)}
    ON CONFLICT (sku) DO UPDATE SET ${set}`;
}

/** Le client tel qu'une écriture de décision le demande — transaction comprise. */
type DecisionDb = Pick<PrismaService, "$executeRaw" | "catalogItemOverride">;

/**
 * **Les décisions d'un lot, écrites sans jamais supprimer de ligne** (lot D,
 * correction BLOQUANT de `vitruve`, 2026-10-15) — en DEUX requêtes au plus,
 * quel que soit le lot. Une écriture par article faisait croître la
 * transaction avec lui (P2028, 2026-10-17).
 *
 * Une ligne d'override porte peut-être un ancien prix décidé : plus lu, plus
 * écrit, mais conservé — rien ne se supprime en production sans ordre
 * (CLAUDE.md §0). D'où :
 *
 * - décision posée → upsert des seuls drapeaux, `decided_at` à l'instant du
 *   geste (le `@updatedAt` que Prisma posait, lu désormais sur l'horloge) ;
 * - plus rien de décidé → aucune ligne créée, et les drapeaux d'une ligne
 *   existante remis à `false` — seulement s'il y en avait un de levé, pour ne
 *   pas réécrire `decided_at` à chaque enregistrement.
 */
export async function writeDecisions(
  db: DecisionDb,
  states: readonly CatalogItemState[],
  decidedAt: Date,
): Promise<void> {
  const { cleared, posed } = decisionWritesOf(states);
  if (cleared.length > 0) {
    await db.catalogItemOverride.updateMany({
      where: {
        sku: { in: [...cleared] },
        OR: [
          { isHidden: true },
          { isHiddenPublic: true },
          { isFeaturedPro: true },
          { isFeaturedPublic: true },
        ],
      },
      data: {
        isHidden: false,
        isHiddenPublic: false,
        isFeaturedPro: false,
        isFeaturedPublic: false,
      },
    });
  }
  if (posed.length > 0) {
    await db.$executeRaw(posedDecisionsStatement(posed, decidedAt));
  }
}
