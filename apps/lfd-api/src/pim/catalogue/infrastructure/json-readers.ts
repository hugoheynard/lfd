import { TechnicalError } from "../../../shared/errors/app-error.js";
import type { LocalizedText } from "../domain/value-objects/localized-text.js";
import type { BoutiqueChannels, SalesChannels } from "../domain/value-objects/sales-channels.js";

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
function readBoutiqueChannels(value: unknown, field: string): BoutiqueChannels {
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
  return {
    b1: readBoutiqueChannels(value["b1"] ?? {}, field),
    b2: readBoutiqueChannels(value["b2"] ?? {}, field),
  };
}

/** `SalesChannels` → objet JSON écrivable par Prisma (clés fixes, pas d'index signature). */
export function salesChannelsColumn(
  channels: SalesChannels,
): Record<string, Record<string, boolean>> {
  return {
    b1: { emporter: channels.b1.emporter, surPlace: channels.b1.surPlace },
    b2: { emporter: channels.b2.emporter, surPlace: channels.b2.surPlace },
  };
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
