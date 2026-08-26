import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { LocalizedText } from "../domain/value-objects/localized-text.js";
import type { ShopChannels, SalesChannels } from "../domain/value-objects/sales-channels.js";

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
 * Lecture **défensive** de la matrice de canaux. Un mode absent retombe sur
 * `false` — ce qui rend les lignes antérieures à la colonne lisibles (« rien
 * n'est vendu tant que non configuré ») ; un mode présent mais non booléen est
 * en revanche une corruption franche.
 */
function readShopChannels(value: unknown, field: string): ShopChannels {
  if (!isRecord(value)) {
    throw new CorruptedRecordError(field);
  }
  return {
    emporter: readModeFlag(value["emporter"], field),
    surPlace: readModeFlag(value["surPlace"], field),
  };
}

function readModeFlag(value: unknown, field: string): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new CorruptedRecordError(field);
  }
  return value;
}

export function readSalesChannelsColumn(value: unknown, field: string): SalesChannels {
  if (!isRecord(value)) {
    throw new CorruptedRecordError(field);
  }
  const raw = value["boutiques"];
  const boutiques: Record<string, ShopChannels> = {};
  if (isRecord(raw)) {
    for (const [id, modes] of Object.entries(raw)) {
      boutiques[id] = readShopChannels(modes ?? {}, field);
    }
  }
  return { boutiques, b2b: readModeFlag(value["b2b"], field) };
}

/** `SalesChannels` → objet JSON écrivable par Prisma (pas d'index signature). */
export function salesChannelsColumn(channels: SalesChannels): {
  boutiques: Record<string, Record<string, boolean>>;
  b2b: boolean;
} {
  const boutiques: Record<string, Record<string, boolean>> = {};
  for (const [id, modes] of Object.entries(channels.boutiques)) {
    boutiques[id] = { emporter: modes.emporter, surPlace: modes.surPlace };
  }
  return { boutiques, b2b: channels.b2b };
}

/**
 * Sens inverse : `LocalizedText` → valeur écrivable en `jsonb`.
 *
 * Une interface aux clés fixes n'est pas assignable à l'objet JSON attendu par Prisma
 * (pas d'index signature). On produit donc explicitement un `Record`, plutôt que de
 * forcer le type — le compilateur a raison, c'est la conversion qui manquait.
 */
export function localizedColumn(text: LocalizedText): Record<string, string> {
  return text.en === undefined ? { fr: text.fr } : { fr: text.fr, en: text.en };
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
