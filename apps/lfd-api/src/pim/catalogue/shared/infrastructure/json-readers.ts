import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import {
  LOCALES,
  SOURCE_LOCALE,
  type LocalizedText,
} from "../domain/value-objects/localized-text.js";

/**
 * Lecture des colonnes `jsonb`.
 *
 * Postgres rend du JSON non typé : le convertir par un cast serait mentir au compilateur.
 * On **vérifie** la forme, et une donnée corrompue lève une erreur technique explicite
 * plutôt que de se propager en `undefined` trois couches plus loin.
 */
export class CorruptedRecordError extends TechnicalError {
  constructor(field: string) {
    super(
      "catalogue.record.corrupted",
      `Colonne « ${field} » illisible en base : forme inattendue.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readLocalizedColumn(value: unknown, field: string): LocalizedText {
  if (!isRecord(value) || typeof value["fr"] !== "string") {
    throw new CorruptedRecordError(field);
  }
  return typeof value["en"] === "string"
    ? { fr: value["fr"], en: value["en"] }
    : { fr: value["fr"] };
}

export function readStringMapColumn(value: unknown, field: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new CorruptedRecordError(field);
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new CorruptedRecordError(field);
    }
    result[key] = entry;
  }
  return result;
}

export function readStringArrayColumn(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new CorruptedRecordError(field);
  }
  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new CorruptedRecordError(field);
    }
    return entry;
  });
}

/**
 * Sens inverse : `LocalizedText` → valeur écrivable en `jsonb`.
 *
 * Une interface aux clés fixes n'est pas assignable à l'objet JSON attendu par
 * Prisma (pas d'index signature). On produit donc explicitement un `Record`,
 * plutôt que de forcer le type — le compilateur a raison, c'est la conversion
 * qui manquait.
 *
 * Elle se bouclait sur `fr` et `en`, **écrits en dur**. L'italien est entré dans
 * {@link LOCALES} sans passer ici : toute traduction italienne était donc jetée
 * à l'écriture, en silence, sur les noms comme sur les textes et les
 * alternatives d'image. L'écran l'affichait, l'enregistrement l'acceptait, et
 * la relecture suivante rendait deux langues sur trois.
 *
 * D'où la boucle : ouvrir une langue de plus ne touche plus ce fichier. C'est le
 * miroir exact de {@link optionalLocalizedColumn}, qui, lui, lisait déjà toutes
 * les langues — l'asymétrie était la panne.
 */
export function localizedColumn(text: LocalizedText): Record<string, string> {
  const column: Record<string, string> = {};
  for (const locale of LOCALES) {
    const value = (text[locale] ?? "").trim();
    if (value !== "") {
      column[locale] = value;
    }
  }
  // La langue source est garantie par le type ; on la repose pour que le
  // `Record` la porte même si un appelant a laissé passer un blanc.
  return { ...column, [SOURCE_LOCALE]: text[SOURCE_LOCALE] };
}

/** Violation d'unicité Prisma — le `23505` de Postgres, vu depuis l'ORM. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * **Quelle** contrainte a sauté, quand plusieurs gardent la même table.
 *
 * Une famille en a deux — le slug et le rang dans la fratrie — et elles ne se
 * traduisent pas par la même erreur métier : l'une se corrige en changeant de
 * nom, l'autre en réessayant. Rendre la même pour les deux ferait dire à
 * l'écran « ce nom est pris » à quelqu'un dont le nom est libre.
 *
 * Prisma range la cible dans `meta.target` : le nom de l'index pour une
 * contrainte qu'il ne connaît pas, la liste des champs pour les siennes.
 */
export function violatedConstraint(error: unknown): string | null {
  if (!isUniqueViolation(error) || typeof error !== "object" || error === null) {
    return null;
  }
  const meta: unknown = Reflect.get(error, "meta");
  if (typeof meta !== "object" || meta === null) {
    return null;
  }
  const target: unknown = Reflect.get(meta, "target");
  if (typeof target === "string") {
    return target;
  }
  return nameFromDriverMessage(meta);
}

/**
 * Le nom de la contrainte, lu dans le message du pilote.
 *
 * `meta.target` ne le porte que pour les contraintes que **Prisma connaît**
 * (celles du schéma). Les nôtres vivent en SQL : Prisma les voit passer sans
 * les nommer, et range les champs sous une forme tronquée
 * (`["(slug ->> 'fr'::text"]`) inutilisable pour décider. Le message d'origine
 * de Postgres, lui, dit exactement `unique constraint "category_slug_fr_unique"`.
 *
 * C'est du texte, donc fragile — mais c'est la seule information qui distingue
 * deux contraintes sur la même table, et une traduction fausse dirait à
 * l'utilisateur de corriger un champ qui va bien.
 */
function nameFromDriverMessage(meta: object): string | null {
  const adapterError: unknown = Reflect.get(meta, "driverAdapterError");
  const cause: unknown =
    typeof adapterError === "object" && adapterError !== null
      ? Reflect.get(adapterError, "cause")
      : null;
  const message: unknown =
    typeof cause === "object" && cause !== null ? Reflect.get(cause, "originalMessage") : null;
  if (typeof message !== "string") {
    return null;
  }
  return /unique constraint "([^"]+)"/u.exec(message)?.[1] ?? null;
}

/**
 * Relit une colonne `jsonb` localisée **facultative** — toutes ses langues, ou
 * `null` si la colonne est absente, illisible, ou sans langue source.
 *
 * Distincte de {@link readLocalizedColumn}, qui exige la valeur : ici l'absence
 * est un cas normal (une famille sans description). Partagée parce que deux
 * agrégats portent désormais des textes facultatifs, et qu'une seconde copie
 * finirait par ne plus lire les mêmes langues.
 */
export function optionalLocalizedColumn(value: unknown): LocalizedText | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const source = row[SOURCE_LOCALE];
  if (typeof source !== "string" || source.trim() === "") {
    return null;
  }
  const text: Record<string, string> = {};
  for (const locale of LOCALES) {
    const raw = row[locale];
    if (typeof raw === "string" && raw.trim() !== "") {
      text[locale] = raw;
    }
  }
  return { ...text, [SOURCE_LOCALE]: source };
}
