import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * Lecture des colonnes `jsonb`, et des refus d'unicité de Prisma.
 *
 * Postgres rend du JSON non typé : le convertir par un cast serait mentir au
 * compilateur. On **vérifie** la forme, et une donnée corrompue lève une
 * erreur technique explicite plutôt que de se propager en `undefined` trois
 * couches plus loin.
 *
 * Monté du référentiel (`pim/catalogue/shared/infrastructure/json-readers.ts`)
 * le 2026-10-10 : rien ici ne parle de catalogue, et la médiathèque
 * l'empruntait au PIM, ce qui ouvrait `media→pim` sur tout le bloc.
 */
export class CorruptedRecordError extends TechnicalError {
  constructor(field: string) {
    super("record.corrupted", `Colonne « ${field} » illisible en base : forme inattendue.`);
  }
}

/** Un objet JSON, et pas un tableau ni `null`. */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStringMapColumn(value: unknown, field: string): Record<string, string> {
  if (!isJsonRecord(value)) {
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
 * deux contraintes sur la même table.
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
