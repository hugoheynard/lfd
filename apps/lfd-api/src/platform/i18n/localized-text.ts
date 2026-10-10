import { CorruptedRecordError, isJsonRecord } from "../database/json-columns.js";
import { DomainError } from "../shared/errors/app-error.js";

/**
 * **Un texte en plusieurs langues**, dont une fait foi — la mécanique seule.
 *
 * 🔴 La LISTE des langues n'est pas ici, et c'est le cœur du découpage
 * (2026-10-10). Elle vit dans `@lfd/pim-contracts` (`LOCALES`,
 * `SOURCE_LOCALE`), et `platform/` n'importe aucun contrat métier : l'y
 * forcer lui ferait connaître les langues que parle le catalogue. Chaque bloc
 * passe donc SA liste en donnée ({@link Languages}), et la plateforme ne fait
 * que la boucler.
 *
 * Boucler, et jamais nommer : ces fonctions ont été écrites `fr` et `en` en
 * dur, l'italien est entré après, et toute traduction italienne était jetée à
 * l'écriture en silence. Ouvrir une langue ne doit toucher aucun fichier ici.
 */
export interface Languages<S extends string, L extends string> {
  /** La langue qui fait foi : toujours présente, jamais vide. */
  readonly source: S;
  /** Toutes les langues, source comprise. */
  readonly all: readonly (S | L)[];
}

/** La langue source obligatoire, les autres facultatives. */
export type Localized<S extends string, L extends string> = Readonly<
  Record<S, string> & Partial<Record<L, string>>
>;

export class InvalidLocalizedTextError extends DomainError {
  constructor(field: string, source: string) {
    super("localized_text.invalid", `Le champ « ${field} » doit avoir une valeur en ${source}.`);
  }
}

/**
 * Construit un texte traduisible, et refuse celui qui n'a pas sa langue source.
 *
 * Les valeurs sont rognées, et une chaîne vide est traitée comme ABSENTE : une
 * traduction vide n'est pas une traduction, et la garder ferait passer la fiche
 * pour traduite auprès de tout ce qui compte les langues renseignées.
 */
export function buildLocalized<S extends string, L extends string>(
  languages: Languages<S, L>,
  field: string,
  values: Partial<Record<S | L, string | undefined>>,
): Localized<S, L> {
  const text = filledOf(languages, values, "trimmed");
  if (!isLocalized(text, languages)) {
    throw new InvalidLocalizedTextError(field, languages.source);
  }
  return text;
}

/** Relit une colonne `jsonb` localisée **obligatoire** : sans langue source, elle est corrompue. */
export function readLocalizedColumn<S extends string, L extends string>(
  languages: Languages<S, L>,
  value: unknown,
  field: string,
): Localized<S, L> {
  // La source n'a qu'à être une CHAÎNE, vide comprise : c'est ce que la lecture
  // a toujours accepté, et un déménagement ne resserre pas un contrat de lecture.
  if (!isJsonRecord(value)) {
    throw new CorruptedRecordError(field);
  }
  const source: unknown = value[languages.source];
  if (typeof source !== "string") {
    throw new CorruptedRecordError(field);
  }
  const text: Record<string, string> = {
    ...filledOf(languages, value, "as-is"),
    [languages.source]: source,
  };
  if (!isLocalized(text, languages)) {
    throw new CorruptedRecordError(field);
  }
  return text;
}

/**
 * Relit une colonne `jsonb` localisée **facultative** — toutes ses langues, ou
 * `null` si la colonne est absente, illisible, ou sans langue source.
 */
export function readOptionalLocalizedColumn<S extends string, L extends string>(
  languages: Languages<S, L>,
  value: unknown,
): Localized<S, L> | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  const text = filledOf(languages, value, "as-is");
  return isLocalized(text, languages) ? text : null;
}

/**
 * Sens inverse : texte localisé → valeur écrivable en `jsonb`.
 *
 * Un type aux clés fixes n'est pas assignable à l'objet JSON qu'attend Prisma
 * (pas de signature d'index) : on produit donc explicitement un `Record`.
 */
export function localizedColumn<S extends string, L extends string>(
  languages: Languages<S, L>,
  text: Localized<S, L>,
): Record<string, string> {
  // La source est reposée telle quelle : le type la garantit, et un appelant
  // qui aurait laissé passer un blanc la retrouve, plutôt qu'une clé manquante.
  return { ...filledOf(languages, text, "trimmed"), [languages.source]: text[languages.source] };
}

/**
 * Les langues connues dont la valeur est une chaîne non blanche.
 *
 * `trimmed` à l'écriture, `as-is` à la lecture : on range des valeurs rognées,
 * et on relit ce qui est rangé sans le retoucher.
 */
function filledOf<S extends string, L extends string>(
  languages: Languages<S, L>,
  values: Partial<Record<S | L, unknown>> | Record<string, unknown>,
  mode: "trimmed" | "as-is",
): Record<string, string> {
  const text: Record<string, string> = {};
  for (const locale of languages.all) {
    const raw: unknown = Reflect.get(values, locale);
    if (typeof raw === "string" && raw.trim() !== "") {
      text[locale] = mode === "trimmed" ? raw.trim() : raw;
    }
  }
  return text;
}

/**
 * Un prédicat, et pas un transtypage : la langue source est VÉRIFIÉE présente.
 * Les autres clés sont des langues de la liste par construction ({@link filledOf}).
 */
function isLocalized<S extends string, L extends string>(
  text: Record<string, string>,
  languages: Languages<S, L>,
): text is Record<string, string> & Localized<S, L> {
  return typeof text[languages.source] === "string";
}
