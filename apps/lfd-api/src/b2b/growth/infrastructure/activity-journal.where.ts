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
  asOf: string | null = null,
): Prisma.Sql {
  return joined([
    ...filterClauses(query, actorIds),
    anchorClause(asOf),
    // Le curseur : strictement AVANT la dernière ligne rendue (ULID décroissant).
    query.before === undefined ? null : Prisma.sql`id < ${query.before}`,
  ]);
}

/**
 * Le même `WHERE` que {@link activityWhereOf}, **sans le curseur** : celui du
 * `total` d'une page, et de la recherche de l'ancre.
 *
 * Écrit ici et pas recomposé par l'appelant : un filtre ajouté aux pages mais
 * pas au compte ferait annoncer au paginateur des pages qui n'existent pas.
 */
export function activitySnapshotWhereOf(
  query: ActivityQuery,
  actorIds: readonly string[] | null = null,
  asOf: string | null = null,
): Prisma.Sql {
  return joined([...filterClauses(query, actorIds), anchorClause(asOf)]);
}

function filterClauses(
  query: ActivityQuery,
  actorIds: readonly string[] | null,
): (Prisma.Sql | null)[] {
  return [
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
  ];
}

/**
 * L'instantané : l'ancre et tout ce qui la précède. Par l'`id` seul, et c'est
 * juste ICI — l'ordre de lecture du journal d'activité EST l'`id` décroissant,
 * donc la borne découpe exactement ce que la première page a vu.
 */
function anchorClause(asOf: string | null): Prisma.Sql | null {
  return asOf === null ? null : Prisma.sql`id <= ${asOf}`;
}

function joined(clauses: readonly (Prisma.Sql | null)[]): Prisma.Sql {
  const kept = clauses.filter((clause): clause is Prisma.Sql => clause !== null);
  return kept.length === 0 ? Prisma.sql`TRUE` : Prisma.join(kept, " AND ");
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
 * La recherche libre : le nom figé de l'auteur ou une **valeur** de la charge
 * utile CONTIENNENT `q` — sans la casse ni les accents —, ou le sujet EST `q`.
 *
 * **Les valeurs, jamais les clés** : `jsonb_path_query_array` ne rend que les
 * chaînes et les nombres, à toute profondeur. Chercher « person » trouvait
 * presque tout le journal quand la charge se lisait en entier (jusqu'au
 * 2026-09-19) ; chercher « téléphone » trouve toujours une édition du
 * téléphone, parce que son libellé est une valeur.
 *
 * **Sans les accents, sans extension, sans dépendre de la locale** : la même
 * expression `lower(translate(…))` s'applique aux deux côtés de la comparaison,
 * avec UNE table de correspondance, ci-dessous. `translate` d'abord, et avec
 * les majuscules accentuées : `lower()` ne met en minuscules que l'ASCII sous
 * une locale `C`, et « É » y survivrait. Les ligatures (œ, æ) ne se déplient
 * pas — `translate` va d'un caractère à un caractère.
 *
 * Rien n'est stocké : une colonne générée aurait réécrit la table sous un
 * verrou bloquant toute écriture opposable (plan du journal, lot 2).
 */
function searchClause(q: string | undefined): Prisma.Sql | null {
  if (q === undefined) {
    return null;
  }
  const pattern = `%${escapeLike(q)}%`;
  const needle = folded(Prisma.sql`${pattern}`);
  return Prisma.sql`(${folded(Prisma.sql`coalesce(actor_name, '')`)} LIKE ${needle} ESCAPE '\\'
    OR ${folded(PAYLOAD_VALUES)} LIKE ${needle} ESCAPE '\\'
    OR subject_id = ${q})`;
}

/** Les accents qu'on retire, et leur lettre nue — alignées caractère par caractère. */
const ACCENTED = "ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝŸýÿ";
const PLAIN = "AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYYyy";

/** Les chaînes et les nombres de la charge, à toute profondeur, en un texte. */
const PAYLOAD_VALUES = Prisma.sql`jsonb_path_query_array(payload, 'strict $.** ? (@.type() == "string" || @.type() == "number")')::text`;

/** Sans accents puis sans casse — l'ordre compte, cf. `searchClause`. */
function folded(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(translate(${expression}, ${ACCENTED}, ${PLAIN}))`;
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
