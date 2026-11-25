import type { z } from "zod";

import { clientNoteSchema, type ClientNote } from "@lfd/contracts";

/**
 * **Le schéma du BL client couvre exactement son type** (`documentation/commandes/reliquat/reliquat.md`, § 7, faille 2). Une version figée du bon passe par `clientNoteSchema` à
 * l'écriture ; un champ du type `ClientNote` que le schéma ignore ferait
 * refuser l'écriture du bon — donc la décision du départ — en production. Ce
 * test épingle l'égalité des chemins de clés, à tous les niveaux, dans les
 * deux sens : il ne compile pas si l'un prend du retard sur l'autre.
 *
 * Il vit ici, et non dans `@lfd/contracts`, parce que les specs du paquet ne
 * sont pas typées (`tsconfig.json` les exclut, ts-jest en `isolatedModules`) :
 * seul `pnpm --filter lfd-api typecheck:tests` le ferait rougir (vérifié le
 * 2026-11-25).
 */

/** Les chemins de clés d'une valeur JSON, `a.b.c`, tableaux traversés. */
type Paths<T, Prefix extends string = ""> =
  NonNullable<T> extends readonly (infer E)[]
    ? Paths<E, Prefix>
    : NonNullable<T> extends object
      ? {
          [K in keyof NonNullable<T> & string]-?:
            `${Prefix}${K}` | Paths<NonNullable<T>[K], `${Prefix}${K}.`>;
        }[keyof NonNullable<T> & string]
      : never;

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type SchemaPaths = Paths<z.infer<typeof clientNoteSchema>>;
type TypePaths = Paths<ClientNote>;

const covered: Equals<SchemaPaths, TypePaths> = true;

/** Les chemins de l'un absents de l'autre, pour un message lisible si le test rougit. */
type MissingFromSchema = Exclude<TypePaths, SchemaPaths>;
type MissingFromType = Exclude<SchemaPaths, TypePaths>;
const noneMissing: [MissingFromSchema, MissingFromType] extends [never, never] ? true : false =
  true;

describe("clientNoteSchema ↔ ClientNote", () => {
  it("ont les mêmes chemins de clés, à tous les niveaux", () => {
    expect(covered).toBe(true);
    expect(noneMissing).toBe(true);
  });
});
