import type { ActivityQuery } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { prefixesOf } from "../domain/activity-module.js";

/**
 * Les filtres du journal, en **SQL** — un fragment par filtre, joints par `AND`.
 *
 * Pourquoi pas le `where` de Prisma, qui les portait jusqu'au 2026-09-18 : la
 * recherche libre lit la charge utile **en texte** (`payload::text ILIKE`), et
 * Prisma ne sait pas l'exprimer. Construire la page à part pour ce seul cas
 * aurait fait deux jeux de filtres, l'un en Prisma et l'autre en SQL — et le
 * prochain filtre ajouté à l'un aurait cessé de se combiner à la recherche sans
 * que rien ne rougisse. Il n'y en a donc qu'un, ici.
 *
 * Toute valeur passe en **paramètre** lié, jamais concaténée.
 *
 * `actorIds` : toutes les références sous lesquelles l'acteur filtré a pu
 * écrire — son id de fiche et ses `sub`, actuel et anciens (
 * `architecture-journalisation.md` §12, D4). Sans elles, le filtre retombe sur la
 * seule égalité à `query.actorId`, et l'histoire d'une personne se coupe
 * entre ses identifiants.
 */
export function activityWhereOf(
  query: ActivityQuery,
  actorIds: readonly string[] | null = null,
): Prisma.Sql {
  const clauses = [
    moduleClause(query),
    query.type === undefined ? null : Prisma.sql`type = ${query.type}`,
    query.subjectType === undefined ? null : Prisma.sql`subject_type = ${query.subjectType}`,
    query.subjectId === undefined ? null : Prisma.sql`subject_id = ${query.subjectId}`,
    actorClause(query.actorId, actorIds),
    // Les bornes arrivent en ISO (le contrat l'impose) ; la colonne est un
    // `timestamp` sans fuseau écrit en UTC, d'où la conversion explicite.
    query.since === undefined ? null : Prisma.sql`occurred_at >= ${utc(query.since)}`,
    query.until === undefined ? null : Prisma.sql`occurred_at < ${utc(query.until)}`,
    searchClause(query.q),
    // Le curseur : strictement AVANT la dernière ligne rendue (ULID décroissant).
    query.before === undefined ? null : Prisma.sql`id < ${query.before}`,
  ].filter((clause): clause is Prisma.Sql => clause !== null);

  return clauses.length === 0 ? Prisma.sql`TRUE` : Prisma.join(clauses, " AND ");
}

/** L'acteur, sous TOUTES ses références connues — l'id demandé toujours compris. */
function actorClause(
  actorId: string | undefined,
  actorIds: readonly string[] | null,
): Prisma.Sql | null {
  if (actorId === undefined) {
    return null;
  }
  const ids = [...new Set([actorId, ...(actorIds ?? [])])];
  return Prisma.sql`actor_id IN (${Prisma.join(ids)})`;
}

/**
 * Le module, par préfixe de type. `starts_with` et non `LIKE` : les préfixes
 * portent des `_` (`staff_user.`), qu'un `LIKE` lirait comme un joker.
 */
function moduleClause(query: ActivityQuery): Prisma.Sql | null {
  if (query.module === undefined) {
    return null;
  }
  const prefixes = prefixesOf(query.module).map(
    (prefix) => Prisma.sql`starts_with(type, ${prefix})`,
  );
  return Prisma.sql`(${Prisma.join(prefixes, " OR ")})`;
}

/**
 * La recherche libre : le nom figé de l'auteur ou la charge utile en texte
 * CONTIENNENT `q` (casse ignorée, accents non), ou le sujet EST `q`.
 *
 * La charge utile se lit en entier, clés comprises : chercher « téléphone »
 * trouve les éditions qui ont touché un téléphone, et chercher « person »
 * trouverait presque tout — le prix d'un filtre qui ne connaît pas la forme de
 * chaque fait.
 */
function searchClause(q: string | undefined): Prisma.Sql | null {
  if (q === undefined) {
    return null;
  }
  const pattern = `%${escapeLike(q)}%`;
  return Prisma.sql`(actor_name ILIKE ${pattern} ESCAPE '\\'
    OR payload::text ILIKE ${pattern} ESCAPE '\\'
    OR subject_id = ${q})`;
}

/**
 * Neutralise les jokers d'un `LIKE` : `%`, `_`, et l'échappement lui-même.
 * Sans quoi chercher « 100% » ramènerait tout ce qui contient « 100 ».
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function utc(iso: string): Prisma.Sql {
  return Prisma.sql`(${iso}::timestamptz AT TIME ZONE 'UTC')`;
}
