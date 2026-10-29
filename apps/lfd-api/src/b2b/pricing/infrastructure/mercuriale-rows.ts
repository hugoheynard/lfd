import { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import type {
  AmendmentOrigin,
  CompanyMercurialeState,
  MercurialeAmendment,
  MercurialeLine,
} from "../domain/entities/company-mercuriale.js";
import { CorruptedMercurialeError } from "../domain/pricing-errors.js";
import type { PricingTier } from "../domain/pricing-grid.js";

/**
 * **La ligne de base → l'agrégat.**
 *
 * La grille arrive en `jsonb`, c'est-à-dire en `unknown` : Prisma ne sait pas
 * plus que Postgres ce qu'il y a dedans. Elle est donc **vérifiée**, pas castée
 * — un `as MercurialeLine[]` aurait laissé une grille corrompue traverser la
 * frontière et sortir en prix.
 *
 * `reconstitute` ne revalide pas la cohérence de la grille (paliers décroissants,
 * SKU unique) : ce qui est en base y est déjà passé. Ce qui est vérifié ici est
 * la **forme**, qu'aucune écriture ne garantit contre une main dans la table.
 */
export function mercurialeFromRow(row: {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  readonly lines: unknown;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly createdBy: string;
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
  readonly amendments: readonly AmendmentRow[];
}): CompanyMercuriale {
  const state: CompanyMercurialeState = {
    id: row.id,
    companyId: row.companyId,
    label: row.label,
    lines: linesFromJson(row.id, row.lines),
    validFrom: row.validFrom,
    validTo: row.validTo,
    createdBy: row.createdBy,
    lifecycle: {
      pausedAt: row.pausedAt,
      pausedBy: row.pausedBy,
      archivedAt: row.archivedAt,
      archivedBy: row.archivedBy,
      archiveReason: row.archiveReason,
    },
    amendments: row.amendments.map((amendment) => amendmentFromRow(row.id, amendment)),
  };
  return CompanyMercuriale.reconstitute(state);
}

/** Une ligne de `company_mercuriale_amendments`, telle que Prisma la rend. */
export interface AmendmentRow {
  readonly id: string;
  readonly lines: unknown;
  readonly endedSkus: readonly string[];
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly reason: string;
  readonly origin: unknown;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/**
 * **L'ordre d'écriture**, que la requête doit demander : il décide de ce
 * qu'un arrêt touche (`mercuriale-amendment.ts`). Écrit une fois, partagé par
 * chaque lecture qui charge les avenants.
 */
export const AMENDMENT_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/** Les avenants non rangés, dans l'ordre d'écriture — l'`include` des lectures au présent. */
export const LIVE_AMENDMENTS = {
  amendments: { where: { archivedAt: null }, orderBy: AMENDMENT_ORDER },
};

function amendmentFromRow(mercurialeId: string, row: AmendmentRow): MercurialeAmendment {
  return {
    id: row.id,
    lines: linesFromJson(mercurialeId, row.lines),
    endedSkus: [...row.endedSkus],
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
    origin: originFromJson(mercurialeId, row.origin),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
    archivedBy: row.archivedBy,
    archiveReason: row.archiveReason,
  };
}

function originFromJson(id: string, value: unknown): AmendmentOrigin | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new CorruptedMercurialeError(id, "l'origine d'un avenant n'est pas un objet");
  }
  const origin: Record<string, unknown> = { ...value };
  const { kind, fromSku, fromMercurialeId } = origin;
  if (kind !== "detached" || typeof fromSku !== "string" || typeof fromMercurialeId !== "string") {
    throw new CorruptedMercurialeError(id, "l'origine d'un avenant n'a pas la forme attendue");
  }
  return { kind, fromSku, fromMercurialeId };
}

/** La grille du `jsonb`, vérifiée forme par forme. */
function linesFromJson(id: string, value: unknown): readonly MercurialeLine[] {
  if (!Array.isArray(value)) {
    throw new CorruptedMercurialeError(id, "la grille n'est pas un tableau");
  }
  return value.map((line) => lineFromJson(id, line));
}

function lineFromJson(id: string, value: unknown): MercurialeLine {
  if (typeof value !== "object" || value === null) {
    throw new CorruptedMercurialeError(id, "une ligne n'est pas un objet");
  }
  const line: Record<string, unknown> = { ...value };
  const { sku, tiers } = line;
  if (typeof sku !== "string" || !Array.isArray(tiers)) {
    throw new CorruptedMercurialeError(id, "une ligne n'a pas de `sku` ou pas de `tiers`");
  }
  return { sku, tiers: tiers.map((tier) => tierFromJson(id, tier)) };
}

function tierFromJson(id: string, value: unknown): PricingTier {
  if (typeof value !== "object" || value === null) {
    throw new CorruptedMercurialeError(id, "un palier n'est pas un objet");
  }
  const tier: Record<string, unknown> = { ...value };
  const { minQuantity, unitPriceMillicents } = tier;
  // `typeof` AVANT `Number.isInteger` : le second ne rétrécit pas `unknown`, et
  // sans le premier il faudrait un cast — c'est-à-dire rouvrir la porte que ce
  // fichier existe pour fermer.
  if (typeof minQuantity !== "number" || !Number.isInteger(minQuantity)) {
    throw new CorruptedMercurialeError(id, "un seuil de palier n'est pas un entier");
  }
  if (typeof unitPriceMillicents !== "number" || !Number.isInteger(unitPriceMillicents)) {
    throw new CorruptedMercurialeError(id, "un prix de palier n'est pas un entier");
  }
  return { minQuantity, unitPriceMillicents };
}
